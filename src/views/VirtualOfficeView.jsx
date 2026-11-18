import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import VirtualOffice3DCanvas from '../components/office3d/VirtualOffice3DCanvas.jsx';
import MiniMapHUD from '../components/office3d/MiniMapHUD.jsx';
import DmChatView from './DmChatView.jsx';

const DEFAULT_AVATAR_SEEDS = ['Oliver', 'Jake', 'Charlie', 'Luna', 'Bella', 'Milo', 'Coco', 'Cookie'];

const EMOTE_PRESETS = [
  { id: 'greet', label: '👋 挨拶', title: '挨拶する' },
  { id: 'break', label: '☕ 休憩', title: 'ちょっと休憩中' },
  { id: 'focus', label: '💻 集中', title: '作業に集中' },
  { id: 'nice', label: '🎉 ナイス', title: 'ナイス！' },
  { id: 'chat', label: '💬 雑談OK', title: 'いつでも雑談OK' }
];

const MEETING_ROOM_A_TARGET = { x: -9.6, z: -4.2, label: 'Meeting Room A' };
const MEETING_ROOM_B_TARGET = { x: 9.6, z: -4.2, label: 'Meeting Room B' };

const ROOMS = {
  'open-space': { name: '🌳 Open Space', desc: '会話自由・カジュアルな相談向け', color: 'border-emerald-500/30 bg-emerald-500/5' },
  'meeting-room-a': { name: '💬 Meeting Room A', desc: '進行中のミーティングスペース', color: 'border-indigo-500/30 bg-indigo-500/5' },
  'meeting-room-b': { name: '🎥 Meeting Room B', desc: 'クライアントやチーム間での対話', color: 'border-violet-500/30 bg-violet-500/5' },
  'focus-zone': { name: '🤫 Focus Zone', desc: '集中作業中（緊急時のみチャット推奨）', color: 'border-amber-500/30 bg-amber-500/5' },
  'remote': { name: '🏡 Remote (自宅勤務)', desc: '自宅からログイン中のメンバー', color: 'border-cyan-500/30 bg-cyan-500/5' }
};

