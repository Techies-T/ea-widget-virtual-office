import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Grid } from '@react-three/drei';
import * as THREE from 'three';
import OfficeAvatar3D from './OfficeAvatar3D.jsx';
import OfficeDecorations3D from './OfficeDecorations3D.jsx';
import {
  OFFICE_ZONES,
  clampFloorPosition,
  getZoneAtPosition,
  getDefaultSpawnPosition
} from './officeLayout.js';
import {
  getWoodFloorTexture,
  getCarpetTexture,
  getMonitorScreenTexture,
  getDualMonitorSecondaryTexture
} from './proceduralTextures.js';

const MOVE_SPEED = 5.2;
const TALK_DISTANCE = 2.7;

const QUALITY_CONFIG = {
  standard: {
    label: 'Standard',
    dpr: 1,
    shadowSize: 1024,
    texSize: 256,
    anisotropy: 4,
    seg: 12
  },
  high: {
    label: 'High',
    dpr: [1, 1.5],
    shadowSize: 2048,
    texSize: 512,
    anisotropy: 8,
    seg: 24
  },
  ultra: {
    label: 'Ultra',
    dpr: [1.5, 2],
    shadowSize: 4096,
    texSize: 1024,
    anisotropy: 16,
    seg: 40
  }
};

function DetailedPlant({ position, scale = 1.05, seg = 24 }) {
  const leafClusters = [
    { pos: [0.38, 1.18, 0.18], rot: [0.35, 0.4, -0.38], s: [1.75, 0.28, 1.15], c: '#15803d' },
    { pos: [-0.36, 1.24, 0.24], rot: [0.38, -0.5, 0.35], s: [1.7, 0.28, 1.1], c: '#16a34a' },
    { pos: [0.12, 1.28, -0.4], rot: [-0.42, 0.15, -0.15], s: [1.65, 0.28, 1.12], c: '#166534' },
    { pos: [-0.28, 1.34, -0.28], rot: [-0.3, -0.6, 0.32], s: [1.6, 0.28, 1.05], c: '#15803d' },
    { pos: [0.42, 1.58, -0.08], rot: [0.12, 0.8, -0.35], s: [1.65, 0.32, 1.08], c: '#22c55e' },
    { pos: [-0.4, 1.64, 0.06], rot: [0.18, -0.7, 0.32], s: [1.6, 0.32, 1.08], c: '#16a34a' },
    { pos: [0.06, 1.68, 0.42], rot: [0.42, 0.05, -0.08], s: [1.62, 0.3, 1.06], c: '#22c55e' },
    { pos: [-0.08, 1.72, -0.38], rot: [-0.36, -0.2, 0.12], s: [1.55, 0.3, 1.04], c: '#15803d' },
    { pos: [0.24, 1.96, 0.16], rot: [0.24, 0.5, -0.22], s: [1.45, 0.34, 0.98], c: '#22c55e' },
    { pos: [-0.24, 2.0, -0.12], rot: [-0.2, -0.4, 0.24], s: [1.42, 0.34, 0.96], c: '#4ade80' },
    { pos: [0.0, 2.14, 0.02], rot: [0.08, 0.2, 0.05], s: [1.32, 0.38, 1.05], c: '#4ade80' }
  ];

  return (
    <group position={position} scale={scale}>
      {/* 木製プランタースタンド受け皿 */}
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[0.38, 0.4, 0.08, seg]} />
        <meshStandardMaterial color="#d4a373" roughness={0.65} />
      </mesh>
      {/* 大型セラミック＆ナチュラルラタン調プランター鉢 */}
      <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.3, 0.58, seg]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.42} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.386, 0.376, 0.1, seg]} />
        <meshStandardMaterial color="#e7cba9" roughness={0.7} />
      </mesh>
      {/* ウッドバークチップ土 */}
      <mesh position={[0, 0.64, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.03, seg]} />
        <meshStandardMaterial color="#4a3525" roughness={0.95} />
      </mesh>
      {/* シンボルツリー風の有機的な分岐幹 */}
      <mesh position={[0, 1.12, 0]} rotation={[0.04, 0, -0.05]} castShadow>
        <cylinderGeometry args={[0.055, 0.088, 1.05, 14]} />
        <meshStandardMaterial color="#6b4423" roughness={0.85} />
      </mesh>
      <mesh position={[0.15, 1.48, 0.05]} rotation={[0.18, 0, -0.42]} castShadow>
        <cylinderGeometry args={[0.035, 0.052, 0.68, 12]} />
        <meshStandardMaterial color="#6b4423" roughness={0.85} />
      </mesh>
      <mesh position={[-0.14, 1.54, -0.04]} rotation={[-0.15, 0, 0.38]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 0.68, 12]} />
        <meshStandardMaterial color="#6b4423" roughness={0.85} />
      </mesh>
      <mesh position={[0.02, 1.78, 0.02]} rotation={[0.08, 0, -0.08]} castShadow>
        <cylinderGeometry args={[0.028, 0.042, 0.55, 10]} />
        <meshStandardMaterial color="#784f2b" roughness={0.85} />
      </mesh>
      {/* 大きく艶やかなフィカス/モンステラ調リーフクラスター */}
      {leafClusters.map((leaf, idx) => (
        <mesh
          key={idx}
          position={leaf.pos}
          rotation={leaf.rot}
          scale={leaf.s}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.25, seg, seg]} />
          <meshStandardMaterial color={leaf.c} roughness={0.46} metalness={0.04} />
        </mesh>
      ))}
    </group>
  );
}

