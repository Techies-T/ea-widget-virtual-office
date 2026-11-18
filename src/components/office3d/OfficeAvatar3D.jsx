import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getAvatarColor } from './officeLayout.js';
import { buildAvatar3DAssets } from './avatar3dConverter.js';

export default function OfficeAvatar3D({
  user,
  position,
  rotationY = 0,
  isMe = false,
  isMoving = false,
  isNearby = false,
  isSelected = false,
  quality = 'high',
  bubble = null,
  onTalk,
  onSelect,
  onCacheAvatar3D
}) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const leftLegRef = useRef();
  const rightLegRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const ringRef = useRef();

  const targetPosVec = useRef(new THREE.Vector3(position[0], 0, position[1]));
  const prevPosVec = useRef(new THREE.Vector3(position[0], 0, position[1]));
  const walkPhaseRef = useRef(0);

  targetPosVec.current.set(position[0], 0, position[1]);

  const fallbackAccent = getAvatarColor(user.id);
  const [avatarAssets, setAvatarAssets] = useState(() => ({
    config: user.avatar_3d_config || {
      hairColor: '#334155',
      skinColor: '#f5d0b5',
      outfitColor: fallbackAccent,
      accentColor: '#1e293b',
      hairStyle: 'short'
    },
    faceTexture: null
  }));

  const texSize = quality === 'ultra' ? 1024 : quality === 'high' ? 512 : 256;

  useEffect(() => {
    let cancelled = false;
    buildAvatar3DAssets(user.avatar_url, user.avatar_3d_config, texSize).then((result) => {
      if (cancelled) return;
      setAvatarAssets({
        config: result.config,
        faceTexture: result.faceTexture
      });
      if (result.needsServerCacheSave && onCacheAvatar3D) {
        onCacheAvatar3D(user.id, result.config);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user.id, user.avatar_url, user.avatar_3d_config, texSize, onCacheAvatar3D]);

  const isOffline = Boolean(user.is_offline);
  const isRemote = Boolean(user.is_remote) && !isOffline;

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (isMe) {
      group.position.set(position[0], 0, position[1]);
    } else {
      group.position.lerp(targetPosVec.current, Math.min(1, delta * 8));
    }

    let diff = rotationY - group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.rotation.y += diff * Math.min(1, delta * 10);

    const movedDist = group.position.distanceTo(prevPosVec.current);
    prevPosVec.current.copy(group.position);
    const activeMoving = isMe ? isMoving : movedDist > 0.008;

    if (activeMoving && !isOffline) {
      walkPhaseRef.current += delta * 11;
      const swing = Math.sin(walkPhaseRef.current) * 0.48;
      if (leftLegRef.current) leftLegRef.current.rotation.x = swing;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -swing;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -swing * 0.72;
      if (rightArmRef.current) rightArmRef.current.rotation.x = swing * 0.72;
      if (bodyRef.current) bodyRef.current.position.y = Math.abs(Math.cos(walkPhaseRef.current)) * 0.045;
    } else {
      const t = state.clock.elapsedTime;
      if (leftLegRef.current) leftLegRef.current.rotation.x *= 0.85;
      if (rightLegRef.current) rightLegRef.current.rotation.x *= 0.85;
      if (leftArmRef.current) leftArmRef.current.rotation.x *= 0.85;
      if (rightArmRef.current) rightArmRef.current.rotation.x *= 0.85;
      if (bodyRef.current) {
        bodyRef.current.position.y = isOffline ? -0.04 : Math.sin(t * 2 + user.id) * 0.018;
      }
    }

    if (ringRef.current && (isNearby || isMe)) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.05;
      ringRef.current.scale.set(pulse, pulse, 1);
    }
  });

  const ringColor = isOffline
    ? '#4b5563'
    : isNearby && !isMe
      ? '#34d399'
      : isMe
        ? '#22d3ee'
        : isSelected
          ? '#818cf8'
          : isRemote
            ? '#06b6d4'
            : '#64748b';

  const cfg = avatarAssets.config;
  const outfitColor = isOffline ? '#475569' : cfg.outfitColor || fallbackAccent;
  const hairColor = isOffline ? '#334155' : cfg.hairColor || '#1e293b';
  const skinColor = isOffline ? '#94a3b8' : cfg.skinColor || '#f5d0b5';
  const accentColor = isOffline ? '#334155' : cfg.accentColor || '#1e293b';

  const seg = quality === 'ultra' ? 40 : quality === 'high' ? 28 : 14;
  const capSeg = quality === 'ultra' ? 16 : quality === 'high' ? 10 : 6;
  const activeBubble = bubble && bubble.text
    ? bubble
    : user?.emote
      ? { text: user.emote, type: 'emote' }
      : null;

  const bubbleTheme = activeBubble?.type === 'assistant'
    ? {
        box: 'bg-gradient-to-r from-indigo-950/95 to-violet-950/95 text-indigo-100 border-indigo-400/90 shadow-indigo-950/50',
        tail: 'bg-indigo-950 border-indigo-400/90'
      }
    : activeBubble?.type === 'greeting'
      ? {
          box: 'bg-emerald-50/95 text-emerald-950 border-emerald-400 shadow-emerald-950/25',
          tail: 'bg-emerald-50 border-emerald-400'
        }
      : {
          box: 'bg-white/95 text-slate-900 border-amber-300 shadow-amber-950/25',
          tail: 'bg-white border-amber-300'
        };

  return (
    <group
      ref={groupRef}
      position={[position[0], 0, position[1]]}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(user);
        if (!isMe && onTalk) onTalk(user);
      }}
    >
      {/* 足元リング */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <ringGeometry args={[0.42, 0.54, seg]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={isNearby || isMe || isSelected ? 0.92 : 0.45}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* キャラクター本体 */}
      <group ref={bodyRef}>
        {/* 左脚 & 靴 */}
        <group ref={leftLegRef} position={[-0.12, 0.46, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.28, capSeg, seg]} />
            <meshStandardMaterial color="#1e293b" roughness={0.65} />
          </mesh>
          <mesh position={[0, -0.4, 0.04]} scale={[1, 0.55, 1.4]} castShadow>
            <sphereGeometry args={[0.085, seg, seg]} />
            <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.1} />
          </mesh>
        </group>

        {/* 右脚 & 靴 */}
        <group ref={rightLegRef} position={[0.12, 0.46, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.28, capSeg, seg]} />
            <meshStandardMaterial color="#1e293b" roughness={0.65} />
          </mesh>
          <mesh position={[0, -0.4, 0.04]} scale={[1, 0.55, 1.4]} castShadow>
            <sphereGeometry args={[0.085, seg, seg]} />
            <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.1} />
          </mesh>
        </group>

        {/* 胴体（滑らかなジャケット/トップス） */}
        <mesh position={[0, 0.77, 0]} scale={[1.08, 1, 0.72]} castShadow>
          <capsuleGeometry args={[0.21, 0.28, capSeg, seg]} />
          <meshStandardMaterial
            color={outfitColor}
            roughness={0.55}
            metalness={0.08}
            transparent={isOffline}
            opacity={isOffline ? 0.65 : 1}
          />
        </mesh>

        {/* 胸元のインナー/襟元アクセント */}
        <mesh position={[0, 0.88, 0.13]} scale={[0.6, 1, 0.4]} castShadow>
          <coneGeometry args={[0.12, 0.22, seg]} />
          <meshStandardMaterial color={accentColor} roughness={0.5} />
        </mesh>

        {/* 首 */}
        <mesh position={[0, 1.07, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.085, 0.12, seg]} />
          <meshStandardMaterial color={skinColor} roughness={0.55} />
        </mesh>

        {/* 左腕 & 手 */}
        <group ref={leftArmRef} position={[-0.27, 0.94, 0]}>
          <mesh position={[0, -0.17, 0]} rotation={[0, 0, 0.08]} castShadow>
            <capsuleGeometry args={[0.062, 0.26, capSeg, seg]} />
            <meshStandardMaterial color={outfitColor} roughness={0.55} />
          </mesh>
          <mesh position={[-0.02, -0.35, 0]} castShadow>
            <sphereGeometry args={[0.062, seg, seg]} />
            <meshStandardMaterial color={skinColor} roughness={0.5} />
          </mesh>
        </group>

        {/* 右腕 & 手 */}
        <group ref={rightArmRef} position={[0.27, 0.94, 0]}>
          <mesh position={[0, -0.17, 0]} rotation={[0, 0, -0.08]} castShadow>
            <capsuleGeometry args={[0.062, 0.26, capSeg, seg]} />
            <meshStandardMaterial color={outfitColor} roughness={0.55} />
          </mesh>
          <mesh position={[0.02, -0.35, 0]} castShadow>
            <sphereGeometry args={[0.062, seg, seg]} />
            <meshStandardMaterial color={skinColor} roughness={0.5} />
          </mesh>
        </group>

        {/* 頭部（2Dアバターの顔テクスチャを前面にマッピング） */}
        <group position={[0, 1.32, 0]}>
          <mesh rotation={[0, -Math.PI / 2, 0]} castShadow>
            <sphereGeometry args={[0.24, seg, seg]} />
            {avatarAssets.faceTexture ? (
              <meshStandardMaterial
                map={avatarAssets.faceTexture}
                roughness={0.52}
                metalness={0.02}
              />
            ) : (
              <meshStandardMaterial color={skinColor} roughness={0.55} />
            )}
          </mesh>

          {/* 左右の耳 */}
          <mesh position={[-0.23, -0.01, 0]} scale={[0.45, 0.85, 0.65]} castShadow>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color={skinColor} roughness={0.55} />
          </mesh>
          <mesh position={[0.23, -0.01, 0]} scale={[0.45, 0.85, 0.65]} castShadow>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color={skinColor} roughness={0.55} />
          </mesh>

          {/* 立体ヘアボリューム（頭頂・後頭部・サイド） */}
          <mesh position={[0, 0.04, -0.03]} scale={[1.05, 1.03, 1.04]} castShadow>
            <sphereGeometry args={[0.242, seg, seg, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
            <meshStandardMaterial color={hairColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.02, -0.14]} scale={[0.98, 1.0, 0.68]} castShadow>
            <sphereGeometry args={[0.22, seg, seg]} />
            <meshStandardMaterial color={hairColor} roughness={0.7} />
          </mesh>

          {/* ミディアム / ロングヘアの場合はサイド・バックの垂れ髪を追加 */}
          {(cfg.hairStyle === 'medium' || cfg.hairStyle === 'long') && (
            <>
              <mesh
                position={[-0.19, cfg.hairStyle === 'long' ? -0.18 : -0.1, -0.05]}
                scale={[0.45, cfg.hairStyle === 'long' ? 1.55 : 1.0, 0.7]}
                castShadow
              >
                <capsuleGeometry args={[0.1, 0.18, capSeg, seg]} />
                <meshStandardMaterial color={hairColor} roughness={0.7} />
              </mesh>
              <mesh
                position={[0.19, cfg.hairStyle === 'long' ? -0.18 : -0.1, -0.05]}
                scale={[0.45, cfg.hairStyle === 'long' ? 1.55 : 1.0, 0.7]}
                castShadow
              >
                <capsuleGeometry args={[0.1, 0.18, capSeg, seg]} />
                <meshStandardMaterial color={hairColor} roughness={0.7} />
              </mesh>
              <mesh
                position={[0, cfg.hairStyle === 'long' ? -0.22 : -0.12, -0.16]}
                scale={[1.15, cfg.hairStyle === 'long' ? 1.5 : 1.0, 0.5]}
                castShadow
              >
                <capsuleGeometry args={[0.16, 0.18, capSeg, seg]} />
                <meshStandardMaterial color={hairColor} roughness={0.7} />
              </mesh>
            </>
          )}
        </group>
      </group>

      {/* 頭上ネームプレート & アクション */}
      <Html position={[0, 1.88, 0]} center distanceFactor={13} zIndexRange={[15, 0]}>
        <div className="flex flex-col items-center gap-1 select-none pointer-events-auto">
          {activeBubble && (
            <div className="relative flex flex-col items-center mb-0.5 animate-bounce" style={{ animationDuration: '2.2s' }}>
              <div
                className={`px-3 py-1.5 rounded-2xl border-2 text-[11px] font-extrabold shadow-xl max-w-[200px] text-center leading-snug backdrop-blur-md ${bubbleTheme.box}`}
              >
                <span className="whitespace-nowrap">{activeBubble.text}</span>
              </div>
              <div
                className={`w-2.5 h-2.5 rotate-45 -mt-1.5 border-r-2 border-b-2 ${bubbleTheme.tail}`}
              />
            </div>
          )}
          {isNearby && !isMe && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onTalk) onTalk(user);
              }}
              className="px-2.5 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] shadow-lg shadow-emerald-500/30 whitespace-nowrap animate-bounce cursor-pointer border border-emerald-200/60"
            >
              💬 話しかける (E)
            </button>
          )}
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (!isMe && onTalk) onTalk(user);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md shadow-md whitespace-nowrap transition cursor-pointer ${
              isMe
                ? 'bg-cyan-950/90 border-cyan-400/70 text-cyan-100'
                : isNearby
                  ? 'bg-emerald-950/90 border-emerald-400/80 text-white'
                  : isOffline
                    ? 'bg-slate-900/80 border-slate-700 text-slate-400'
                    : 'bg-slate-900/90 border-slate-700/80 text-slate-100 hover:border-indigo-400'
            }`}
          >
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-4 h-4 rounded-full object-cover bg-slate-800"
            />
            <span className="text-[11px] font-bold leading-none">{user.name}</span>
            {isMe && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/30 text-cyan-200 font-bold">
                YOU
              </span>
            )}
            {user.unread_count > 0 && !isMe && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-bold">
                {user.unread_count}
              </span>
            )}
          </div>
          {user.status_text && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950/75 text-slate-300 border border-slate-800/80 whitespace-nowrap">
              {isRemote ? '🏡 ' : isOffline ? '⚫ ' : '🟢 '}
              {user.status_text}
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}
