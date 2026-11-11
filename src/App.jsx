import React, { useMemo } from 'react';
import { useEaWidgetContext } from './sdk/eaWidgetSdk.js';
import VirtualOfficeView from './views/VirtualOfficeView.jsx';
import DmChatView from './views/DmChatView.jsx';

export default function App() {
  const ctx = useEaWidgetContext();

  const routeInfo = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') || 'office';
    let targetUser = null;
    const rawTargetUser = params.get('targetUser');
    if (rawTargetUser) {
      try {
        targetUser = JSON.parse(rawTargetUser);
      } catch {
        targetUser = null;
      }
    }
    const targetUserId = params.get('targetUserId') ? Number(params.get('targetUserId')) : null;
    const urgent = params.get('urgent') === 'true';
    return { view, targetUser, targetUserId, urgent };
  }, []);

  if (!ctx.ready) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0b0f19] text-gray-400 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        <span className="text-xs font-medium">EA-Core ZTA ホストセッションと同期中...</span>
      </div>
    );
  }

  if (!ctx.hasMinLevel('read')) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0b0f19] text-red-400 p-6 text-center gap-2">
        <span className="text-2xl">🛡️</span>
        <p className="text-xs font-bold">ZTA アクセス拒否: Virtual Office ウィジェットの閲覧権限がありません。</p>
      </div>
    );
  }

  if (routeInfo.view === 'dm-chat') {
    return (
      <DmChatView
        ctx={ctx}
        initialTargetUser={routeInfo.targetUser}
        initialTargetUserId={routeInfo.targetUserId}
        urgent={routeInfo.urgent}
      />
    );
  }

  return <VirtualOfficeView ctx={ctx} />;
}