function OfficeChair({ position, rotationY = 0, accentColor = '#334155', seg = 24 }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* キャスターベース */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.28, 0.04, seg]} />
        <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* 支柱 */}
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.34, 12]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* 座面 */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.08, 0.46]} />
        <meshStandardMaterial color={accentColor} roughness={0.7} />
      </mesh>
      {/* 背もたれ */}
      <mesh position={[0, 0.74, -0.2]} rotation={[-0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.42, 0.5, 0.07]} />
        <meshStandardMaterial color={accentColor} roughness={0.7} />
      </mesh>
      {/* 肘掛け */}
      <mesh position={[-0.24, 0.58, 0.02]} castShadow>
        <boxGeometry args={[0.04, 0.04, 0.3]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>
      <mesh position={[0.24, 0.58, 0.02]} castShadow>
        <boxGeometry args={[0.04, 0.04, 0.3]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>
    </group>
  );
}

function MeetingTable({ position, color = '#334155', chairColor = '#1e293b', seg = 24 }) {
  return (
    <group position={position}>
      {/* 天板 */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.08, 1.5]} />
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.18} />
      </mesh>
      {/* テーブル中央の電源ユニット風アクセント */}
      <mesh position={[0, 0.785, 0]}>
        <boxGeometry args={[0.6, 0.015, 0.22]} />
        <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.3} />
      </mesh>
      {[
        [-1.3, 0.36, -0.55],
        [1.3, 0.36, -0.55],
        [-1.3, 0.36, 0.55],
        [1.3, 0.36, 0.55]
      ].map((pos, idx) => (
        <mesh key={idx} position={pos} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.72, 12]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.25} />
        </mesh>
      ))}
      <OfficeChair position={[-0.9, 0, 1.05]} rotationY={Math.PI} accentColor={chairColor} seg={seg} />
      <OfficeChair position={[0.9, 0, 1.05]} rotationY={Math.PI} accentColor={chairColor} seg={seg} />
      <OfficeChair position={[-0.9, 0, -1.05]} rotationY={0} accentColor={chairColor} seg={seg} />
      <OfficeChair position={[0.9, 0, -1.05]} rotationY={0} accentColor={chairColor} seg={seg} />
    </group>
  );
}

