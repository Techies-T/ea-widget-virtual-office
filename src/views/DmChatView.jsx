import React, { useState, useEffect, useRef, useCallback } from 'react';

const LANG_MAP = {
  ja: { label: '日本語', flag: '🇯🇵' },
  en: { label: 'English', flag: '🇺🇸' },
  es: { label: 'Español', flag: '🇪🇸' }
};

export default function DmChatView({ ctx, initialTargetUser, initialTargetUserId }) {
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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!canExecute || !inputValue.trim()) return;

    const textToSend = inputValue;
    setInputValue('');
    setIsTyping(true);

    try {
      const res = await eaFetch('/api/vo/dm/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: targetUser.id,
          text: textToSend
        })
      });
      if (res.ok) {
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

  return (
    <div className="h-full flex flex-col bg-[#0b0f19] text-[#e2e8f0] overflow-hidden font-sans">
      <div className="flex items-center justify-between px-5 py-3 bg-[#111827]/85 border-b border-gray-800 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div
              className={`w-10 h-10 rounded-xl overflow-hidden bg-gray-900 border border-gray-800 ${
                isTargetOffline ? 'opacity-50 grayscale-[60%]' : ''
              }`}
            >
              <img src={targetUser.avatar_url} alt={targetUser.name} className="w-full h-full object-cover" />
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111827] ${
                isTargetOffline
                  ? 'bg-gray-500'
                  : targetUser.current_room === 'focus-zone'
                    ? 'bg-amber-400'
                    : targetUser.current_room === 'remote'
                      ? 'bg-cyan-400'
                      : 'bg-emerald-400'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-gray-100">{targetUser.name}</h3>
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-500/40 text-[9px] text-indigo-300 font-semibold inline-flex items-center gap-1">
                <span>{targetLang.flag}</span>
                <span>{targetLang.label}</span>
              </span>
            </div>
            <p className="text-[10px] text-gray-500">
              {isTargetOffline ? '⚫ Offline' : targetUser.is_remote ? '🏡 Remote Active' : '🏢 Office Active'}
              <span className="mx-1.5">•</span>
              Status: {isTargetOffline ? 'Offline' : targetUser.status_text || 'Active'}
            </p>
          </div>
        </div>

        {isDifferentLang ? (
          <div className="flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-500/40 px-2.5 py-1 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-[10px] font-bold text-cyan-300">
              🦙 Gemma 4 通訳中 ({senderLang.flag} ➔ {targetLang.flag})
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
            <span className="text-[10px] font-medium text-gray-400">💬 ダイレクトチャット ({targetLang.flag})</span>
          </div>
        )}
      </div>

      <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#0b0f19]/30">
        {displayMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`flex items-end space-x-2 max-w-[75%] ${
                msg.sender === 'me' ? 'flex-row-reverse space-x-reverse' : 'flex-row'
              }`}
            >
              {msg.sender === 'them' && (
                <img
                  src={targetUser.avatar_url}
                  alt={targetUser.name}
                  className="w-6 h-6 rounded-md bg-gray-800 object-cover flex-shrink-0"
                />
              )}
              {msg.sender === 'assistant' && (
                <div className="w-6 h-6 rounded-md flex-shrink-0 bg-indigo-950/80 border border-indigo-500/30 flex items-center justify-center text-xs shadow-sm select-none">
                  🤖
                </div>
              )}
              <div className="flex flex-col">
                {msg.sender === 'assistant' && (
                  <span className="text-[8px] text-indigo-400 font-bold mb-0.5 ml-1 select-none">
                    {targetUser.name}のアシスタント
                  </span>
                )}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm break-all ${
                    msg.sender === 'me'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : msg.sender === 'assistant'
                        ? 'bg-[#151124]/90 text-indigo-100 border border-indigo-500/30 rounded-bl-none relative pr-4'
                        : 'bg-gray-900 text-gray-200 border border-gray-800 rounded-bl-none'
                  }`}
                >
                  {renderMessageBody(msg.text)}
                </div>
                <span className="text-[8px] text-gray-600 mt-1 self-end">{msg.time}</span>
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-center space-x-2 bg-gray-900 border border-gray-800 px-4 py-2.5 rounded-2xl rounded-bl-none">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 bg-[#111827]/55 border-t border-gray-800 flex items-center space-x-3">
        <input
          type="text"
          disabled={!canExecute}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={canExecute ? `${targetUser.name}さんにメッセージを送信...` : '閲覧専用モードのため送信できません'}
          className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canExecute}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition"
        >
          送信
        </button>
      </form>
    </div>
  );
}