export default function VirtualOfficeView({ ctx }) {
  const { user, eaFetch, openSubWindow, hasMinLevel } = ctx;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [myStatus, setMyStatus] = useState({ room: 'open-space', text: 'Active' });
  const [generatingAvatarId, setGeneratingAvatarId] = useState(null);
  const [error, setError] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [defaultAssistantPrompt, setDefaultAssistantPrompt] = useState('');
  const [activeSettingsTab, setActiveSettingsTab] = useState('basic');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('vo_view_mode') === '2d' ? '2d' : '3d';
    } catch {
      return '3d';
    }
  });
  const [chatTargetUser, setChatTargetUser] = useState(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [viewAnalytics, setViewAnalytics] = useState(null);

  // 3D HUD & AI Meeting Assistant States
  const [autoMoveTarget, setAutoMoveTarget] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [nearbyUser, setNearbyUser] = useState(null);
  const [myEmote, setMyEmote] = useState(null);
  const [transientBubbles, setTransientBubbles] = useState({});
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [testMeetings, setTestMeetings] = useState([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [assistantNotification, setAssistantNotification] = useState(null);
  const [isMeetingWidgetCollapsed, setIsMeetingWidgetCollapsed] = useState(false);

  const settingsDialogRef = useRef(null);
  const activeStartRef = useRef(Date.now());
  const viewModeRef = useRef(viewMode);
  const emoteTimeoutRef = useRef(null);
  const bubbleTimeoutsRef = useRef(new Map());
  const greetCooldownRef = useRef(new Map());
  const notifiedEventIdsRef = useRef(new Set());

  const canExecute = hasMinLevel('execute');
  const allowedActions = user?.allowed_actions || [];
  const canManageRules = hasMinLevel('manage') ||
    allowedActions.includes('*') ||
    allowedActions.includes('action:manage_assistant_rules');

  // Modern Web Guidance (`light-dismiss-a-dialog`):
  // Sync native <dialog closedby="any"> via showModal() / close() + fallback for browsers lacking closedBy.
  useEffect(() => {
    const dialog = settingsDialogRef.current;
    if (!dialog) return;

    if (isSettingsModalOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isSettingsModalOpen]);

  useEffect(() => {
    const dialog = settingsDialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const handleBackdropFallback = (e) => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;
      if (clickedOutside) {
        dialog.close();
      }
    };
    dialog.addEventListener('click', handleBackdropFallback);
    return () => dialog.removeEventListener('click', handleBackdropFallback);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      try {
        const res = await eaFetch('/api/vo/config');
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.defaultAssistantPrompt) {
            setDefaultAssistantPrompt(data.defaultAssistantPrompt);
          }
        }
      } catch (err) {
        console.error('[VirtualOfficePlugin] Failed to load config:', err);
      }
    };
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [eaFetch]);

  useEffect(() => {
    if (selectedUser && selectedUser.id === user?.id) {
      setAssistantPrompt(selectedUser.assistant_prompt || '');
    }
  }, [selectedUser, user?.id]);

  const loadUsers = useCallback(async (isFirst = false) => {
    try {
      if (isFirst) setLoading(true);
      const res = await eaFetch('/api/vo/users');
      if (!res.ok) {
        let errMsg = '在席メンバー情報の取得に失敗しました';
        let errCode = '';
        try {
          const data = await res.json();
          errMsg = data.error || errMsg;
          errCode = data.code || '';
        } catch {
          // ignore parse error
        }
        if (res.status === 401 && errCode === 'SESSION_LOCKED') {
          return;
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      setError('');

      const processedUsers = (Array.isArray(data) ? data : []).map((u, idx) => {
        let avatarUrl = u.avatar_url;
        let isPlaceholder = false;
        if (!avatarUrl) {
          const seed = DEFAULT_AVATAR_SEEDS[idx % DEFAULT_AVATAR_SEEDS.length];
          avatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;
          isPlaceholder = true;
        }

        const isPhoto =
          avatarUrl.includes('googleusercontent.com') ||
          avatarUrl.includes('lh3.google') ||
          (avatarUrl.startsWith('http') && !avatarUrl.includes('dicebear.com'));

        return {
          ...u,
          avatar_url: avatarUrl,
          is_placeholder_avatar: isPlaceholder,
          is_photo_avatar: isPhoto
        };
      });

      setUsers(processedUsers);
      setSelectedUser((prev) => {
        if (!prev) return null;
        return processedUsers.find((u) => u.id === prev.id) || prev;
      });

      if (user?.id) {
        const meInDb = processedUsers.find((u) => u.id === user.id);
        if (meInDb) {
          setMyStatus({
            room: meInDb.current_room || 'open-space',
            text: meInDb.status_text || 'Active'
          });
        }
      }
    } catch (err) {
      console.error('[VirtualOfficePlugin] loadUsers error:', err);
      setError(err.message);
    } finally {
      if (isFirst) setLoading(false);
    }
  }, [eaFetch, user?.id]);

  useEffect(() => {
    loadUsers(true);
    const timer = setInterval(() => {
      loadUsers(false);
    }, 3000);
    return () => clearInterval(timer);
  }, [loadUsers]);

  const handleGenerateAvatar = async (userId) => {
    if (!canExecute) return;
    try {
      setGeneratingAvatarId(userId);
      const res = await eaFetch('/api/vo/generate-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'AIアバター生成に失敗しました');
      }
      const data = await res.json();

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, avatar_url: data.avatar_url, is_photo_avatar: false, is_placeholder_avatar: false }
            : u
        )
      );
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser((prev) => ({
          ...prev,
          avatar_url: data.avatar_url,
          is_photo_avatar: false,
          is_placeholder_avatar: false
        }));
      }
      alert('AIアバターの生成が完了しました！');
    } catch (err) {
      alert(err.message);
    } finally {
      setGeneratingAvatarId(null);
    }
  };

  const handleUpdateMyStatus = async (room, text) => {
    if (!canExecute) return;
    setMyStatus({ room, text });
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user?.id
          ? { ...u, current_room: room, status_text: text, is_remote: room === 'remote' ? 1 : 0 }
          : u
      )
    );

    try {
      const res = await eaFetch('/api/vo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_room: room,
          status_text: text,
          is_remote: room === 'remote' ? 1 : 0
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'ステータス更新に失敗しました');
      }
    } catch (err) {
      console.error('[VirtualOfficePlugin] Status update failed:', err);
      setError(err.message);
    }
  };

  const handleUpdateSettings = async (
    workStart,
    workEnd,
    breakStart,
    breakEnd,
    meetingBuffer,
    promptValue,
    override = false
  ) => {
    const targetPrompt = promptValue !== undefined ? promptValue : (selectedUser?.assistant_prompt || '');

    try {
      const res = await eaFetch('/api/vo/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistant_work_start: workStart,
          assistant_work_end: workEnd,
          assistant_break_start: breakStart,
          assistant_break_end: breakEnd,
          assistant_meeting_buffer: meetingBuffer,
          assistant_prompt: targetPrompt,
          override
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'AIアシスタント設定の更新に失敗しました');
      }

      const data = await res.json();
      if (data.status === 'warning') {
        const confirmSave = window.confirm(
          `⚠️ 就業規則違反の疑いがあります：\n\n${data.reason}\n\nこのまま強制保存しますか？\n（この操作は監査ログに記録されます）`
        );
        if (confirmSave) {
          return await handleUpdateSettings(workStart, workEnd, breakStart, breakEnd, meetingBuffer, promptValue, true);
        }
        loadUsers(false);
        return false;
      }

      setUsers((prevUsers) =>
        prevUsers.map((u) =>
          u.id === user?.id
            ? {
                ...u,
                assistant_work_start: workStart,
                assistant_work_end: workEnd,
                assistant_break_start: breakStart,
                assistant_break_end: breakEnd,
                assistant_meeting_buffer: meetingBuffer,
                assistant_prompt: targetPrompt
              }
            : u
        )
      );

      if (selectedUser && selectedUser.id === user?.id) {
        setSelectedUser((prev) => ({
          ...prev,
          assistant_work_start: workStart,
          assistant_work_end: workEnd,
          assistant_break_start: breakStart,
          assistant_break_end: breakEnd,
          assistant_meeting_buffer: meetingBuffer,
          assistant_prompt: targetPrompt
        }));
      }

      if (override) {
        alert('就業規則警告を承認し、設定を強制保存しました。');
      }
      return true;
    } catch (err) {
      console.error('[VirtualOfficePlugin] Settings update failed:', err);
      setError(err.message);
      loadUsers(false);
      throw err;
    }
  };

  const handleOpenDmWindow = (targetMember, isUrgent = false) => {
    if (!canExecute) return;
    openSubWindow({
      windowId: `dm-chat-${targetMember.id}`,
      subView: 'dm-chat',
      title: `Chat with ${targetMember.name}`,
      width: 420,
      height: 540,
      params: {
        targetUserId: targetMember.id,
        targetUser: {
          id: targetMember.id,
          name: targetMember.name,
          email: targetMember.email,
          role: targetMember.role,
          avatar_url: targetMember.avatar_url,
          current_room: targetMember.current_room,
          status_text: targetMember.status_text,
          is_remote: targetMember.is_remote,
          is_offline: targetMember.is_offline,
          native_language: targetMember.native_language
        },
        urgent: isUrgent
      }
    });
  };

  const formatDuration = (totalSeconds) => {
    const secs = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remSecs = secs % 60;
    if (hours > 0) return `${hours}時間 ${mins}分`;
    if (mins > 0) return `${mins}分 ${remSecs}秒`;
    return `${remSecs}秒`;
  };

  const flushViewModeDuration = useCallback(async (targetMode) => {
    if (!activeStartRef.current) return;
    const elapsedSec = Math.round((Date.now() - activeStartRef.current) / 1000);
    activeStartRef.current = document.visibilityState === 'visible' ? Date.now() : null;
    if (elapsedSec < 1 || elapsedSec > 3600) return;
    try {
      await eaFetch('/api/vo/analytics/view-modes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: targetMode, durationSeconds: elapsedSec })
      });
    } catch {
      // ignore analytics transient errors
    }
  }, [eaFetch]);

  const loadViewAnalytics = useCallback(async () => {
    try {
      const res = await eaFetch('/api/vo/analytics/view-modes');
      if (res.ok) {
        const data = await res.json();
        setViewAnalytics(data);
      }
    } catch (err) {
      console.error('[VirtualOfficePlugin] Failed to load view analytics:', err);
    }
  }, [eaFetch]);

  useEffect(() => {
    viewModeRef.current = viewMode;
    try {
      localStorage.setItem('vo_view_mode', viewMode);
    } catch {
      // ignore storage errors
    }
  }, [viewMode]);

  useEffect(() => {
    activeStartRef.current = document.visibilityState === 'visible' ? Date.now() : null;

    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        flushViewModeDuration(viewModeRef.current);
      }
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushViewModeDuration(viewModeRef.current);
      } else {
        activeStartRef.current = Date.now();
      }
    };

    const handlePageHide = () => {
      flushViewModeDuration(viewModeRef.current);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      flushViewModeDuration(viewModeRef.current);
    };
  }, [flushViewModeDuration]);

  const handleSwitchViewMode = async (nextMode) => {
    if (nextMode === viewMode) return;
    await flushViewModeDuration(viewMode);
    activeStartRef.current = Date.now();
    setViewMode(nextMode);
  };

  const handleSyncPosition = useCallback(async (posX, posZ, rotationY, zoneId) => {
    if (!canExecute) return;
    const nextStatusText =
      zoneId === 'focus-zone' ? 'Busy' : zoneId === 'remote' ? 'Home Office' : 'Active';

    setMyStatus((prev) => ({ ...prev, room: zoneId }));
    setUsers((prev) =>
      prev.map((u) =>
        Number(u.id) === Number(user?.id)
          ? {
              ...u,
              current_room: zoneId,
              pos_x: posX,
              pos_z: posZ,
              rotation_y: rotationY,
              is_remote: zoneId === 'remote' ? 1 : 0,
              status_text: nextStatusText
            }
          : u
      )
    );

    try {
      await eaFetch('/api/vo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_room: zoneId,
          status_text: nextStatusText,
          is_remote: zoneId === 'remote' ? 1 : 0,
          pos_x: posX,
          pos_z: posZ,
          rotation_y: rotationY
        })
      });
    } catch (err) {
      console.error('[VirtualOfficePlugin] Failed to sync 3D position:', err);
    }
  }, [canExecute, eaFetch, user?.id]);

  const handleTalkToUser = useCallback((targetMember) => {
    if (!targetMember) return;
    setSelectedUser(targetMember);
    setChatTargetUser(targetMember);
  }, []);

  const setTransientBubble = useCallback((targetUserId, bubbleObj, durationMs = 5000) => {
    const uid = Number(targetUserId);
    if (!uid) return;
    const prevTimer = bubbleTimeoutsRef.current.get(uid);
    if (prevTimer) clearTimeout(prevTimer);

    setTransientBubbles((prev) => ({ ...prev, [uid]: bubbleObj }));

    const nextTimer = setTimeout(() => {
      setTransientBubbles((prev) => {
        if (!prev[uid]) return prev;
        const copy = { ...prev };
        delete copy[uid];
        return copy;
      });
      bubbleTimeoutsRef.current.delete(uid);
    }, durationMs);

    bubbleTimeoutsRef.current.set(uid, nextTimer);
  }, []);

  useEffect(() => {
    return () => {
      if (emoteTimeoutRef.current) clearTimeout(emoteTimeoutRef.current);
      for (const t of bubbleTimeoutsRef.current.values()) {
        clearTimeout(t);
      }
      bubbleTimeoutsRef.current.clear();
    };
  }, []);

  const handleTriggerEmote = useCallback(async (emoteText) => {
    if (!emoteText) return;
    if (emoteTimeoutRef.current) clearTimeout(emoteTimeoutRef.current);

    setMyEmote(emoteText);
    if (user?.id) {
      setUsers((prev) =>
        prev.map((u) => (Number(u.id) === Number(user.id) ? { ...u, emote: emoteText } : u))
      );
    }

    emoteTimeoutRef.current = setTimeout(() => {
      setMyEmote(null);
      if (user?.id) {
        setUsers((prev) =>
          prev.map((u) => (Number(u.id) === Number(user.id) ? { ...u, emote: null } : u))
        );
      }
    }, 8000);

    if (!canExecute) return;
    try {
      await eaFetch('/api/vo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emote: emoteText,
          emoteDurationMs: 8000
        })
      });
    } catch (err) {
      console.error('[VirtualOfficePlugin] Failed to sync emote:', err);
    }
  }, [canExecute, eaFetch, user?.id]);

  const handlePositionUpdate = useCallback(({ x, z, zoneId }) => {
    setMyPosition({ x, z, zoneId });
  }, []);

  const handleNearbyUserChange = useCallback((target) => {
    setNearbyUser(target || null);
    if (!target || Number(target.id) === Number(user?.id) || target.is_offline) return;

    const now = Date.now();
    const lastGreeted = greetCooldownRef.current.get(target.id) || 0;
    if (now - lastGreeted > 45000) {
      greetCooldownRef.current.set(target.id, now);
      if (user?.id) {
        setTransientBubble(
          user.id,
          { text: `👋 ${target.name}さん、こんにちは！`, type: 'greeting' },
          5000
        );
      }
      setTransientBubble(target.id, { text: '👋 こんにちは！', type: 'greeting' }, 4500);
    }
  }, [setTransientBubble, user?.id]);

  const handleNavigateTo = useCallback((target) => {
    if (!target) return;
    setAutoMoveTarget({
      x: target.x,
      z: target.z,
      label: target.label || 'Office',
      seq: Date.now()
    });
  }, []);

  const userBubbles = useMemo(() => {
    const map = {};
    for (const u of users) {
      if (u.emote) {
        if (Number(u.id) === Number(user?.id) && myEmote === null) continue;
        map[u.id] = { text: u.emote, type: 'emote' };
      }
    }
    for (const [uid, b] of Object.entries(transientBubbles)) {
      if (b && b.text) {
        map[uid] = b;
      }
    }
    return map;
  }, [users, transientBubbles, user?.id, myEmote]);

  // 1) Google カレンダー直近予定の定期取得
  const loadUpcomingCalendar = useCallback(async () => {
    try {
      const res = await eaFetch('/api/vo/calendar/upcoming');
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(Array.isArray(data.events) ? data.events : []);
        setCalendarConnected(Boolean(data.calendarConnected));
      }
    } catch {
      // ignore transient calendar fetch error
    }
  }, [eaFetch]);

  useEffect(() => {
    loadUpcomingCalendar();
    const timer = setInterval(loadUpcomingCalendar, 30000);
    return () => clearInterval(timer);
  }, [loadUpcomingCalendar]);

  const handleAddTestMeeting = useCallback(() => {
    const now = Date.now();
    const startMs = now + 4 * 60 * 1000 + 55 * 1000;
    const endMs = startMs + 30 * 60 * 1000;
    const newEvent = {
      id: `test-meeting-${now}`,
      summary: '定例スプリント会議 (テスト)',
      start: { dateTime: new Date(startMs).toISOString() },
      end: { dateTime: new Date(endMs).toISOString() },
      isTest: true
    };
    setTestMeetings((prev) => [...prev.slice(-3), newEvent]);
    setIsMeetingWidgetCollapsed(false);
  }, []);

  const allUpcomingEvents = useMemo(() => {
    const now = Date.now();
    return [...calendarEvents, ...testMeetings]
      .filter((ev) => {
        const startMs = new Date(ev.start?.dateTime || ev.start?.date || 0).getTime();
        const endMs = new Date(ev.end?.dateTime || ev.end?.date || startMs + 30 * 60 * 1000).getTime();
        return Number.isFinite(startMs) && endMs > now - 60 * 1000;
      })
      .sort((a, b) => {
        const sa = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
        const sb = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
        return sa - sb;
      });
  }, [calendarEvents, testMeetings]);

  // 2) 会議開始 5分前〜開始時刻の AI アシスタント通知 ＆ 自動会議室移動
  useEffect(() => {
    const checkMeetings = () => {
      const now = Date.now();
      for (const ev of allUpcomingEvents) {
        const startMs = new Date(ev.start?.dateTime || ev.start?.date || 0).getTime();
        if (!Number.isFinite(startMs)) continue;
        const diffMs = startMs - now;
        if (diffMs <= 5 * 60 * 1000 && diffMs >= -60 * 1000 && !notifiedEventIdsRef.current.has(ev.id)) {
          notifiedEventIdsRef.current.add(ev.id);
          const minsLeft = Math.max(1, Math.ceil(diffMs / 60000));
          const summary = ev.summary || 'ミーティング';
          const startTimeStr = new Date(startMs).toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const message = `🤖 あと${minsLeft}分で『${summary}』が始まります！会議室へ移動しますね`;

          setAssistantNotification({
            id: ev.id,
            summary,
            minsLeft,
            startTimeStr,
            message
          });

          if (user?.id) {
            setTransientBubble(
              user.id,
              { text: `🤖 あと${minsLeft}分で会議！移動します`, type: 'assistant' },
              7000
            );
          }

          setAutoMoveTarget({
            ...MEETING_ROOM_A_TARGET,
            seq: Date.now()
          });

          if (viewModeRef.current === '2d' && canExecute) {
            handleUpdateMyStatus('meeting-room-a', 'In a Meeting');
          }
          break;
        }
      }
    };

    checkMeetings();
    const timer = setInterval(checkMeetings, 5000);
    return () => clearInterval(timer);
  }, [allUpcomingEvents, canExecute, setTransientBubble, user?.id]);

  const avatar3dSavedHashesRef = useRef(new Map());
  const handleCacheAvatar3D = useCallback(async (targetUserId, config) => {
    if (!targetUserId || !config?.avatarHash) return;
    const prevHash = avatar3dSavedHashesRef.current.get(targetUserId);
    if (prevHash === config.avatarHash) return;
    avatar3dSavedHashesRef.current.set(targetUserId, config.avatarHash);

    setUsers((prev) =>
      prev.map((u) => (Number(u.id) === Number(targetUserId) ? { ...u, avatar_3d_config: config } : u))
    );

    try {
      await eaFetch('/api/vo/avatar-3d-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, config })
      });
    } catch {
      // ignore transient cache save errors
    }
  }, [eaFetch]);

  const onlineCount = useMemo(() => users.filter((u) => !u.is_offline).length, [users]);
  const nextUpcomingEvent = allUpcomingEvents[0] || null;
  const nextEventCountdownLabel = useMemo(() => {
    if (!nextUpcomingEvent) return '';
    const startMs = new Date(nextUpcomingEvent.start?.dateTime || nextUpcomingEvent.start?.date || 0).getTime();
    const diffMin = Math.ceil((startMs - Date.now()) / 60000);
    if (diffMin <= 0) return 'まもなく開始';
    if (diffMin < 60) return `あと${diffMin}分`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `あと${h}時間${m > 0 ? `${m}分` : ''}`;
  }, [nextUpcomingEvent]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-[#0b0f19] text-gray-400">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-sm font-medium">バーチャルオフィス空間をロード中...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0b0f19] text-[#e2e8f0] overflow-hidden font-sans select-none">
      {/* Control Bar */}
      <div className="flex justify-between items-center px-5 py-3 bg-gradient-to-r from-slate-900/95 via-[#0f172a]/95 to-indigo-950/75 border-b border-slate-800/90 backdrop-blur-md gap-3 flex-wrap">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-400/30 flex items-center justify-center text-xl shadow-inner">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold tracking-tight text-white">Virtual Workspace</h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[9px] font-bold text-emerald-300 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {onlineCount}/{users.length} Online
              </span>
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-400/25 text-[9px] font-bold text-indigo-300">
                🛡️ PQC Plugin v3.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400">3Dオフィス空間・AIアシスタント連携・リアルタイム在席ステータス</p>
          </div>
        </div>

        {/* Right Controls: 3D/2D Toggle, Test Meeting, Analytics, Assistant Settings, My Status */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleSwitchViewMode('3d')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🧊 3D
            </button>
            <button
              type="button"
              onClick={() => handleSwitchViewMode('2d')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🗺️ 2D
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              loadViewAnalytics();
              setIsAnalyticsOpen(true);
            }}
            title="3D / 2D 利用統計を表示"
            className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 transition cursor-pointer"
          >
            📊 利用統計
          </button>

          {canManageRules && (
            <button
              type="button"
              onClick={() => {
                const me = users.find((u) => Number(u.id) === Number(user?.id));
                if (me) setSelectedUser(me);
                setIsSettingsModalOpen(true);
              }}
              title="自分のAIアシスタント設定を開く"
              className="px-2.5 py-1.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-500/35 text-xs font-semibold text-indigo-200 transition cursor-pointer"
            >
              🤖 AI設定
            </button>
          )}

          {/* My Status Trigger */}
          {canExecute ? (
            <div className="flex items-center space-x-2 bg-slate-900/80 p-1 rounded-xl border border-slate-700/80">
              <span className="text-[11px] font-semibold text-slate-400 pl-2">📍</span>
              <select
                value={myStatus.room}
                onChange={(e) =>
                  handleUpdateMyStatus(
                    e.target.value,
                    e.target.value === 'focus-zone'
                      ? 'Busy'
                      : e.target.value === 'remote'
                        ? 'Home Office'
                        : 'Active'
                  )
                }
                className="bg-slate-800/90 border border-slate-700 text-xs rounded-lg px-2 py-1 text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="open-space">🌳 オープンスペース</option>
                <option value="meeting-room-a">💬 会議室 A</option>
                <option value="meeting-room-b">🎥 会議室 B</option>
                <option value="focus-zone">🤫 集中ゾーン</option>
                <option value="remote">🏡 自宅 (リモート)</option>
              </select>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-300">
              👁️ 閲覧専用モード (ZTA Read)
            </div>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* AI アシスタント 会議5分前通知バナー（3D/2D共通） */}
        {assistantNotification && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-lg pointer-events-auto">
            <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-950/95 via-slate-900/95 to-violet-950/95 border border-indigo-400/60 shadow-2xl shadow-indigo-950/60 backdrop-blur-md">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/50 flex items-center justify-center text-lg flex-shrink-0 animate-bounce">
                🤖
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300">
                    AI Meeting Assistant
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-[9px] font-bold text-amber-200">
                    {assistantNotification.startTimeStr} 開始
                  </span>
                </div>
                <p className="text-xs font-bold text-white mt-0.5 leading-snug">
                  {assistantNotification.message}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleNavigateTo(MEETING_ROOM_A_TARGET)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition cursor-pointer"
                  >
                    💬 Meeting Room A へ移動
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigateTo(MEETING_ROOM_B_TARGET)}
                    className="px-2.5 py-1 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white text-[10px] font-bold transition cursor-pointer"
                  >
                    🎥 Meeting Room B へ移動
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssistantNotification(null)}
                title="通知を閉じる"
                className="text-slate-400 hover:text-white text-xs p-1 rounded-lg hover:bg-slate-800/80 transition cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {viewMode === '3d' ? (
          <div className="relative flex-1 h-full overflow-hidden">
            {error && (
              <div className="absolute top-3 right-3 z-20 bg-red-500/90 border border-red-400 text-white px-3 py-2 rounded-lg text-xs shadow-lg">
                ⚠️ {error}
              </div>
            )}
            <VirtualOffice3DCanvas
              users={users}
              currentUserId={user?.id}
              selectedUserId={selectedUser?.id}
              onSelectUser={setSelectedUser}
              onTalkToUser={handleTalkToUser}
              onSyncPosition={handleSyncPosition}
              onCacheAvatar3D={handleCacheAvatar3D}
              canExecute={canExecute}
              autoMoveTarget={autoMoveTarget}
              onPositionUpdate={handlePositionUpdate}
              onNearbyUserChange={handleNearbyUserChange}
              myEmote={myEmote}
              userBubbles={userBubbles}
            />

            {/* 左上ガイド直下: AI 会議アシスタント & 直近予定カード */}
            <div className="absolute top-[78px] left-3 z-20 w-[264px]">
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl backdrop-blur-md shadow-xl overflow-hidden text-slate-100">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-950/60 border-b border-slate-800/80">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs">📅</span>
                    <span className="text-[11px] font-bold text-slate-200 truncate">会議アシスタント</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        calendarConnected
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {calendarConnected ? '連携中' : 'テスト可'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMeetingWidgetCollapsed((v) => !v)}
                    className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer"
                  >
                    {isMeetingWidgetCollapsed ? '▸' : '▾'}
                  </button>
                </div>

                {!isMeetingWidgetCollapsed && (
                  <div className="p-2.5 space-y-2">
                    {nextUpcomingEvent ? (
                      <div className="px-2.5 py-2 rounded-xl bg-indigo-950/50 border border-indigo-500/30 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-indigo-200 truncate">
                            {nextUpcomingEvent.summary}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-200 font-bold whitespace-nowrap">
                            {nextEventCountdownLabel}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {new Date(nextUpcomingEvent.start?.dateTime || nextUpcomingEvent.start?.date).toLocaleTimeString('ja-JP', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}{' '}
                          開始予定（5分前に自動移動）
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 px-1 py-0.5">
                        24時間以内の会議予定はありません
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleAddTestMeeting}
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-[10px] font-bold shadow-sm transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <span>🕒</span>
                        <span>5分後のテスト会議を追加</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 左下: 2D ミニマップ HUD */}
            <div className="absolute bottom-3 left-3 z-20">
              <MiniMapHUD
                users={users}
                currentUserId={user?.id}
                myPosition={myPosition}
                autoMoveTarget={autoMoveTarget}
                onNavigate={handleNavigateTo}
                canExecute={canExecute}
              />
            </div>

            {/* 近接ユーザー検出時のクイック声かけプロンプト */}
            {nearbyUser && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 max-w-[92vw]">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-emerald-400/50 backdrop-blur-md shadow-xl text-xs">
                  <span className="text-[11px] font-bold text-emerald-200 whitespace-nowrap">
                    ✨ {nearbyUser.name}さんが近くです
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (user?.id) {
                        setTransientBubble(
                          user.id,
                          { text: `👋 ${nearbyUser.name}さん、こんにちは！`, type: 'greeting' },
                          5000
                        );
                      }
                      setTransientBubble(nearbyUser.id, { text: '👋 よろしく！', type: 'greeting' }, 4500);
                    }}
                    className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold whitespace-nowrap transition cursor-pointer"
                  >
                    👋 挨拶する
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTalkToUser(nearbyUser)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold whitespace-nowrap transition cursor-pointer"
                  >
                    💬 スライドDM
                  </button>
                </div>
              </div>
            )}

            {/* 右下: エモートバー */}
            <div
              className={`absolute bottom-3 z-20 transition-all duration-300 ${
                chatTargetUser ? 'right-3 sm:right-[426px]' : 'right-3'
              }`}
            >
              <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-md shadow-2xl">
                {EMOTE_PRESETS.map((preset) => {
                  const isActive = myEmote === preset.label;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.title}
                      onClick={() => handleTriggerEmote(preset.label)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30 scale-105'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* Left Side: Office Map */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs">
              ⚠️ {error}
            </div>
          )}

          {/* Map Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(ROOMS).map(([roomId, roomInfo]) => {
              const roomUsers = users.filter((u) => u.current_room === roomId);

              return (
                <div
                  key={roomId}
                  onClick={() => {
                    if (!canExecute) return;
                    handleUpdateMyStatus(
                      roomId,
                      roomId === 'focus-zone' ? 'Busy' : roomId === 'remote' ? 'Home Office' : 'Active'
                    );
                  }}
                  className={`p-5 rounded-2xl border ${roomInfo.color} ${
                    canExecute ? 'cursor-pointer hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5' : 'cursor-default'
                  } transition-all duration-300 relative overflow-hidden`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-gray-200">{roomInfo.name}</h3>
                      <p className="text-[10px] text-gray-500 mt-0.5">{roomInfo.desc}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-gray-900/40 text-gray-400 text-[10px] border border-gray-800">
                      {roomUsers.length}名
                    </span>
                  </div>

                  {/* User Avatars in Room */}
                  <div className="flex flex-wrap gap-4 pt-2">
                    {roomUsers.length === 0 ? (
                      <div className="text-[11px] text-gray-600 italic py-2">誰もいません</div>
                    ) : (
                      roomUsers.map((u) => {
                        const isOffline = !!(u.is_offline || (u.status_text || '').toLowerCase() === 'offline');
                        return (
                          <div
                            key={u.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUser(u);
                            }}
                            className={`group flex flex-col items-center space-y-1.5 cursor-pointer relative ${
                              isOffline ? 'opacity-45 grayscale-[60%] hover:opacity-80 transition-opacity' : ''
                            }`}
                          >
                            <div className="relative">
                              <div
                                className={`w-12 h-12 rounded-xl overflow-hidden bg-gray-900 border-2 transition-all group-hover:scale-105 ${
                                  isOffline
                                    ? 'border-gray-600/80'
                                    : u.is_remote
                                      ? 'border-cyan-400/80 shadow-md shadow-cyan-400/10'
                                      : roomId === 'focus-zone'
                                        ? 'border-amber-400/80'
                                        : 'border-gray-800'
                                }`}
                              >
                                <img
                                  src={u.avatar_url}
                                  alt={u.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}`;
                                  }}
                                />
                              </div>

                              {u.unread_count > 0 && (
                                <div className="absolute -top-1 -left-1 bg-red-600 border border-[#0b0f19] rounded-full px-1.5 py-0.5 text-[8px] font-bold text-white shadow-sm shadow-red-500/20 animate-pulse z-10">
                                  {u.unread_count}
                                </div>
                              )}

                              {!!u.is_remote && !isOffline && (
                                <div
                                  className="absolute -top-1 -right-1 bg-cyan-500 border border-[#0b0f19] rounded-full p-0.5 text-[8px]"
                                  title="Remote Login"
                                >
                                  🏡
                                </div>
                              )}
                              {roomId === 'focus-zone' && !isOffline && (
                                <div
                                  className="absolute -bottom-1 -right-1 bg-amber-500 border border-[#0b0f19] rounded-full p-0.5 text-[8px]"
                                  title="Do Not Disturb"
                                >
                                  🤫
                                </div>
                              )}
                              <div
                                className={`absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0b0f19] ${
                                  isOffline
                                    ? 'bg-gray-500'
                                    : roomId === 'focus-zone'
                                      ? 'bg-amber-400'
                                      : u.is_remote
                                        ? 'bg-cyan-400'
                                        : 'bg-emerald-400'
                                }`}
                                title={`Status: ${isOffline ? 'Offline' : u.status_text || 'Active'}`}
                              />
                            </div>

                            <div className="flex flex-col items-center max-w-[75px]">
                              <span className="text-[10px] font-semibold text-gray-300 group-hover:text-white max-w-[65px] truncate">
                                {u.name}
                              </span>
                              {isOffline && (
                                <span className="text-[8px] px-1.5 py-0.5 bg-gray-900/90 text-gray-400 rounded-full border border-gray-700/60 truncate max-w-full text-center mt-0.5 shadow-sm">
                                  ⚫ Offline
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Detail Panel */}
        <div className="w-72 bg-[#111827]/50 border-l border-gray-800 flex flex-col justify-between p-6 overflow-y-auto">
          {selectedUser ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500">Member Profile</span>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-500 hover:text-gray-300 text-xs font-semibold"
                >
                  閉じる
                </button>
              </div>

              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative">
                  <div
                    className={`w-24 h-24 rounded-2xl overflow-hidden bg-gray-900 border-2 border-gray-800 shadow-xl ${
                      selectedUser.is_offline || (selectedUser.status_text || '').toLowerCase() === 'offline'
                        ? 'opacity-50 grayscale-[60%]'
                        : ''
                    }`}
                  >
                    <img src={selectedUser.avatar_url} alt={selectedUser.name} className="w-full h-full object-cover" />
                  </div>
                  {!!selectedUser.is_remote &&
                    !(selectedUser.is_offline || (selectedUser.status_text || '').toLowerCase() === 'offline') && (
                      <div
                        className="absolute -top-1 -right-1 bg-cyan-500 border-2 border-[#111827] rounded-full p-1 text-xs"
                        title="Remote Active"
                      >
                        🏡
                      </div>
                    )}
                </div>

                <div>
                  <h3 className="font-extrabold text-base text-gray-100">{selectedUser.name}</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-[10px] text-gray-400 capitalize inline-block mt-1">
                    {selectedUser.role || 'Member'}
                  </span>
                  {selectedUser.unread_count > 0 && (
                    <span className="ml-1.5 px-2 py-0.5 rounded-full bg-red-600/20 border border-red-500/50 text-[10px] text-red-400 font-bold inline-block mt-1 animate-pulse">
                      🔴 {selectedUser.unread_count}件の未読
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-3">
                <div>
                  <span className="text-[9px] font-bold text-gray-500 block uppercase">Current Room</span>
                  <span className="text-xs font-bold text-gray-300">
                    {ROOMS[selectedUser.current_room]?.name || 'Offline'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-gray-500 block uppercase">Status Text</span>
                  <span className="text-xs text-gray-400">
                    {selectedUser.is_offline || (selectedUser.status_text || '').toLowerCase() === 'offline'
                      ? '⚫ Offline'
                      : selectedUser.status_text || 'Active'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-gray-500 block uppercase">Work Location</span>
                  <span className="text-xs text-gray-300 flex items-center gap-1.5">
                    {selectedUser.is_remote ? (
                      <>
                        <span className="text-cyan-400">🏡</span> 自宅 (Remote)
                      </>
                    ) : (
                      <>
                        <span className="text-emerald-400">🏢</span> 本社オフィス (Office)
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Assistant Rules Panel */}
              {selectedUser.id === user?.id && canManageRules && (
                <div className="bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <span>🤖</span> AI アシスタント設定
                  </h4>
                  <p className="text-[10px] text-gray-400 leading-relaxed font-normal">
                    代理調整時の就業ルールや、自動応答のAIプロンプトをカスタマイズできます。
                  </p>
                  <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                  >
                    🛠️ アシスタント設定を開く
                  </button>
                </div>
              )}

              {/* AI Avatar Creator */}
              {canExecute && (!!selectedUser.is_photo_avatar || !!selectedUser.is_placeholder_avatar) && (
                <div className="bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <span>🤖</span> AI Avatar Creator
                  </h4>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    {selectedUser.is_photo_avatar
                      ? '実写写真が検出されました。AIで親しみやすいドット絵アバターに変換できます。'
                      : 'アバターが未設定です。ランダムアバターの代わりに、お好みのAIアバターを作成します。'}
                  </p>
                  <button
                    disabled={generatingAvatarId === selectedUser.id}
                    onClick={() => handleGenerateAvatar(selectedUser.id)}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    {generatingAvatarId === selectedUser.id ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                        生成中...
                      </>
                    ) : (
                      <>✨ イラストアバターを生成</>
                    )}
                  </button>
                </div>
              )}

              {/* DM Action Buttons */}
              {canExecute && (
                <div className="space-y-2 pt-2 border-t border-gray-800">
                  {selectedUser.is_offline || (selectedUser.status_text || '').toLowerCase() === 'offline' ? (
                    <button
                      onClick={() => handleOpenDmWindow(selectedUser, false)}
                      className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      🤖 AIアシスタントに伝言・予定調整 (Offline)
                    </button>
                  ) : selectedUser.is_remote ? (
                    <button
                      onClick={() => handleOpenDmWindow(selectedUser, false)}
                      className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      💬 チャットを開く (Remote推奨)
                    </button>
                  ) : selectedUser.current_room === 'focus-zone' ? (
                    <button
                      onClick={() => handleOpenDmWindow(selectedUser, true)}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      ⚠️ 緊急チャットを送る (Focus中)
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenDmWindow(selectedUser, false)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      💬 チャットを開く (相談/立ち話)
                    </button>
                  )}
                </div>
              )}

              {/* Debug Controls */}
              {canExecute && selectedUser.id !== user?.id && (
                <div className="bg-indigo-950/20 border border-dashed border-indigo-500/30 p-4 rounded-xl space-y-2 mt-4">
                  <span className="text-[9px] font-bold text-indigo-400 block uppercase">⚙️ テスト用デバッグツール</span>
                  <p className="text-[9px] text-gray-400 leading-relaxed font-normal">
                    このメンバーの配置を強制変更して、AIアシスタントの自動応答やボタンの出し分けをシミュレートできます。
                  </p>
                  <select
                    value={
                      selectedUser.is_offline || (selectedUser.status_text || '').toLowerCase() === 'offline'
                        ? 'offline'
                        : selectedUser.current_room || 'open-space'
                    }
                    onChange={async (e) => {
                      const val = e.target.value;
                      const isSettingOffline = val === 'offline';
                      const room = isSettingOffline ? selectedUser.current_room || 'open-space' : val;
                      const isRemote = room === 'remote' ? 1 : 0;
                      const status = isSettingOffline
                        ? 'Offline'
                        : room === 'focus-zone'
                          ? 'Busy'
                          : room === 'remote'
                            ? 'Home Office'
                            : 'Active';

                      try {
                        const res = await eaFetch('/api/vo/status', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            targetUserId: selectedUser.id,
                            current_room: room,
                            status_text: status,
                            is_remote: isRemote
                          })
                        });
                        if (res.ok) {
                          setSelectedUser((prev) => ({
                            ...prev,
                            current_room: room,
                            status_text: status,
                            is_remote: isRemote,
                            is_offline: isSettingOffline
                          }));
                          loadUsers(false);
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="w-full bg-gray-900 border border-gray-700 text-[10px] rounded px-1.5 py-1 text-gray-300 focus:outline-none cursor-pointer"
                  >
                    <option value="open-space">🌳 オープンスペース (出社中)</option>
                    <option value="meeting-room-a">💬 会議室 A (ミーティング中)</option>
                    <option value="meeting-room-b">🎥 会議室 B (ミーティング中)</option>
                    <option value="focus-zone">🤫 集中ゾーン (話しかけ不可)</option>
                    <option value="remote">🏡 自宅 (リモートワーク中)</option>
                    <option value="offline">⚫ オフライン (セッション切れ/退席)</option>
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center items-center text-center space-y-3 text-gray-500">
              <span className="text-4xl">👥</span>
              <div>
                <p className="text-xs font-bold text-gray-400">メンバー未選択</p>
                <p className="text-[10px] mt-1">
                  マップ上のアバターをクリックすると、現在の勤務場所やアクションが表示されます。
                </p>
              </div>
            </div>
          )}
        </div>
          </>
        )}

        {/* 右側スライドイン DM パネル（オーバーレイ） */}
        <aside
          aria-label="ダイレクトチャット"
          className={`absolute top-0 right-0 h-full w-full sm:w-[410px] z-40 border-l border-indigo-500/25 bg-slate-950 shadow-2xl shadow-black/80 transform transition-transform duration-300 ease-out ${
            chatTargetUser ? 'translate-x-0' : 'translate-x-full pointer-events-none'
          }`}
        >
          {chatTargetUser && (
            <DmChatView
              key={chatTargetUser.id}
              ctx={ctx}
              initialTargetUser={chatTargetUser}
              initialTargetUserId={chatTargetUser.id}
              onClose={() => setChatTargetUser(null)}
            />
          )}
        </aside>
      </div>

      {/* Native Accessible Light-Dismiss Dialog (`light-dismiss-a-dialog`) */}
      <dialog
        ref={settingsDialogRef}
        closedby="any"
        aria-labelledby="vo-assistant-settings-title"
        onClose={() => setIsSettingsModalOpen(false)}
        className="backdrop:bg-black/60 backdrop:backdrop-blur-sm bg-transparent p-0 m-auto w-full max-w-2xl rounded-2xl text-[#e2e8f0] open:flex flex-col max-h-[90vh]"
      >
        {selectedUser && (
          <div className="bg-[#111827] border border-gray-800 rounded-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 bg-gray-900/40">
              <h3 id="vo-assistant-settings-title" className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                <span>🤖</span> AI アシスタント設定のカスタマイズ
              </h3>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 text-lg focus:outline-none"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex border-b border-gray-800">
                <button
                  type="button"
                  onClick={() => setActiveSettingsTab('basic')}
                  className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 ${
                    activeSettingsTab === 'basic'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  基本就業ルール
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSettingsTab('prompt')}
                  className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 ${
                    activeSettingsTab === 'prompt'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  応答AIプロンプト
                </button>
              </div>

              {activeSettingsTab === 'basic' ? (
                <div className="space-y-5">
                  <div className="bg-indigo-950/10 border border-indigo-500/10 rounded-xl p-4">
                    <p className="text-xs text-gray-400 leading-relaxed font-normal">
                      他メンバーからの予定調整リクエストに対し、AIアシスタントがあなたのカレンダーの空きスロットを自動探索・調整する際の就業条件を定義します。
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400">就業開始時間</label>
                      <select
                        value={selectedUser?.assistant_work_start || '09:00'}
                        onChange={(e) =>
                          handleUpdateSettings(
                            e.target.value,
                            selectedUser.assistant_work_end,
                            selectedUser.assistant_break_start,
                            selectedUser.assistant_break_end,
                            selectedUser.assistant_meeting_buffer
                          )
                        }
                        className="w-full bg-gray-900 border border-gray-800 text-sm rounded-xl p-3 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="08:00">08:00 (午前8時)</option>
                        <option value="08:30">08:30 (午前8時半)</option>
                        <option value="09:00">09:00 (午前9時)</option>
                        <option value="09:30">09:30 (午前9時半)</option>
                        <option value="10:00">10:00 (午前10時)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400">就業終了時間</label>
                      <select
                        value={selectedUser?.assistant_work_end || '17:30'}
                        onChange={(e) =>
                          handleUpdateSettings(
                            selectedUser.assistant_work_start,
                            e.target.value,
                            selectedUser.assistant_break_start,
                            selectedUser.assistant_break_end,
                            selectedUser.assistant_meeting_buffer
                          )
                        }
                        className="w-full bg-gray-900 border border-gray-800 text-sm rounded-xl p-3 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="17:00">17:00 (午後5時)</option>
                        <option value="17:30">17:30 (午後5時半)</option>
                        <option value="18:00">18:00 (午後6時)</option>
                        <option value="18:30">18:30 (午後6時半)</option>
                        <option value="19:00">19:00 (午後7時)</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-indigo-950/10 border border-indigo-500/10 rounded-xl p-4">
                    <p className="text-xs text-gray-400 leading-relaxed font-normal">
                      日本の就業規則に基づき、1時間の休憩時間を設定してください（デフォルト 12:00〜13:00）。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400">休憩開始時間</label>
                      <select
                        value={selectedUser?.assistant_break_start || '12:00'}
                        onChange={(e) =>
                          handleUpdateSettings(
                            selectedUser.assistant_work_start,
                            selectedUser.assistant_work_end,
                            e.target.value,
                            selectedUser.assistant_break_end,
                            selectedUser.assistant_meeting_buffer
                          )
                        }
                        className="w-full bg-gray-900 border border-gray-800 text-sm rounded-xl p-3 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="11:00">11:00</option>
                        <option value="11:30">11:30</option>
                        <option value="12:00">12:00</option>
                        <option value="12:30">12:30</option>
                        <option value="13:00">13:00</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400">休憩終了時間</label>
                      <select
                        value={selectedUser?.assistant_break_end || '13:00'}
                        onChange={(e) =>
                          handleUpdateSettings(
                            selectedUser.assistant_work_start,
                            selectedUser.assistant_work_end,
                            selectedUser.assistant_break_start,
                            e.target.value,
                            selectedUser.assistant_meeting_buffer
                          )
                        }
                        className="w-full bg-gray-900 border border-gray-800 text-sm rounded-xl p-3 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="12:00">12:00</option>
                        <option value="12:30">12:30</option>
                        <option value="13:00">13:00</option>
                        <option value="13:30">13:30</option>
                        <option value="14:00">14:00</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400">就業終了前の予定ブロックバッファ</label>
                    <select
                      value={
                        selectedUser?.assistant_meeting_buffer !== undefined
                          ? selectedUser.assistant_meeting_buffer
                          : 30
                      }
                      onChange={(e) =>
                        handleUpdateSettings(
                          selectedUser.assistant_work_start,
                          selectedUser.assistant_work_end,
                          selectedUser.assistant_break_start,
                          selectedUser.assistant_break_end,
                          parseInt(e.target.value, 10)
                        )
                      }
                      className="w-full bg-gray-900 border border-gray-800 text-sm rounded-xl p-3 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="15">15分前まで（最後の枠をギリギリまで許容）</option>
                      <option value="30">30分前まで（標準）</option>
                      <option value="45">45分前まで</option>
                      <option value="60">60分前まで（余裕を持たせる）</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-indigo-950/10 border border-indigo-500/10 rounded-xl p-4">
                    <p className="text-xs text-gray-400 leading-relaxed font-normal">
                      AIアシスタントが他メンバーからのチャットや調整に対して、あなたに成り代わって返答する際の指示（プロンプト）を自由に記述できます。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-400">プロンプト編集エリア</label>
                      {defaultAssistantPrompt && (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm('現在の編集内容がデフォルトプロンプトで上書きされますが、よろしいですか？')
                            ) {
                              setAssistantPrompt(defaultAssistantPrompt);
                            }
                          }}
                          className="text-xs text-indigo-400 hover:text-indigo-300 underline bg-transparent border-0 cursor-pointer"
                        >
                          デフォルトプロンプトをコピー
                        </button>
                      )}
                    </div>
                    <textarea
                      value={assistantPrompt}
                      onChange={(e) => setAssistantPrompt(e.target.value)}
                      rows={12}
                      placeholder={'未設定の場合はデフォルトルールが適用されます。\n例：あなたは{name}のAIアシスタントです。'}
                      className="w-full bg-gray-900 border border-gray-800 text-sm rounded-xl p-4 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono leading-relaxed"
                    />
                  </div>

                  {defaultAssistantPrompt && (
                    <details className="text-xs text-gray-400 bg-gray-950 rounded-xl border border-gray-800 p-2">
                      <summary className="cursor-pointer hover:text-gray-300 focus:outline-none py-1 select-none font-bold">
                        システム標準プロンプトを表示 (コピー元・閲覧専用)
                      </summary>
                      <div className="mt-2 bg-gray-900/60 border border-gray-800/40 rounded-lg p-3 max-h-48 overflow-y-auto text-gray-500 font-mono text-xs whitespace-pre-wrap leading-relaxed select-text">
                        {defaultAssistantPrompt}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800 bg-gray-900/20">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition duration-150"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const success = await handleUpdateSettings(
                      selectedUser.assistant_work_start || '09:00',
                      selectedUser.assistant_work_end || '17:30',
                      selectedUser.assistant_break_start || '12:00',
                      selectedUser.assistant_break_end || '13:00',
                      selectedUser.assistant_meeting_buffer !== undefined ? selectedUser.assistant_meeting_buffer : 30,
                      assistantPrompt
                    );
                    if (success) {
                      setIsSettingsModalOpen(false);
                      alert('アシスタント設定を保存しました。');
                    }
                  } catch (err) {
                    alert(`保存に失敗しました: ${err.message}`);
                  }
                }}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition duration-150 shadow-md shadow-indigo-600/10"
              >
                設定を保存する
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* 3D / 2D 利用統計モーダル */}
      {isAnalyticsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setIsAnalyticsOpen(false)}
        >
          <div
            className="bg-[#111827] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-[#e2e8f0]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-800 bg-gray-900/40">
              <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                <span>📊</span> 3D / 2D 利用時間レポート（A/B 集計）
              </h3>
              <button
                type="button"
                onClick={() => setIsAnalyticsOpen(false)}
                className="text-gray-400 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              {!viewAnalytics ? (
                <div className="text-center py-6 text-gray-400">集計データを読み込み中...</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                      <div className="text-[10px] text-emerald-300 font-bold mb-1">あなたの 3D 利用時間</div>
                      <div className="text-lg font-bold text-white">{formatDuration(viewAnalytics.myUsage?.['3d'])}</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30">
                      <div className="text-[10px] text-indigo-300 font-bold mb-1">あなたの 2D 利用時間</div>
                      <div className="text-lg font-bold text-white">{formatDuration(viewAnalytics.myUsage?.['2d'])}</div>
                    </div>
                  </div>

                  {(() => {
                    const total3d = viewAnalytics.overallUsage?.['3d'] || 0;
                    const total2d = viewAnalytics.overallUsage?.['2d'] || 0;
                    const sum = total3d + total2d;
                    const pct3d = sum > 0 ? Math.round((total3d / sum) * 100) : 0;
                    const pct2d = sum > 0 ? 100 - pct3d : 0;
                    return (
                      <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 space-y-2">
                        <div className="flex justify-between items-center text-[11px] font-bold">
                          <span className="text-gray-300">全体合計比率</span>
                          <span className="text-gray-400">
                            3D: {formatDuration(total3d)} ({pct3d}%) / 2D: {formatDuration(total2d)} ({pct2d}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-gray-800 overflow-hidden flex">
                          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${pct3d}%` }} />
                          <div className="bg-indigo-500 h-full transition-all" style={{ width: `${pct2d}%` }} />
                        </div>
                      </div>
                    );
                  })()}

                  {Array.isArray(viewAnalytics.byUser) && viewAnalytics.byUser.length > 0 && (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      <div className="text-[11px] font-bold text-gray-400">メンバー別内訳</div>
                      {viewAnalytics.byUser.map((row) => {
                        const member = users.find((u) => Number(u.id) === Number(row.userId));
                        return (
                          <div
                            key={row.userId}
                            className="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/80"
                          >
                            <span className="font-semibold text-gray-200">
                              {member?.name || `User #${row.userId}`}
                            </span>
                            <span className="text-gray-400">
                              🧊 {formatDuration(row['3d'])} ｜ 🗺️ {formatDuration(row['2d'])}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