function WorkstationDesk({
  position,
  rotationY = 0,
  monitorTexture,
  secondaryMonitorTexture,
  chairAccent = '#0284c7',
  seg = 24
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* デスク天板（明るいライトオーク） */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.72, 0.06, 0.88]} />
        <meshStandardMaterial color="#f5e6d3" roughness={0.42} metalness={0.05} />
      </mesh>
      {/* スチール脚 */}
      <mesh position={[-0.78, 0.36, 0]} castShadow>
        <boxGeometry args={[0.05, 0.72, 0.74]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0.78, 0.36, 0]} castShadow>
        <boxGeometry args={[0.05, 0.72, 0.74]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.4} roughness={0.35} />
      </mesh>

      {/* メインワイドモニター（デュアル構成 左側メイン） */}
      <group position={[-0.22, 0, -0.24]}>
        <mesh position={[0, 0.86, -0.02]} castShadow>
          <cylinderGeometry args={[0.03, 0.04, 0.22, 12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} />
        </mesh>
        <mesh position={[0, 1.06, 0]} castShadow>
          <boxGeometry args={[0.82, 0.46, 0.04]} />
          <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.3} />
        </mesh>
        <mesh position={[0, 1.06, 0.023]}>
          <planeGeometry args={[0.76, 0.4]} />
          <meshStandardMaterial
            map={monitorTexture}
            emissive="#38bdf8"
            emissiveIntensity={0.22}
            emissiveMap={monitorTexture}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* サブモニター（デュアル構成 右側・内向きチルト） */}
      <group position={[0.45, 0, -0.15]} rotation={[0, -0.34, 0]}>
        <mesh position={[0, 0.85, -0.02]} castShadow>
          <cylinderGeometry args={[0.026, 0.035, 0.2, 12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} />
        </mesh>
        <mesh position={[0, 1.03, 0]} castShadow>
          <boxGeometry args={[0.56, 0.38, 0.035]} />
          <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.3} />
        </mesh>
        <mesh position={[0, 1.03, 0.02]}>
          <planeGeometry args={[0.51, 0.33]} />
          <meshStandardMaterial
            map={secondaryMonitorTexture || monitorTexture}
            emissive="#34d399"
            emissiveIntensity={0.2}
            emissiveMap={secondaryMonitorTexture || monitorTexture}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* モダンなデスクランプ（左奥） */}
      <group position={[-0.7, 0.77, -0.22]}>
        <mesh position={[0, 0.015, 0]}>
          <cylinderGeometry args={[0.065, 0.075, 0.025, 14]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.17, -0.02]} rotation={[0.15, 0, -0.12]} castShadow>
          <cylinderGeometry args={[0.012, 0.014, 0.32, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} />
        </mesh>
        <mesh position={[0.05, 0.31, 0.04]} rotation={[0.45, 0, -0.35]}>
          <coneGeometry args={[0.075, 0.11, 14]} />
          <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={0.45} />
        </mesh>
      </group>

      {/* キーボード & マウスパッド + マウス */}
      <mesh position={[-0.14, 0.78, 0.1]} castShadow>
        <boxGeometry args={[0.42, 0.02, 0.14]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      <mesh position={[0.24, 0.773, 0.11]}>
        <boxGeometry args={[0.2, 0.008, 0.18]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>
      <mesh position={[0.24, 0.786, 0.11]} scale={[0.8, 0.6, 1.2]} castShadow>
        <sphereGeometry args={[0.032, 12, 12]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.35} />
      </mesh>

      {/* マグカップ & デスクミニ多肉ポット */}
      <mesh position={[0.62, 0.82, 0.18]} castShadow>
        <cylinderGeometry args={[0.045, 0.04, 0.1, 16]} />
        <meshStandardMaterial color="#fb7185" roughness={0.25} />
      </mesh>
      <group position={[-0.65, 0.77, 0.16]}>
        <mesh position={[0, 0.035, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.036, 0.07, 12]} />
          <meshStandardMaterial color="#bae6fd" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.085, 0]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color="#22c55e" roughness={0.5} />
        </mesh>
      </group>

      <OfficeChair position={[0, 0, 0.75]} rotationY={Math.PI} accentColor={chairAccent} seg={seg} />
    </group>
  );
}

