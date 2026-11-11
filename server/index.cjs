const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db.cjs');
const { LEVEL_RANK, requireZtaAgentAuth } = require('./ztaVerifier.cjs');
const coreClient = require('./coreClient.cjs');

const app = express();
const PORT = Number(process.env.PORT || 8091);

const DIST_DIR = path.join(__dirname, '..', 'dist');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Modern Web Guidance (`security` §1.2): Bound frame embedding via CSP frame-ancestors
const allowedFrameAncestors = [
    "'self'",
    'http://localhost:8080',
    'http://localhost:5173',
    process.env.EA_CORE_PUBLIC_ORIGIN || ''
].filter(Boolean).join(' ');

app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedFrameAncestors}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Track previously active users in memory to avoid duplicate session_timeout audit logs
const knownIdleLoggedUsers = new Set();

// ==========================================
// 1. Public Discovery & PQC Manifest Endpoints
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        widgetId: 'virtual-office',
        version: '3.0.0',
        dbPath: db.DB_PATH
    });
});

app.get('/widget.manifest.json', (req, res) => {
    const distManifest = path.join(DIST_DIR, 'widget.manifest.json');
    const pubManifest = path.join(PUBLIC_DIR, 'widget.manifest.json');
    const target = fs.existsSync(distManifest) ? distManifest : pubManifest;
    if (!fs.existsSync(target)) {
        return res.status(404).json({ error: 'widget.manifest.json not found' });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.sendFile(target);
});

// ==========================================
// 2. ZTA-Protected Virtual Office Plugin APIs (/api/vo/*)
// ==========================================
app.get('/api/vo/config', requireZtaAgentAuth('read'), async (req, res) => {
    try {
        const defaults = await coreClient.fetchAssistantDefaults(req.agentToken, req.eaHostUrl);
        res.json(defaults);
    } catch (err) {
        console.error('[VO Server] GET /api/vo/config error:', err.message);
        res.json({ defaultAssistantPrompt: '', localAiEnabled: false });
    }
});

async function buildMergedUsersList(agentToken, loginUserId, hostUrl) {
    const [coreUsers, presenceRows, unreadRows] = await Promise.all([
        coreClient.fetchCoreUsers(agentToken, hostUrl),
        db.allAsync('SELECT * FROM vo_user_presence'),
        db.allAsync(
            `SELECT sender_id, COUNT(*) as cnt
             FROM vo_dm_messages
             WHERE receiver_id = ? AND is_read = 0
             GROUP BY sender_id`,
            [loginUserId]
        )
    ]);

    const presenceMap = new Map(presenceRows.map((r) => [Number(r.user_id), r]));
    const unreadMap = new Map(unreadRows.map((r) => [Number(r.sender_id), Number(r.cnt)]));

    const enriched = [];
    for (const cu of coreUsers) {
        const uid = Number(cu.id);
        const p = presenceMap.get(uid) || {};
        const isForcedOffline = Number(p.forced_offline || 0) === 1;
        const isCoreIdle = Boolean(cu.core_session_offline);
        const isOffline = isForcedOffline || isCoreIdle || String(p.status_text || '').toLowerCase() === 'offline';

        if (isCoreIdle && !knownIdleLoggedUsers.has(uid) && cu.last_active_at) {
            knownIdleLoggedUsers.add(uid);
            coreClient.logCoreAudit(agentToken, {
                eventType: 'session_timeout',
                action: 'ZTA Virtual Office Plugin Presence Idle Timeout',
                status: 'success',
                details: {
                    targetUserId: uid,
                    targetEmail: cu.email,
                    lastActiveAt: cu.last_active_at
                }
            }, hostUrl);
        } else if (!isCoreIdle && knownIdleLoggedUsers.has(uid)) {
            knownIdleLoggedUsers.delete(uid);
        }

        enriched.push({
            id: uid,
            email: cu.email,
            name: cu.name,
            avatar_url: cu.avatar_url,
            role: cu.role,
            native_language: cu.native_language || 'ja',
            last_active_at: cu.last_active_at,
            is_offline: isOffline,
            is_remote: p.is_remote ?? 0,
            current_room: p.current_room || 'open-space',
            status_text: isOffline ? 'Offline' : p.status_text || 'Active',
            unread_count: unreadMap.get(uid) || 0,
            assistant_work_start: p.assistant_work_start || '09:00',
            assistant_work_end: p.assistant_work_end || '17:30',
            assistant_break_start: p.assistant_break_start || '12:00',
            assistant_break_end: p.assistant_break_end || '13:00',
            assistant_meeting_buffer: p.assistant_meeting_buffer !== undefined && p.assistant_meeting_buffer !== null
                ? Number(p.assistant_meeting_buffer)
                : 30,
            assistant_prompt: p.assistant_prompt || ''
        });
    }

    return enriched;
}

app.get('/api/vo/users', requireZtaAgentAuth('read'), async (req, res) => {
    try {
        const enriched = await buildMergedUsersList(req.agentToken, req.user.id, req.eaHostUrl);
        res.json(enriched);
    } catch (err) {
        console.error('[VO Server] GET /api/vo/users error:', err.message);
        res.status(err.status || 500).json({ error: err.message });
    }
});

app.post('/api/vo/status', requireZtaAgentAuth('execute'), async (req, res) => {
    try {
        const { current_room, status_text, is_remote, targetUserId } = req.body || {};
        const uid = Number(targetUserId || req.user.id);

        const existing = await db.getAsync('SELECT * FROM vo_user_presence WHERE user_id = ?', [uid]);
        const nextRoom = current_room !== undefined ? current_room : existing?.current_room || 'open-space';
        const nextStatus = status_text !== undefined ? status_text : existing?.status_text || 'Active';
        const nextRemote = is_remote !== undefined ? Number(is_remote) : Number(existing?.is_remote ?? 0);
        const nextForcedOffline = String(nextStatus).toLowerCase() === 'offline' ? 1 : 0;

        await db.runAsync(
            `INSERT INTO vo_user_presence (
                user_id, current_room, status_text, is_remote, forced_offline,
                assistant_work_start, assistant_work_end, assistant_break_start, assistant_break_end,
                assistant_meeting_buffer, assistant_prompt, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(user_id) DO UPDATE SET
                current_room = excluded.current_room,
                status_text = excluded.status_text,
                is_remote = excluded.is_remote,
                forced_offline = excluded.forced_offline,
                updated_at = CURRENT_TIMESTAMP`,
            [
                uid,
                nextRoom,
                nextStatus,
                nextRemote,
                nextForcedOffline,
                existing?.assistant_work_start || '09:00',
                existing?.assistant_work_end || '17:30',
                existing?.assistant_break_start || '12:00',
                existing?.assistant_break_end || '13:00',
                existing?.assistant_meeting_buffer ?? 30,
                existing?.assistant_prompt || ''
            ]
        );

        res.json({
            success: true,
            status: {
                current_room: nextRoom,
                status_text: nextStatus,
                is_remote: nextRemote,
                is_offline: nextForcedOffline === 1
            }
        });
    } catch (err) {
        console.error('[VO Server] POST /api/vo/status error:', err.message);
        res.status(500).json({ error: 'Failed to update presence status' });
    }
});

app.post('/api/vo/settings', requireZtaAgentAuth('read'), async (req, res) => {
    const allowedActions = req.user.allowed_actions || [];
    const hasPermission =
        req.agentAuth.levelRank >= LEVEL_RANK.manage ||
        allowedActions.includes('*') ||
        allowedActions.includes('action:manage_assistant_rules');

    if (!hasPermission) {
        return res.status(403).json({ error: 'Permission denied. Requires manage level or action:manage_assistant_rules' });
    }

    try {
        const {
            assistant_work_start,
            assistant_work_end,
            assistant_break_start,
            assistant_break_end,
            assistant_meeting_buffer,
            assistant_prompt,
            override
        } = req.body || {};

        const userId = req.user.id;
        const existing = await db.getAsync('SELECT * FROM vo_user_presence WHERE user_id = ?', [userId]);
        const previousPrompt = existing?.assistant_prompt || '';
        const newPrompt = assistant_prompt !== undefined ? assistant_prompt : previousPrompt;

        let isCompliant = true;
        let warningReason = '';

        const isPromptChanged = assistant_prompt !== undefined && assistant_prompt !== previousPrompt;
        if (isPromptChanged) {
            const evalRes = await coreClient.checkWorkPolicyCompliance(req.agentToken, newPrompt, req.eaHostUrl);
            isCompliant = evalRes.compliant !== false;
            warningReason = evalRes.reason || '';
        }

        if (!isCompliant && override !== true) {
            await coreClient.logCoreAudit(req.agentToken, {
                eventType: 'policy_compliance',
                action: 'update_assistant_settings',
                status: 'blocked',
                details: {
                    policy_compliance: 'SUSPECTED_VIOLATION',
                    warning_reason: warningReason,
                    previous_prompt: previousPrompt,
                    new_prompt: newPrompt,
                    override: false
                }
            }, req.eaHostUrl);
            return res.json({ status: 'warning', reason: warningReason });
        }

        await db.runAsync(
            `INSERT INTO vo_user_presence (
                user_id, current_room, status_text, is_remote, forced_offline,
                assistant_work_start, assistant_work_end, assistant_break_start, assistant_break_end,
                assistant_meeting_buffer, assistant_prompt, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(user_id) DO UPDATE SET
                assistant_work_start = COALESCE(?, vo_user_presence.assistant_work_start),
                assistant_work_end = COALESCE(?, vo_user_presence.assistant_work_end),
                assistant_break_start = COALESCE(?, vo_user_presence.assistant_break_start),
                assistant_break_end = COALESCE(?, vo_user_presence.assistant_break_end),
                assistant_meeting_buffer = COALESCE(?, vo_user_presence.assistant_meeting_buffer),
                assistant_prompt = COALESCE(?, vo_user_presence.assistant_prompt),
                updated_at = CURRENT_TIMESTAMP`,
            [
                userId,
                existing?.current_room || 'open-space',
                existing?.status_text || 'Active',
                existing?.is_remote ?? 0,
                existing?.forced_offline ?? 0,
                assistant_work_start ?? existing?.assistant_work_start ?? '09:00',
                assistant_work_end ?? existing?.assistant_work_end ?? '17:30',
                assistant_break_start ?? existing?.assistant_break_start ?? '12:00',
                assistant_break_end ?? existing?.assistant_break_end ?? '13:00',
                assistant_meeting_buffer ?? existing?.assistant_meeting_buffer ?? 30,
                assistant_prompt ?? existing?.assistant_prompt ?? '',
                assistant_work_start ?? null,
                assistant_work_end ?? null,
                assistant_break_start ?? null,
                assistant_break_end ?? null,
                assistant_meeting_buffer ?? null,
                assistant_prompt ?? null
            ]
        );

        await coreClient.logCoreAudit(req.agentToken, {
            eventType: 'policy_compliance',
            action: 'update_assistant_settings',
            status: override ? 'override' : 'success',
            details: {
                policy_compliance: warningReason ? 'SUSPECTED_VIOLATION' : 'COMPLIANT',
                warning_reason: warningReason || null,
                previous_prompt: previousPrompt,
                new_prompt: newPrompt,
                override: Boolean(override)
            }
        }, req.eaHostUrl);

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('[VO Server] POST /api/vo/settings error:', err.message);
        res.status(err.status || 500).json({ error: err.message });
    }
});

app.post('/api/vo/generate-avatar', requireZtaAgentAuth('execute'), async (req, res) => {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const avatarSeeds = [
        'https://api.dicebear.com/7.x/pixel-art/svg?seed=John',
        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Jane',
        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Minoru',
        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Inui',
        'https://api.dicebear.com/7.x/pixel-art/svg?seed=AI',
        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Nico',
        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Leo',
        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Mimi'
    ];
    const randomAvatar = avatarSeeds[Math.floor(Math.random() * avatarSeeds.length)];

    try {
        await coreClient.updateCoreUserAvatar(req.agentToken, userId, randomAvatar, req.eaHostUrl);
        res.json({ success: true, avatar_url: randomAvatar });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ==========================================
// 3. Direct Message & Executive AI Assistant APIs
// ==========================================
app.get('/api/vo/dm/messages', requireZtaAgentAuth('read'), async (req, res) => {
    const loginUserId = req.user.id;
    const targetUserId = parseInt(req.query.targetUserId, 10);
    if (!targetUserId) {
        return res.status(400).json({ error: 'targetUserId is required' });
    }

    try {
        const rows = await db.allAsync(
            `SELECT * FROM vo_dm_messages
             WHERE (sender_id = ? AND receiver_id = ?)
                OR (sender_id = ? AND receiver_id = ?)
             ORDER BY created_at ASC`,
            [loginUserId, targetUserId, targetUserId, loginUserId]
        );

        await db.runAsync(
            'UPDATE vo_dm_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
            [targetUserId, loginUserId]
        );

        res.json({ messages: rows });
    } catch (err) {
        console.error('[VO Server] GET /api/vo/dm/messages error:', err.message);
        res.status(500).json({ error: 'Failed to fetch DM messages' });
    }
});

app.get('/api/vo/dm/unread', requireZtaAgentAuth('read'), async (req, res) => {
    const loginUserId = req.user.id;
    try {
        const rows = await db.allAsync(
            `SELECT id, sender_id, text, created_at
             FROM vo_dm_messages
             WHERE receiver_id = ? AND is_read = 0 AND sender_type = 'user'
             ORDER BY created_at DESC`,
            [loginUserId]
        );

        if (rows.length === 0) {
            return res.json({ unread: [] });
        }

        const coreUsers = await coreClient.fetchCoreUsers(req.agentToken, req.eaHostUrl);
        const userMap = new Map(coreUsers.map((u) => [Number(u.id), u]));

        const enrichedUnread = rows.map((m) => {
            const sender = userMap.get(Number(m.sender_id));
            return {
                id: m.id,
                sender_id: m.sender_id,
                text: m.text,
                created_at: m.created_at,
                sender_name: sender?.name || `User #${m.sender_id}`,
                sender_avatar: sender?.avatar_url || null
            };
        });

        res.json({ unread: enrichedUnread });
    } catch (err) {
        console.error('[VO Server] GET /api/vo/dm/unread error:', err.message);
        res.status(500).json({ error: 'Failed to fetch unread messages' });
    }
});

app.post('/api/vo/dm/messages', requireZtaAgentAuth('execute'), async (req, res) => {
    const loginUserId = req.user.id;
    const { receiverId, text } = req.body || {};
    const targetId = Number(receiverId);

    if (!targetId || !text) {
        return res.status(400).json({ error: 'receiverId and text are required' });
    }

    const MAX_ACTIVE_SESSIONS = 2;

    try {
        const sessionRow = await db.getAsync(
            `SELECT COUNT(DISTINCT partner_id) as active_count FROM (
                SELECT receiver_id as partner_id FROM vo_dm_messages
                WHERE sender_id = ? AND created_at >= datetime('now', '-10 minutes') AND sender_type = 'user'
                UNION
                SELECT sender_id as partner_id FROM vo_dm_messages
                WHERE receiver_id = ? AND created_at >= datetime('now', '-10 minutes') AND sender_type = 'user'
            )
            WHERE partner_id != ?`,
            [targetId, targetId, loginUserId]
        );

        const activeCount = Number(sessionRow?.active_count || 0);
        const isSessionLimitExceeded = activeCount >= MAX_ACTIVE_SESSIONS;
        const initialIsRead = isSessionLimitExceeded ? 1 : 0;

        const mergedUsers = await buildMergedUsersList(req.agentToken, loginUserId, req.eaHostUrl);
        const targetUser = mergedUsers.find((u) => Number(u.id) === targetId);
        if (!targetUser) {
            return res.status(404).json({ error: 'Target user not found' });
        }

        const senderLang = req.user.native_language || 'ja';
        const targetLang = targetUser.native_language || 'ja';
        const isDifferentLang = senderLang !== targetLang;
        const targetLangName = targetLang === 'en' ? 'English' : targetLang === 'es' ? 'Spanish' : 'Japanese';
        const senderLangName = senderLang === 'en' ? 'English' : senderLang === 'es' ? 'Spanish' : 'Japanese';
        const senderLangFlag = senderLang === 'en' ? '🇺🇸' : senderLang === 'es' ? '🇪🇸' : '🇯🇵';
        const targetLangFlag = targetLang === 'en' ? '🇺🇸' : targetLang === 'es' ? '🇪🇸' : '🇯🇵';

        let textToSave = text;
        if (isDifferentLang) {
            try {
                const transRes = await coreClient.translateViaCore(req.agentToken, {
                    text,
                    senderLangName,
                    targetLangName
                }, req.eaHostUrl);
                if (transRes.translated) {
                    textToSave = `🌐 [Gemma 4 Translated (${senderLangFlag} ➔ ${targetLangFlag})]\n${transRes.translated}\n\n(${senderLangFlag} 原文: ${text})`;
                }
            } catch (tErr) {
                console.error('[VO Server] Translation skipped:', tErr.message);
            }
        }

        const insertRes = await db.runAsync(
            "INSERT INTO vo_dm_messages (sender_id, receiver_id, sender_type, text, is_read) VALUES (?, ?, 'user', ?, ?)",
            [loginUserId, targetId, textToSave, initialIsRead]
        );
        const insertedId = insertRes.lastID;

        if (isSessionLimitExceeded) {
            const busyReply = `ただいま、${targetUser.name} は複数のチャットが立ち上がっているため、対応できません。しばらく経ってから試してください。`;
            setTimeout(() => {
                db.runAsync(
                    "INSERT INTO vo_dm_messages (sender_id, receiver_id, sender_type, text, is_read) VALUES (?, ?, 'assistant', ?, 1)",
                    [targetId, loginUserId, busyReply]
                ).catch(() => {});
            }, 800);
            return res.json({ status: 'ok', messageId: insertedId });
        }

        // Calculate common Google Calendar free slots via EA-Core Host API
        let freeSlotsText = 'なし';
        let isOvertime = false;
        let isBufferMitigated = false;

        try {
            const slotResult = await coreClient.fetchCommonFreeSlots(req.agentToken, targetUser.email, {
                workStart: targetUser.assistant_work_start,
                workEnd: targetUser.assistant_work_end,
                meetingBuffer: targetUser.assistant_meeting_buffer
            }, req.eaHostUrl);
            isOvertime = Boolean(slotResult.isOvertime);
            isBufferMitigated = Boolean(slotResult.isBufferMitigated);
            if (Array.isArray(slotResult.slots) && slotResult.slots.length > 0) {
                freeSlotsText = slotResult.slots
                    .slice(0, 3)
                    .map((slot) => {
                        const opts = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false };
                        const startStr = new Date(slot.start).toLocaleTimeString('ja-JP', opts);
                        const endStr = new Date(slot.end).toLocaleTimeString('ja-JP', opts);
                        return `・ ${startStr} 〜 ${endStr}`;
                    })
                    .join('\n');
            }
        } catch (slotErr) {
            console.error('[VO Server] Free slots lookup skipped:', slotErr.message);
        }

        const isTargetOffline = Boolean(targetUser.is_offline);
        let replyText = '';
        let isAssistant = false;

        // Try AI Assistant auto-reply via EA-Core Host API (Local AI Gemma 4 -> Cloud AI fallback)
        try {
            const aiReply = await coreClient.generateAssistantReplyViaCore(req.agentToken, {
                senderName: req.user.name,
                senderLangName,
                targetName: targetUser.name,
                targetRole: targetUser.role,
                targetLangName,
                isDifferentLang,
                currentRoom: isTargetOffline ? 'offline' : targetUser.current_room,
                presenceStatus: isTargetOffline
                    ? 'Offline (Currently logged out / session timed out)'
                    : targetUser.status_text || 'Active',
                workStart: targetUser.assistant_work_start || '09:00',
                workEnd: targetUser.assistant_work_end || '17:30',
                freeSlotsText,
                customAssistantPrompt: targetUser.assistant_prompt || '',
                messageText: text
            }, req.eaHostUrl);

            if (aiReply && aiReply.replyText) {
                replyText =
                    aiReply.provider === 'local' && isDifferentLang
                        ? `🤖 [AI Assistant (Gemma 4 🦙)]\n${aiReply.replyText}`
                        : aiReply.replyText;
                isAssistant = true;
            }
        } catch (aiErr) {
            console.error('[VO Server] Host AI assistant reply fallback:', aiErr.message);
        }

        // Deterministic rule-based assistant fallback when LLM keys are unconfigured
        if (!replyText) {
            const userText = String(text || '');
            const isMeetingRequest =
                userText.includes('打ち合わせ') ||
                userText.includes('会議') ||
                userText.includes('ミーティング') ||
                userText.includes('話');

            if (isTargetOffline) {
                isAssistant = true;
                if (isMeetingRequest && freeSlotsText !== 'なし') {
                    replyText = `現在 ${targetUser.name} はオフライン（退席中）のため、代わりにアシスタントの私が日程を調整します。本日共通で空いている時間は以下になります。仮登録されますか？\n${freeSlotsText}\n➔ [💻 ミーティングを仮調整する]`;
                } else {
                    replyText = `現在 ${targetUser.name} はオフラインのため、代わりにアシスタントの私がご用件を承ります。次回ログイン時に伝言をお届けしますね！🙇‍♂️`;
                }
            } else if (targetUser.current_room === 'focus-zone') {
                isAssistant = true;
                replyText = `すみません、現在 ${targetUser.name} は「集中ゾーン」で別作業に没頭しているため、応答できません。代わりにアシスタントの私が後ほど伝言を伝えておきますね！🙇‍♂️`;
            } else if (targetUser.current_room === 'remote') {
                isAssistant = true;
                if (isMeetingRequest) {
                    if (freeSlotsText !== 'なし') {
                        if (isOvertime) {
                            const workStartFormatted = targetUser.assistant_work_start || '09:00';
                            const workEndFormatted = targetUser.assistant_work_end || '17:30';
                            const bufferMin = targetUser.assistant_meeting_buffer ?? 30;
                            replyText = `${targetUser.name} の就業時間は ${workStartFormatted}〜${workEndFormatted} まで（最終受付は終了 ${bufferMin}分前）となっておりますが、本日就業時間内に共通の空き時間がございません。もしお急ぎでしたら時間外になりますが以下の時間帯で調整可能か、本人（BOSS）に確認いたしますがいかがでしょうか？\n${freeSlotsText}\n➔ [💻 時間外でBOSSに確認する]`;
                        } else if (isBufferMitigated) {
                            replyText = `${targetUser.name} はリモートワーク中のため、代わりにアシスタントの私が日程を調整します。就業終了間際（設定されたバッファ時間内）になりますが、本日就業時間内に共通で空いている時間は以下になります。仮登録されますか？\n${freeSlotsText}\n➔ [💻 ミーティングを仮調整する]`;
                        } else {
                            replyText = `${targetUser.name} はリモートワーク中のため、代わりにアシスタントの私が日程を調整します。お二人のカレンダーを確認したところ、本日共通で空いている時間は以下になります。仮登録されますか？\n${freeSlotsText}\n➔ [💻 ミーティングを仮調整する]`;
                        }
                    } else {
                        replyText = `${targetUser.name} はリモートワーク中のため、代わりにアシスタントの私が日程を調整します。本日中はお互いのカレンダーに共通して空いている時間帯（30分以上）が見当たりませんでした。個別調整が必要ですので、後ほど伝えておきます！`;
                    }
                } else {
                    replyText = `${targetUser.name} は現在リモート勤務中ですが、アシスタントの私から本人にチャットが届いている旨をプッシュ通知で伝えておきますね！ご用件をこのままお書きください。`;
                }
            } else if (targetUser.current_room && targetUser.current_room.startsWith('meeting-room')) {
                isAssistant = true;
                replyText = `現在 ${targetUser.name} は「会議室」で打ち合わせ中のため、代理でアシスタントが受け付けております。会議が終わり次第、本人が対応いたします。`;
            }
        }

        if (replyText) {
            setTimeout(() => {
                db.runAsync(
                    'INSERT INTO vo_dm_messages (sender_id, receiver_id, sender_type, text, is_read) VALUES (?, ?, ?, ?, 1)',
                    [targetId, loginUserId, isAssistant ? 'assistant' : 'user', replyText]
                ).catch((e) => console.error('[VO Server] Auto-reply insert error:', e));
            }, 800);
        }

        res.json({ status: 'ok', messageId: insertedId });
    } catch (err) {
        console.error('[VO Server] POST /api/vo/dm/messages error:', err.message);
        res.status(err.status || 500).json({ error: err.message });
    }
});

app.post('/api/vo/calendar/events', requireZtaAgentAuth('execute'), async (req, res) => {
    try {
        const result = await coreClient.createCalendarEvent(req.agentToken, req.body || {}, req.eaHostUrl);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ==========================================
// 4. Static Built Plugin Assets Serving
// ==========================================
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
}

app.listen(PORT, () => {
    console.log(`[EA-Widget VirtualOffice] Plugin Server listening on http://localhost:${PORT}`);
});
