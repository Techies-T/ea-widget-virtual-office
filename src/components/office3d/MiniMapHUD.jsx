import React, { useMemo, useState } from 'react';
import {
  OFFICE_ZONES,
  FLOOR_BOUNDS,
  clampFloorPosition,
  getZoneAtPosition,
  getDefaultSpawnPosition,
  getAvatarColor
} from './officeLayout.js';

export default function MiniMapHUD({
  users = [],
  currentUserId,
  myPosition = null,
  autoMoveTarget = null,
  onNavigate,
  canExecute = true
}) {
  const [collapsed, setCollapsed] = useState(false);

  const mapBounds = useMemo(() => {
    let minX = FLOOR_BOUNDS.minX;
    let maxX = FLOOR_BOUNDS.maxX;
    let minZ = FLOOR_BOUNDS.minZ;
    let maxZ = FLOOR_BOUNDS.maxZ;
    for (const z of OFFICE_ZONES) {
      minX = Math.min(minX, z.bounds.minX);
      maxX = Math.max(maxX, z.bounds.maxX);
      minZ = Math.min(minZ, z.bounds.minZ);
      maxZ = Math.max(maxZ, z.bounds.maxZ);
    }
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      width: maxX - minX,
      height: maxZ - minZ
    };
  }, []);

  const toPercent = (x, z) => {
    const left = ((x - mapBounds.minX) / mapBounds.width) * 100;
    const top = ((z - mapBounds.minZ) / mapBounds.height) * 100;
    return {
      left: Math.max(0, Math.min(100, left)),
      top: Math.max(0, Math.min(100, top))
    };
  };

  const memberDots = useMemo(() => {
    let otherIdx = 0;
    return users.map((u) => {
      const isMe = Number(u.id) === Number(currentUserId);
      let x;
      let z;
      if (isMe && myPosition && Number.isFinite(myPosition.x) && Number.isFinite(myPosition.z)) {
        [x, z] = clampFloorPosition(myPosition.x, myPosition.z);
      } else if (u.pos_x !== null && u.pos_x !== undefined && u.pos_z !== null && u.pos_z !== undefined) {
        [x, z] = clampFloorPosition(Number(u.pos_x), Number(u.pos_z));
      } else {
        const spawnIdx = isMe ? 0 : ++otherIdx;
        [x, z] = getDefaultSpawnPosition(u.current_room || 'open-space', spawnIdx);
      }
      const pos = toPercent(x, z);
      return {
        user: u,
        isMe,
        isOffline: Boolean(u.is_offline),
        x,
        z,
        left: pos.left,
        top: pos.top
      };
    });
  }, [users, currentUserId, myPosition, mapBounds]);

  const activeZoneId = myPosition?.zoneId ||
    users.find((u) => Number(u.id) === Number(currentUserId))?.current_room ||
    'open-space';
  const activeZone = OFFICE_ZONES.find((z) => z.id === activeZoneId) || OFFICE_ZONES[0];

  const handleMapClick = (e) => {
    if (!onNavigate) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const relX = (e.clientX - rect.left) / rect.width;
    const relZ = (e.clientY - rect.top) / rect.height;
    const rawX = mapBounds.minX + relX * mapBounds.width;
    const rawZ = mapBounds.minZ + relZ * mapBounds.height;
    const [clampedX, clampedZ] = clampFloorPosition(rawX, rawZ);
    const zoneId = getZoneAtPosition(clampedX, clampedZ);
    const zone = OFFICE_ZONES.find((z) => z.id === zoneId);
    onNavigate({
      x: Number(clampedX.toFixed(2)),
      z: Number(clampedZ.toFixed(2)),
      label: zone?.shortLabel || 'Office'
    });
  };

  const targetPercent = autoMoveTarget && Number.isFinite(autoMoveTarget.x) && Number.isFinite(autoMoveTarget.z)
    ? toPercent(autoMoveTarget.x, autoMoveTarget.z)
    : null;

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl backdrop-blur-md shadow-2xl overflow-hidden text-slate-100 select-none w-[240px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/90 bg-slate-950/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: activeZone.color }}
          />
          <span className="text-[11px] font-bold tracking-wide text-slate-200 truncate">
            🗺️ {activeZone.shortLabel}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold">
            {users.filter((u) => !u.is_offline).length} online
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'ミニマップを展開' : 'ミニマップを折りたたむ'}
          className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer"
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div className="p-2.5 space-y-1.5">
          <div
            role="button"
            tabIndex={0}
            aria-label="オフィスミニマップ（クリックで移動）"
            onClick={handleMapClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigate && onNavigate({ x: 0, z: 2.2, label: 'Open Space' });
              }
            }}
            className="relative w-full h-[152px] rounded-xl bg-slate-950/90 border border-slate-800 overflow-hidden cursor-crosshair group"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.14) 1px, transparent 0)',
              backgroundSize: '14px 14px'
            }}
          >
            {/* 全ゾーン領域 */}
            {OFFICE_ZONES.map((zone) => {
              const left = ((zone.bounds.minX - mapBounds.minX) / mapBounds.width) * 100;
              const top = ((zone.bounds.minZ - mapBounds.minZ) / mapBounds.height) * 100;
              const width = ((zone.bounds.maxX - zone.bounds.minX) / mapBounds.width) * 100;
              const height = ((zone.bounds.maxZ - zone.bounds.minZ) / mapBounds.height) * 100;
              const isCurrent = zone.id === activeZoneId;

              return (
                <div
                  key={zone.id}
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    backgroundColor: `${zone.color}${isCurrent ? '2e' : '18'}`,
                    borderColor: `${zone.color}${isCurrent ? 'aa' : '55'}`
                  }}
                  className="absolute border rounded-md transition-colors pointer-events-none flex items-start justify-start p-1"
                >
                  <span
                    className="text-[8px] font-bold leading-none px-1 py-0.5 rounded bg-slate-950/75 text-slate-200 truncate max-w-full"
                    style={{ color: zone.floorColor }}
                  >
                    {zone.shortLabel}
                  </span>
                </div>
              );
            })}

            {/* 自動移動ターゲットマーカー */}
            {targetPercent && (
              <div
                style={{ left: `${targetPercent.left}%`, top: `${targetPercent.top}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
              >
                <span className="block w-3.5 h-3.5 rounded-full border-2 border-emerald-400 bg-emerald-400/30 animate-ping" />
                <span className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-emerald-300" />
              </div>
            )}

            {/* 自分 & 他メンバー位置ドット */}
            {memberDots.map(({ user, isMe, isOffline, left, top }) => {
              const dotColor = isMe
                ? '#22d3ee'
                : isOffline
                  ? '#64748b'
                  : getAvatarColor(user.id);

              return (
                <div
                  key={user.id}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  title={`${user.name}${isMe ? ' (自分)' : ''} • ${isOffline ? 'Offline' : user.status_text || 'Active'}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none ${
                    isMe ? 'z-20' : 'z-10'
                  }`}
                >
                  {isMe && (
                    <span className="absolute -inset-1 rounded-full bg-cyan-400/40 animate-ping" />
                  )}
                  <span
                    className={`relative block rounded-full border shadow-sm ${
                      isMe
                        ? 'w-3 h-3 border-white ring-2 ring-cyan-400/70'
                        : isOffline
                          ? 'w-2 h-2 border-slate-900 opacity-55'
                          : 'w-2.5 h-2.5 border-slate-950'
                    }`}
                    style={{ backgroundColor: dotColor }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[9px] text-slate-400 px-0.5">
            <span>{canExecute ? '📍 クリックでその場所へ移動' : '👁️ 閲覧モード'}</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" /> 自分
              </span>
              <span className="inline-flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> 仲間
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