function GlassPartition({ position, width = 0.1, length = 4.4, height = 2.3, color = '#6366f1' }) {
  return (
    <group position={position}>
      {/* ガラス本体 */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, length]} />
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={0.18}
          roughness={0.1}
          metalness={0.1}
          reflectivity={0.85}
        />
      </mesh>
      {/* アルミ上下フレーム */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[width + 0.04, 0.08, length + 0.04]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[width + 0.04, 0.08, length + 0.04]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

function OfficeEnvironment({ onFloorClick, clickTarget, qualityConfig }) {
  const woodFloorTex = useMemo(
    () => getWoodFloorTexture(qualityConfig.texSize, qualityConfig.anisotropy),
    [qualityConfig.texSize, qualityConfig.anisotropy]
  );
  const monitorTex = useMemo(() => getMonitorScreenTexture(), []);
  const secondaryMonitorTex = useMemo(() => getDualMonitorSecondaryTexture(), []);
  const zoneCarpetTextures = useMemo(() => {
    const map = {};
    for (const z of OFFICE_ZONES) {
      map[z.id] = getCarpetTexture(z.floorColor, 256, qualityConfig.anisotropy);
    }
    return map;
  }, [qualityConfig.anisotropy]);

  const seg = qualityConfig.seg;

  return (
    <group>
      {/* メインフローリング床 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onFloorClick(e.point.x, e.point.z);
        }}
      >
        <planeGeometry args={[30, 22]} />
        <meshStandardMaterial
          map={woodFloorTex}
          roughness={0.55}
          metalness={0.08}
        />
      </mesh>

      <Grid
        position={[0, 0.002, 0]}
        args={[30, 22]}
        cellSize={1}
        cellThickness={0.35}
        cellColor="#cbd5e1"
        sectionSize={5}
        sectionThickness={0.7}
        sectionColor="#94a3b8"
        fadeDistance={42}
        infiniteGrid={false}
      />

      {/* 各ゾーンの織物カーペット & エリア看板 */}
      {OFFICE_ZONES.map((zone) => {
        const w = zone.bounds.maxX - zone.bounds.minX;
        const d = zone.bounds.maxZ - zone.bounds.minZ;
        const cx = (zone.bounds.minX + zone.bounds.maxX) / 2;
        const cz = (zone.bounds.minZ + zone.bounds.maxZ) / 2;
        return (
          <group key={zone.id}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[cx, 0.008, cz]}
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                onFloorClick(e.point.x, e.point.z);
              }}
            >
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial
                map={zoneCarpetTextures[zone.id]}
                roughness={0.85}
                metalness={0.02}
              />
            </mesh>
            {/* ゾーン枠トリム */}
            <mesh position={[cx, 0.015, zone.bounds.minZ]} receiveShadow>
              <boxGeometry args={[w, 0.02, 0.06]} />
              <meshStandardMaterial color={zone.color} />
            </mesh>
            <Html position={[cx, 0.14, zone.bounds.minZ + 0.75]} center distanceFactor={18} zIndexRange={[10, 0]}>
              <div
                className="px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap pointer-events-none select-none border-2 backdrop-blur-sm shadow-md"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.92)',
                  borderColor: zone.color,
                  color: '#0f172a'
                }}
              >
                {zone.label}
              </div>
            </Html>
          </group>
        );
      })}

      {/* Open Space: コラボレーションテーブル & 厳選大型シンボル観葉植物（従来の四隅4本から2本に厳選・大型化） */}
      <MeetingTable position={[0, 0, 2.2]} color="#f8fafc" chairColor="#10b981" seg={seg} />
      <DetailedPlant position={[-5.7, 0, -2.6]} scale={1.02} seg={seg} />
      <DetailedPlant position={[-5.9, 0, 7.5]} scale={1.08} seg={seg} />

      {/* Meeting Room A */}
      <MeetingTable position={[-9.6, 0, -5.6]} color="#f1f5f9" chairColor="#6366f1" seg={seg} />
      <GlassPartition position={[-5.4, 0, -6.8]} length={5.2} color="#6366f1" />

      {/* Meeting Room B */}
      <MeetingTable position={[9.6, 0, -5.6]} color="#f1f5f9" chairColor="#8b5cf6" seg={seg} />
      <GlassPartition position={[5.4, 0, -6.8]} length={5.2} color="#8b5cf6" />

      {/* Focus Zone デュアルモニターデスク */}
      <WorkstationDesk
        position={[-11.2, 0, 1.8]}
        rotationY={Math.PI / 2}
        monitorTexture={monitorTex}
        secondaryMonitorTexture={secondaryMonitorTex}
        chairAccent="#f59e0b"
        seg={seg}
      />
      <WorkstationDesk
        position={[-11.2, 0, 5.4]}
        rotationY={Math.PI / 2}
        monitorTexture={monitorTex}
        secondaryMonitorTexture={secondaryMonitorTex}
        chairAccent="#f59e0b"
        seg={seg}
      />
      <GlassPartition position={[-7.4, 0, 4.0]} length={7.4} height={1.7} color="#f59e0b" />

      {/* Remote ゾーン デュアルモニターデスク & シンボル観葉植物 */}
      <WorkstationDesk
        position={[11.2, 0, 2.2]}
        rotationY={-Math.PI / 2}
        monitorTexture={monitorTex}
        secondaryMonitorTexture={secondaryMonitorTex}
        chairAccent="#0284c7"
        seg={seg}
      />
      <WorkstationDesk
        position={[11.2, 0, 5.1]}
        rotationY={-Math.PI / 2}
        monitorTexture={monitorTex}
        secondaryMonitorTexture={secondaryMonitorTex}
        chairAccent="#06b6d4"
        seg={seg}
      />
      <DetailedPlant position={[12.3, 0, 7.3]} scale={0.98} seg={seg} />

      {/* オフィス装飾一式（クリスマスツリー・受付カウンター・カフェコーナー・本棚・図表ホワイトボード・ペンダントライト等） */}
      <OfficeDecorations3D qualityConfig={qualityConfig} />

      {/* 奥壁（明るいオフホワイト + 中央パノラマ窓） */}
      <mesh position={[-9.5, 1.3, -10.05]} receiveShadow>
        <boxGeometry args={[9.6, 2.6, 0.22]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.75} />
      </mesh>
      <mesh position={[9.5, 1.3, -10.05]} receiveShadow>
        <boxGeometry args={[9.6, 2.6, 0.22]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.45, -10.05]} receiveShadow>
        <boxGeometry args={[9.4, 0.9, 0.22]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.65, -10.05]}>
        <boxGeometry args={[9.4, 1.5, 0.08]} />
        <meshPhysicalMaterial color="#bae6fd" transparent opacity={0.35} roughness={0.08} />
      </mesh>

      {/* クリック移動先マーカー */}
      {clickTarget && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[clickTarget[0], 0.03, clickTarget[1]]}>
          <ringGeometry args={[0.25, 0.38, 24]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function PerformanceMonitor({ onFpsUpdate }) {
  const { gl } = useThree();
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useFrame(() => {
    framesRef.current += 1;
    const now = performance.now();
    if (now - lastTimeRef.current >= 1000) {
      const fps = Math.round((framesRef.current * 1000) / (now - lastTimeRef.current));
      const triangles = gl.info?.render?.triangles || 0;
      onFpsUpdate({ fps, triangles });
      framesRef.current = 0;
      lastTimeRef.current = now;
    }
  });
  return null;
}

function SceneContent({
  users,
  currentUserId,
  selectedUserId,
  myPos,
  myRot,
  setMyPos,
  setMyRot,
  isMoving,
  setIsMoving,
  clickTarget,
  setClickTarget,
  keysPressedRef,
  onMoveCommit,
  onNearbyChange,
  onTalkToUser,
  onSelectUser,
  onCacheAvatar3D,
  nearbyUserId,
  myEmote,
  userBubbles,
  quality,
  qualityConfig,
  onFpsUpdate
}) {
  const { camera } = useThree();
  const controlsRef = useRef();
  const lastSyncTimeRef = useRef(0);
  const lastCommittedRef = useRef({ x: myPos[0], z: myPos[1], zone: getZoneAtPosition(myPos[0], myPos[1]) });
  const prevMovingRef = useRef(false);
  const cameraFollowInitializedRef = useRef(false);

  const otherUsersWithPos = useMemo(() => {
    return users
      .filter((u) => Number(u.id) !== Number(currentUserId))
      .map((u, idx) => {
        const hasCoord = u.pos_x !== null && u.pos_x !== undefined && u.pos_z !== null && u.pos_z !== undefined;
        const pos = hasCoord
          ? clampFloorPosition(Number(u.pos_x), Number(u.pos_z))
          : getDefaultSpawnPosition(u.current_room || 'open-space', idx + 1);
        return { user: u, pos, rot: Number(u.rotation_y || 0) };
      });
  }, [users, currentUserId]);

  useFrame((state, delta) => {
    const keys = keysPressedRef.current;
    let inputX = 0;
    let inputZ = 0;

    if (keys['KeyW'] || keys['ArrowUp']) inputZ -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) inputZ += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) inputX -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) inputX += 1;

    let nextX = myPos[0];
    let nextZ = myPos[1];
    let nextRot = myRot;
    let movingNow = false;

    if (inputX !== 0 || inputZ !== 0) {
      if (clickTarget) setClickTarget(null);

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const moveDir = new THREE.Vector3()
        .addScaledVector(right, inputX)
        .addScaledVector(forward, -inputZ)
        .normalize();

      nextX += moveDir.x * MOVE_SPEED * delta;
      nextZ += moveDir.z * MOVE_SPEED * delta;
      [nextX, nextZ] = clampFloorPosition(nextX, nextZ);
      nextRot = Math.atan2(moveDir.x, moveDir.z);
      movingNow = true;
    } else if (clickTarget) {
      const dx = clickTarget[0] - myPos[0];
      const dz = clickTarget[1] - myPos[1];
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        const step = Math.min(dist, MOVE_SPEED * delta);
        nextX = myPos[0] + (dx / dist) * step;
        nextZ = myPos[1] + (dz / dist) * step;
        [nextX, nextZ] = clampFloorPosition(nextX, nextZ);
        nextRot = Math.atan2(dx, dz);
        movingNow = true;
      } else {
        setClickTarget(null);
      }
    }

    if (movingNow) {
      setMyPos([nextX, nextZ]);
      setMyRot(nextRot);
    }
    if (movingNow !== isMoving) {
      setIsMoving(movingNow);
    }

    if (controlsRef.current) {
      const targetVec = new THREE.Vector3(nextX, 0.85, nextZ);
      if (!cameraFollowInitializedRef.current) {
        controlsRef.current.target.copy(targetVec);
        cameraFollowInitializedRef.current = true;
      } else if (movingNow) {
        controlsRef.current.target.lerp(targetVec, Math.min(1, delta * 6));
      }
      controlsRef.current.update();
    }

    const now = state.clock.elapsedTime;
    const movedSinceSync = Math.hypot(
      nextX - lastCommittedRef.current.x,
      nextZ - lastCommittedRef.current.z
    );
    const nextZone = getZoneAtPosition(nextX, nextZ);
    const stoppedJustNow = prevMovingRef.current && !movingNow;
    prevMovingRef.current = movingNow;

    if (
      (movingNow && now - lastSyncTimeRef.current > 0.6 && movedSinceSync > 0.25) ||
      (stoppedJustNow && movedSinceSync > 0.1) ||
      nextZone !== lastCommittedRef.current.zone
    ) {
      lastSyncTimeRef.current = now;
      lastCommittedRef.current = { x: nextX, z: nextZ, zone: nextZone };
      onMoveCommit(nextX, nextZ, nextRot, nextZone);
    }

    let closestId = null;
    let closestDist = TALK_DISTANCE;
    for (const item of otherUsersWithPos) {
      const d = Math.hypot(item.pos[0] - nextX, item.pos[1] - nextZ);
      if (d < closestDist) {
        closestDist = d;
        closestId = item.user.id;
      }
    }
    if (closestId !== nearbyUserId) {
      onNearbyChange(closestId);
    }
  });

  const meUser = users.find((u) => Number(u.id) === Number(currentUserId));
  const resolveAvatarBubble = (user, isMe = false) =>
    userBubbles?.[user.id] || (isMe && myEmote ? { text: myEmote, type: 'emote' } : null);

  return (
    <>
      <color attach="background" args={['#dbeafe']} />
      <fog attach="fog" args={['#dbeafe', 34, 68]} />
      <hemisphereLight args={['#ffffff', '#e2e8f0', 1.15]} />
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[12, 20, 14]}
        intensity={1.35}
        color="#fffbeb"
        castShadow
        shadow-mapSize-width={qualityConfig.shadowSize}
        shadow-mapSize-height={qualityConfig.shadowSize}
        shadow-camera-near={1}
        shadow-camera-far={55}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 5.5, 2]} intensity={0.85} distance={18} color="#6ee7b7" />
      <pointLight position={[0, 4.4, -7.0]} intensity={0.6} distance={14} color="#fef3c7" />
      <pointLight position={[-9.6, 5.0, -5.6]} intensity={0.65} distance={14} color="#a5b4fc" />
      <pointLight position={[9.6, 5.0, -5.6]} intensity={0.65} distance={14} color="#c4b5fd" />

      <PerformanceMonitor onFpsUpdate={onFpsUpdate} />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={26}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={0.22}
      />

      <OfficeEnvironment
        clickTarget={clickTarget}
        qualityConfig={qualityConfig}
        onFloorClick={(x, z) => setClickTarget(clampFloorPosition(x, z))}
      />

      {meUser && (
        <OfficeAvatar3D
          user={meUser}
          position={myPos}
          rotationY={myRot}
          isMe
          isMoving={isMoving}
          isSelected={Number(selectedUserId) === Number(meUser.id)}
          quality={quality}
          bubble={resolveAvatarBubble(meUser, true)}
          onSelect={onSelectUser}
          onCacheAvatar3D={onCacheAvatar3D}
        />
      )}

      {otherUsersWithPos.map(({ user, pos, rot }) => (
        <OfficeAvatar3D
          key={user.id}
          user={user}
          position={pos}
          rotationY={rot}
          isNearby={Number(nearbyUserId) === Number(user.id)}
          isSelected={Number(selectedUserId) === Number(user.id)}
          quality={quality}
          bubble={resolveAvatarBubble(user, false)}
          onSelect={onSelectUser}
          onTalk={onTalkToUser}
          onCacheAvatar3D={onCacheAvatar3D}
        />
      ))}
    </>
  );
}

