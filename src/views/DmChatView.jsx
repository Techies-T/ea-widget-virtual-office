import React, { useState, useEffect, useRef, useCallback } from 'react';

const LANG_MAP = {
  ja: { label: '日本語', flag: '🇯🇵' },
  en: { label: 'English', flag: '🇺🇸' },
  es: { label: 'Español', flag: '🇪🇸' }
};

const ROOM_BADGES = {
  'open-space': '🌳 Open Space',
  'meeting-room-a': '💬 Meeting A',
  'meeting-room-b': '🎥 Meeting B',
  'focus-zone': '🤫 Focus Zone',
  remote: '🏡 Remote'
};

const QUICK_REPLIES = [
  { label: '👋 挨拶', text: '👋 こんにちは！少しよろしいですか？' },
  { label: '☕ 雑談', text: '☕ 休憩ついでに少しお話しできますか？' },
  { label: '📅 会議相談', text: '📅 本日、少し打ち合わせしたいのですが空いていますか？' }
];

export default function DmChatView({ ctx, initialTargetUser, initialTargetUserId, onClose }) {
  const { user: currentUser, eaFetch, hasMinLevel } = ctx;
  const canExecute = hasMinLevel('execute');

  const [targetUser, setTargetUser] = useState(
    initialTargetUser || {
      id: initialTargetUserId || 1,
      name: 'Member',
      avatar_url: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Admin',
      current_room: 'open-space',
      status_text: 'Active',
      is_remote: false,
      email: '',
      native_language: 'ja'
    }
  );
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [inMeeting, setInMeeting] = useState(false);

  const messagesEndRef = useRef(null);
  const inMeetingRef = useRef(inMeeting);

  useEffect(() => {
    inMeetingRef.current = inMeeting;
  }, [inMeeting]);

  // Keep targetUser presence fresh via /api/vo/users
  const refreshTargetMember = useCallback(async () => {
    const resolvedId = initialTargetUserId || targetUser?.id;
    if (!resolvedId) return;
    try {
      const res = await eaFetch('/api/vo/users');
      if (res.ok) {
        const list = await res.json();
        const found = (Array.isArray(list) ? list : []).find((u) => Number(u.id) === Number(resolvedId));
        if (found) {
          setTargetUser((prev) => ({
            ...prev,
            ...found,
            avatar_url: found.avatar_url || prev.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(found.name)}`
          }));
        }
      }
    } catch {
      // ignore transient error
    }
  }, [eaFetch, initialTargetUserId, targetUser?.id]);

  useEffect(() => {
    refreshTargetMember();
    const timer = setInterval(refreshTargetMember, 5000);
    return () => clearInterval(timer);
  }, [refreshTargetMember]);

  const [translateStatus, setTranslateStatus] = useState({ checked: false, available: true, reason: '' });
  const [translateWarning, setTranslateWarning] = useState('');

  useEffect(() => {
    const langDiff =
      currentUser?.native_language &&
      targetUser?.native_language &&
      currentUser.native_language !== targetUser.native_language;
    if (!langDiff) {
      setTranslateStatus({ checked: false, available: true, reason: '' });
      setTranslateWarning('');
      return;
    }
    let cancelled = false;
    eaFetch('/api/vo/ai/translate-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setTranslateStatus({
          checked: true,
          available: Boolean(data.available),
          reason: data.reason || ''
        });
      })
      .catch(() => {
        if (!cancelled) {
          setTranslateStatus({ checked: true, available: false, reason: '翻訳ステータスを確認できませんでした' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [eaFetch, currentUser?.native_language, targetUser?.native_language]);

  const fetchMessages = useCallback(async () => {
    if (!targetUser?.id) return;
    try {
      const res = await eaFetch(`/api/vo/dm/messages?targetUserId=${targetUser.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      }
    } catch (err) {
      console.error('[DmChatPlugin] Failed to fetch DM messages:', err);
    }
  }, [eaFetch, targetUser?.id]);

  useEffect(() => {
    fetchMessages();
    const timer = setInterval(fetchMessages, 3000);
    return () => clearInterval(timer);
  }, [fetchMessages]);

  const handleJoinMeeting = async () => {
    if (!canExecute) return;
    setInMeeting(true);
    try {
      await eaFetch('/api/vo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_room: 'meeting-room-a',
          status_text: 'In a Meeting'
        })
      });
    } catch (err) {
      console.error('[DmChatPlugin] Failed to join meeting:', err);
    }
  };

  const handleLeaveMeeting = async () => {
    setInMeeting(false);
    try {
      await eaFetch('/api/vo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_room: 'open-space',
          status_text: 'Active'
        })
      });
    } catch (err) {
      console.error('[DmChatPlugin] Failed to leave meeting:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (inMeetingRef.current) {
        eaFetch('/api/vo/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_room: 'open-space',
            status_text: 'Active'
          })
        }).catch(() => {});
      }
    };
  }, [eaFetch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isTyping]);

  const sendMessageText = async (rawText) => {
    const trimmed = String(rawText || '').trim();
    if (!canExecute || !trimmed) return;

    setIsTyping(true);
    try {
      const res = await eaFetch('/api/vo/dm/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: targetUser.id,
          text: trimmed
        })
      });
      if (res.ok) {
        const resData = await res.json().catch(() => ({}));
        if (resData?.translationWarning) {
          setTranslateWarning(resData.translationWarning);
          setTranslateStatus((prev) => ({ ...prev, checked: true, available: false }));
        } else {
          setTranslateWarning('');
        }
        fetchMessages();
      }
    } catch (err) {
      console.error('[DmChatPlugin] Failed to send DM message:', err);
    } finally {
      setTimeout(() => {
        setIsTyping(false);
      }, 1000);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!canExecute || !inputValue.trim()) return;

    const textToSend = inputValue;
    setInputValue('');
    await sendMessageText(textToSend);
  };

  const getDisplayMessages = () => {
    const formatted = messages.map((msg) => {
      const isMe = Number(msg.sender_id) === Number(currentUser?.id);
      return {
        id: msg.id,
        sender: isMe ? 'me' : msg.sender_type === 'assistant' ? 'assistant' : 'them',
        text: msg.text,
        time: (() => {
          if (!msg.created_at) {
            return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          const utcStr = msg.created_at.includes('T')
            ? msg.created_at
            : msg.created_at.replace(' ', 'T') + 'Z';
          return new Date(utcStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        })()
      };
    });

    if (formatted.length === 0) {
      const isTargetOffline = !!(targetUser.is_offline || (targetUser.status_text || '').toLowerCase() === 'offline');
      const roomName = isTargetOffline
        ? 'オフライン（退席中）'
        : targetUser.current_room === 'focus-zone'
          ? '集中ゾーン'
          : targetUser.current_room === 'remote'
            ? 'リモートワーク中'
            : '会議室';

      return [
        {
          id: 'welcome',
          sender: 'assistant',
          text: `こんにちは！${targetUser.name}は現在「${roomName}」のため応答できません。用件がありましたら、代わりにアシスタントの私が伝言を承ります。お互いのカレンダーから「空き時間（30分）」の仮調整も可能です。`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ];
    }

    return formatted;
  };

  const displayMessages = getDisplayMessages();

  if (inMeeting) {
    return (
      <div className="h-full flex flex-col bg-[#0b0f19] text-[#e2e8f0] font-sans justify-between items-center p-6 relative">
        <div className="w-full flex justify-between items-center px-4 py-2 bg-gray-900/60 border border-gray-800 rounded-xl backdrop-blur-md">
          <div className="flex items-center space-x-2">
            <span className="animate-pulse w-2 h-2 bg-red-500 rounded-full"></span>
            <span className="text-xs font-bold text-gray-300">Meeting Room A (Live)</span>
          </div>
          <span className="text-[10px] text-gray-500">Live Session</span>
        </div>

        <div className="flex-1 w-full grid grid-cols-2 gap-4 my-6 items-center">
          <div className="relative aspect-video bg-gray-950 rounded-2xl border border-indigo-500/20 overflow-hidden flex flex-col justify-center items-center">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-900 border-2 border-indigo-500 shadow-lg mb-2">
              <img
                src={currentUser?.avatar_url || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Me'}
                alt="Me"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs font-semibold text-gray-300">{currentUser?.name || 'あなた'} (自分)</span>
            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[9px] text-gray-400">
              マイクオン
            </span>
          </div>

          <div className="relative aspect-video bg-gray-950 rounded-2xl border border-gray-800 overflow-hidden flex flex-col justify-center items-center">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-900 border-2 border-gray-800 shadow-lg mb-2">
              <img src={targetUser.avatar_url} alt={targetUser.name} className="w-full h-full object-cover" />
            </div>
            <span className="text-xs font-semibold text-gray-300">{targetUser.name}</span>
            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[9px] text-gray-400">
              音声のみ接続
            </span>
          </div>
        </div>

        <div className="w-full flex justify-center items-center space-x-6 py-4 border-t border-gray-900">
          <button type="button" className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 text-sm flex items-center justify-center transition" title="Mute Mic">
            🎤
          </button>
          <button type="button" className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 text-sm flex items-center justify-center transition" title="Camera Off">
            📹
          </button>
          <button type="button" className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 text-sm flex items-center justify-center transition" title="Share Screen">
            🖥️
          </button>
          <button
            type="button"
            onClick={handleLeaveMeeting}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-xs font-bold transition shadow-md shadow-red-900/20"
          >
            📞 会議から退出する
          </button>
        </div>
      </div>
    );
  }

  const targetLang = LANG_MAP[targetUser.native_language] || LANG_MAP.ja;
  const senderLang = LANG_MAP[currentUser?.native_language] || LANG_MAP.ja;
  const isDifferentLang =
    currentUser?.native_language &&
    targetUser?.native_language &&
    currentUser.native_language !== targetUser.native_language;

  const renderMeetingAction = (text) => {
    if (!text.includes('➔')) return text;
    const [beforeArrow] = text.split('➔');
    return (
      <>
        {beforeArrow} ➔
        {text.includes('💻 ミーティングを仮調整する') || text.includes('💻 時間外でBOSSに確認する') ? (
          <button
            type="button"
            onClick={async () => {
              const lines = text.split('\n');
              let targetSlot = '';
              for (const line of lines) {
                if (line.trim().startsWith('・')) {
                  targetSlot = line.replace('・', '').trim();
                  break;
                }
              }

              let startIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
              let endIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();

              if (targetSlot) {
                const parts = targetSlot.split('〜').map((p) => p.trim());
                const today = new Date();
                if (parts[0]) {
                  const [h, m] = parts[0].split(':').map(Number);
                  startIso = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).toISOString();
                }
                if (parts[1]) {
                  const [h, m] = parts[1].split(':').map(Number);
                  endIso = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).toISOString();
                }
              }

              let desc = text.includes('💻 時間外でBOSSに確認する')
                ? 'AIアシスタントによる時間外（BOSS確認中）の自動仮調整予定'
                : 'AIアシスタントによる自動仮調整予定';

              const travelIndex = text.indexOf('【考慮した移動時間】');
              if (travelIndex !== -1) {
                const travelPart = text.substring(travelIndex).split('➔')[0].trim();
                desc += '\n\n' + travelPart;
              }

              const res = await eaFetch('/api/vo/calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  summary: text.includes('💻 時間外でBOSSに確認する')
                    ? `【時間外】ミーティング: ${currentUser?.name || ''} & ${targetUser.name}`
                    : `ミーティング: ${currentUser?.name || ''} & ${targetUser.name}`,
                  description: desc,
                  start: startIso,
                  end: endIso
                })
              });

              if (res.ok) {
                if (text.includes('💻 時間外でBOSSに確認する')) {
                  alert(`時間外のため、カレンダーに仮登録した上で、${targetUser.name}(BOSS)へ確認要求を送信しました！`);
                } else {
                  alert(`双方のカレンダーに「${targetSlot || '空き時間'}」で予定を仮登録しました！`);
                }
              } else {
                alert('予定の登録に失敗しました。');
              }
              fetchMessages();
            }}
            className="ml-1 text-cyan-400 font-bold hover:underline cursor-pointer"
          >
            {text.includes('💻 時間外でBOSSに確認する') ? '💻 時間外でBOSSに確認する' : '💻 ミーティングを仮調整する'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleJoinMeeting}
            className="ml-1 text-cyan-400 font-bold hover:underline cursor-pointer"
          >
            💻 ビデオ会議室へ入る
          </button>
        )}
      </>
    );
  };

  const renderMessageBody = (rawText) => {
    if (!rawText) return null;

    if (rawText.startsWith('🌐 [Gemma 4 Translated')) {
      const firstLineEnd = rawText.indexOf('\n');
      const header =
        firstLineEnd !== -1
          ? rawText.substring(0, firstLineEnd).replace('🌐 [', '').replace(']', '').trim()
          : 'Gemma 4 Translated';
      const bodyAndOrig = firstLineEnd !== -1 ? rawText.substring(firstLineEnd + 1).trim() : rawText;

      let mainTranslated = bodyAndOrig;
      let origText = '';
      const origIdx = bodyAndOrig.lastIndexOf('原文:');
      if (origIdx !== -1) {
        const openParen = bodyAndOrig.lastIndexOf('(', origIdx);
        const closeParen = bodyAndOrig.lastIndexOf(')');
        if (openParen !== -1 && closeParen !== -1 && closeParen > origIdx) {
          mainTranslated = bodyAndOrig.substring(0, openParen).trim();
          origText = bodyAndOrig.substring(openParen + 1, closeParen).trim();
        }
      }

      return (
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold tracking-wide">
            <span className="animate-pulse">🌐</span>
            <span>{header}</span>
          </div>
          <div className="text-xs leading-relaxed font-medium whitespace-pre-wrap">
            {renderMeetingAction(mainTranslated)}
          </div>
          {origText && (
            <div className="pt-1.5 border-t border-white/10 text-[11px] opacity-75 italic text-gray-300 whitespace-pre-wrap">
              ({origText})
            </div>
          )}
        </div>
      );
    }

    if (rawText.startsWith('🤖 [AI Assistant (Gemma 4 🦙)]')) {
      const body = rawText.replace('🤖 [AI Assistant (Gemma 4 🦙)]', '').trim();
      return (
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold tracking-wide">
            <span>🦙</span>
            <span>Gemma 4 AI Assistant</span>
          </div>
          <div className="text-xs leading-relaxed whitespace-pre-wrap">{renderMeetingAction(body)}</div>
        </div>
      );
    }

    return <div className="text-xs leading-relaxed whitespace-pre-wrap">{renderMeetingAction(rawText)}</div>;
  };

  const isTargetOffline = !!(targetUser.is_offline || (targetUser.status_text || '').toLowerCase() === 'offline');
  const roomBadge = isTargetOffline
    ? '⚫ Offline'
    : ROOM_BADGES[targetUser.current_room] || '🏢 Office';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-900/95 to-indigo-950/60 border-b border-slate-800/90 backdrop-blur-md">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div
              className={`w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border-2 shadow-md ${
                isTargetOffline
                  ? 'border-slate-700 opacity-50 grayscale-[60%]'
                  : targetUser.current_room === 'focus-zone'
                    ? 'border-amber-400/70'
                    : targetUser.is_remote
                      ? 'border-cyan-400/70'
                      : 'border-emerald-400/70'
              }`}
            >
              <img src={targetUser.avatar_url} alt={targetUser.name} className="w-full h-full object-cover" />
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                isTargetOffline
                  ? 'bg-slate-500'
                  : targetUser.current_room === 'focus-zone'
                    ? 'bg-amber-400'
                    : targetUser.current_room === 'remote'
                      ? 'bg-cyan-400'
                      : 'bg-emerald-400'
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-bold text-sm text-white truncate">{targetUser.name}</h3>
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-400/30 text-[9px] text-indigo-200 font-semibold inline-flex items-center gap-1">
                <span>{targetLang.flag}</span>
                <span>{targetLang.label}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 truncate">
              <span className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700/70 text-[9px] font-semibold text-slate-300">
                {roomBadge}
              </span>
              <span className="truncate">
                {isTargetOffline ? '離席中' : targetUser.status_text || 'Active'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isDifferentLang ? (
            translateStatus.checked && !translateStatus.available ? (
              <div
                title={translateStatus.reason || 'ローカルAI未接続のため翻訳なしで送信されます'}
                className="flex items-center gap-1 bg-amber-500/15 border border-amber-400/40 px-2 py-1 rounded-lg"
              >
                <span className="text-[10px]">⚠️</span>
                <span className="text-[9px] font-bold text-amber-200 whitespace-nowrap">
                  翻訳なし ({senderLang.flag}➔{targetLang.flag})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-cyan-500/15 border border-cyan-400/35 px-2 py-1 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                <span className="text-[9px] font-bold text-cyan-200 whitespace-nowrap">
                  {senderLang.flag}➔{targetLang.flag}
                </span>
              </div>
            )
          ) : (
            <div className="hidden sm:flex items-center gap-1 bg-slate-800/70 border border-slate-700/70 px-2 py-1 rounded-lg">
              <span className="text-[9px] font-semibold text-slate-300">💬 DM</span>
            </div>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="チャットを閉じる"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition cursor-pointer text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {isDifferentLang && ((translateStatus.checked && !translateStatus.available) || translateWarning) && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/25 text-[10px] text-amber-200 flex items-center gap-1.5">
          <span>⚠️</span>
          <span className="truncate">
            {translateWarning || 'ローカルAIが利用できないため、翻訳なしで原文のまま送信されます。'}
          </span>
        </div>
      )}

      <div className="flex-1 px-4 py-4 overflow-y-auto space-y-4 bg-gradient-to-b from-slate-950 via-[#0b0f19] to-slate-950">
        {displayMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`flex items-end space-x-2 max-w-[82%] ${
                msg.sender === 'me' ? 'flex-row-reverse space-x-reverse' : 'flex-row'
              }`}
            >
              {msg.sender === 'them' && (
                <img
                  src={targetUser.avatar_url}
                  alt={targetUser.name}
                  className="w-6 h-6 rounded-lg bg-slate-800 object-cover flex-shrink-0 border border-slate-700"
                />
              )}
              {msg.sender === 'assistant' && (
                <div className="w-6 h-6 rounded-lg flex-shrink-0 bg-indigo-950/90 border border-indigo-400/40 flex items-center justify-center text-xs shadow-sm select-none">
                  🤖
                </div>
              )}
              <div className="flex flex-col">
                {msg.sender === 'assistant' && (
                  <span className="text-[9px] text-indigo-300 font-bold mb-0.5 ml-1 select-none">
                    {targetUser.name}のアシスタント
                  </span>
                )}
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-md break-words ${
                    msg.sender === 'me'
                      ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-sm'
                      : msg.sender === 'assistant'
                        ? 'bg-indigo-950/60 text-indigo-100 border border-indigo-500/35 rounded-bl-sm'
                        : 'bg-slate-900 text-slate-100 border border-slate-800 rounded-bl-sm'
                  }`}
                >
                  {renderMessageBody(msg.text)}
                </div>
                <span className="text-[9px] text-slate-500 mt-1 self-end px-1">{msg.time}</span>
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-2xl rounded-bl-sm">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* クイック声かけチップ */}
      {canExecute && (
        <div className="px-3 pt-2 pb-1 bg-slate-900/70 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto">
          {QUICK_REPLIES.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => sendMessageText(chip.text)}
              className="px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-400/50 text-[10px] font-semibold text-slate-300 hover:text-white whitespace-nowrap transition cursor-pointer"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSendMessage} className="p-3 bg-slate-900/90 border-t border-slate-800/70 flex items-center space-x-2">
        <input
          type="text"
          disabled={!canExecute}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={canExecute ? `${targetUser.name}さんにメッセージを送信...` : '閲覧専用モードのため送信できません'}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canExecute || !inputValue.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-white rounded-xl px-4 py-2 text-xs font-bold shadow-sm transition cursor-pointer"
        >
          送信
        </button>
      </form>
    </div>
  );
}