export default function VirtualOffice3DCanvas({
  users,
  currentUserId,
  selectedUserId,
  onSelectUser,
  onTalkToUser,
  onSyncPosition,
  onCacheAvatar3D,
  canExecute,
  autoMoveTarget = null,
  onPositionUpdate,
  onNearbyUserChange,
  myEmote = null,
  userBubbles = null
}) {
  const mountStartRef = useRef(performance.now());
  const [initMs, setInitMs] = useState(null);
  const [perfStats, setPerfStats] = useState({ fps: 0, triangles: 0 });
  const [quality, setQuality] = useState(() => {
    try {
      const saved = localStorage.getItem('vo_3d_quality');
      return saved && QUALITY_CONFIG[saved] ? saved : 'high';
    } catch {
      return 'high';
    }
  });

  const qualityConfig = QUALITY_CONFIG[quality] || QUALITY_CONFIG.high;

  useEffect(() => {
    try {
      localStorage.setItem('vo_3d_quality', quality);
    } catch {
      // ignore storage errors
    }
  }, [quality]);

  const meUser = useMemo(
    () => users.find((u) => Number(u.id) === Number(currentUserId)),
    [users, currentUserId]
  );

  const initialPos = useMemo(() => {
    if (meUser?.pos_x !== null && meUser?.pos_x !== undefined && meUser?.pos_z !== null && meUser?.pos_z !== undefined) {
      return clampFloorPosition(Number(meUser.pos_x), Number(meUser.pos_z));
    }
    return getDefaultSpawnPosition(meUser?.current_room || 'open-space', 0);
  }, [meUser?.id]);

  const [myPos, setMyPos] = useState(initialPos);
  const [myRot, setMyRot] = useState(Number(meUser?.rotation_y || 0));
  const [isMoving, setIsMoving] = useState(false);
  const [clickTarget, setClickTarget] = useState(null);
  const [nearbyUserId, setNearbyUserId] = useState(null);
  const keysPressedRef = useRef({});

  const lastRoomRef = useRef(meUser?.current_room);
  useEffect(() => {
    if (!meUser?.current_room) return;
    const currentZone = getZoneAtPosition(myPos[0], myPos[1]);
    if (meUser.current_room !== lastRoomRef.current && meUser.current_room !== currentZone) {
      lastRoomRef.current = meUser.current_room;
      const next = getDefaultSpawnPosition(meUser.current_room, 0);
      setMyPos(next);
      setClickTarget(null);
    } else {
      lastRoomRef.current = meUser.current_room;
    }
  }, [meUser?.current_room]);

  const nearbyUser = useMemo(
    () => users.find((u) => Number(u.id) === Number(nearbyUserId)) || null,
    [users, nearbyUserId]
  );

  // autoMoveTarget.seq 更新時の自動歩行ターゲット設定
  const lastAutoMoveSeqRef = useRef(null);
  useEffect(() => {
    if (!autoMoveTarget) return;
    const x = Number(autoMoveTarget.x);
    const z = Number(autoMoveTarget.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const seqKey = autoMoveTarget.seq !== undefined && autoMoveTarget.seq !== null
      ? autoMoveTarget.seq
      : `${x},${z}`;
    if (seqKey === lastAutoMoveSeqRef.current) return;
    lastAutoMoveSeqRef.current = seqKey;
    setClickTarget(clampFloorPosition(x, z));
  }, [autoMoveTarget]);

  // 初期配置時および自分の移動時の位置通知
  const lastReportedPosRef = useRef(null);
  useEffect(() => {
    if (!onPositionUpdate) return;
    const x = myPos[0];
    const z = myPos[1];
    const zoneId = getZoneAtPosition(x, z);
    const prev = lastReportedPosRef.current;
    const dist = prev ? Math.hypot(x - prev.x, z - prev.z) : Infinity;
    if (!prev || dist >= 0.06 || prev.zoneId !== zoneId || !isMoving) {
      if (!prev || prev.x !== x || prev.z !== z || prev.zoneId !== zoneId) {
        lastReportedPosRef.current = { x, z, zoneId };
        onPositionUpdate({ x, z, zoneId });
      }
    }
  }, [myPos, isMoving, onPositionUpdate]);

  // 近接ユーザー変化通知
  const prevNearbyUserIdRef = useRef(undefined);
  useEffect(() => {
    if (!onNearbyUserChange) return;
    const normalizedId = nearbyUser ? Number(nearbyUser.id) : null;
    if (prevNearbyUserIdRef.current === normalizedId) return;
    prevNearbyUserIdRef.current = normalizedId;
    onNearbyUserChange(nearbyUser || null);
  }, [nearbyUser, onNearbyUserChange]);

  useEffect(() => {
    const isInputFocused = () => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select';
    };

    const handleKeyDown = (e) => {
      if (isInputFocused()) return;
      keysPressedRef.current[e.code] = true;
      if (e.code === 'KeyE' && nearbyUser && onTalkToUser) {
        e.preventDefault();
        onTalkToUser(nearbyUser);
      }
    };

    const handleKeyUp = (e) => {
      keysPressedRef.current[e.code] = false;
    };

    const handleBlur = () => {
      keysPressedRef.current = {};
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [nearbyUser, onTalkToUser]);

  const handleMoveCommit = useCallback(
    (x, z, rotY, zoneId) => {
      if (canExecute && onSyncPosition) {
        onSyncPosition(x, z, rotY, zoneId);
      }
    },
    [canExecute, onSyncPosition]
  );

  const currentZone = getZoneAtPosition(myPos[0], myPos[1]);
  const currentZoneInfo = OFFICE_ZONES.find((z) => z.id === currentZone) || OFFICE_ZONES[0];

  return (
    <div className="relative w-full h-full bg-[#dbeafe] overflow-hidden">
      <Canvas
        shadows
        dpr={qualityConfig.dpr}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08
        }}
        camera={{ position: [0, 11.5, 13.5], fov: 44 }}
        onCreated={() => {
          setInitMs(Math.round(performance.now() - mountStartRef.current));
        }}
      >
        <SceneContent
          users={users}
          currentUserId={currentUserId}
          selectedUserId={selectedUserId}
          myPos={myPos}
          myRot={myRot}
          setMyPos={setMyPos}
          setMyRot={setMyRot}
          isMoving={isMoving}
          setIsMoving={setIsMoving}
          clickTarget={clickTarget}
          setClickTarget={setClickTarget}
          keysPressedRef={keysPressedRef}
          onMoveCommit={handleMoveCommit}
          onNearbyChange={setNearbyUserId}
          onTalkToUser={onTalkToUser}
          onSelectUser={onSelectUser}
          onCacheAvatar3D={onCacheAvatar3D}
          nearbyUserId={nearbyUserId}
          myEmote={myEmote}
          userBubbles={userBubbles}
          quality={quality}
          qualityConfig={qualityConfig}
          onFpsUpdate={setPerfStats}
        />
      </Canvas>

      {/* 左上: 現在エリア & 操作ガイド */}
      <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1.5 z-10">
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/85 border border-slate-700/80 backdrop-blur-md text-xs text-slate-200 flex items-center gap-2 shadow-lg">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: currentZoneInfo.color }}
          />
          <span className="font-bold">{currentZoneInfo.label}</span>
        </div>
        <div className="px-2.5 py-1 rounded-md bg-slate-950/75 border border-slate-800/80 text-[10px] text-slate-400 backdrop-blur-sm">
          WASD / 矢印キー・床クリックで移動 ｜ ドラッグで視点回転 ｜ アバタークリック or [E] でチャット
        </div>
      </div>

      {/* 右上: 画質プリセット & パフォーマンス計測 HUD */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-lg p-1 backdrop-blur-md shadow-lg">
          <span className="text-[10px] text-slate-400 font-semibold px-1.5">画質:</span>
          {Object.entries(QUALITY_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setQuality(key)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                quality === key
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>
        <div className="px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-800/80 text-[10px] text-slate-300 font-mono backdrop-blur-sm">
          {perfStats.fps} FPS ｜ {perfStats.triangles.toLocaleString()} tris
          {initMs !== null ? ` ｜ 初期描画 ${initMs}ms` : ''}
        </div>
      </div>

      {/* 下部中央: 近接アクションバー */}
      {nearbyUser && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <button
            type="button"
            onClick={() => onTalkToUser && onTalkToUser(nearbyUser)}
            className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xl shadow-emerald-950/60 border border-emerald-300/40 transition cursor-pointer"
          >
            <img
              src={nearbyUser.avatar_url}
              alt={nearbyUser.name}
              className="w-5 h-5 rounded-full object-cover bg-slate-800"
            />
            <span>{nearbyUser.name} さんに話しかける</span>
            <kbd className="px-1.5 py-0.5 rounded bg-emerald-800/80 text-[10px] font-mono">E</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
