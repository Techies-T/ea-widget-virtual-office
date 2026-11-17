import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getWhiteboardDiagramTexture,
  getCafeMenuTexture,
  getWelcomeSignTexture,
  getMonitorScreenTexture
} from './proceduralTextures.js';

const NO_RAYCAST = () => null;

function createStarGeometry(outerRadius = 0.24, innerRadius = 0.105, depth = 0.07) {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.018,
    bevelThickness: 0.018
  });
  geom.center();
  return geom;
}

/**
 * 大きなクリスマスツリー（鉢・幹・多段円錐葉・カラフルオーナメント・輝くトップスター・点滅イルミネーション・プレゼント箱）
 */
export function ChristmasTree3D({ position = [5.2, 0, -2.5], scale = 1.05, seg = 24 }) {
  const starRef = useRef();
  const treeLightRef = useRef();
  const bulbMatRefs = useRef([]);
  const bulbMeshRefs = useRef([]);

  const starGeometry = useMemo(() => createStarGeometry(0.23, 0.1, 0.065), []);

  // 多段の円錐葉レイヤー定義
  const foliageLayers = useMemo(
    () => [
      { y: 1.05, radius: 1.12, height: 1.05, color: '#14532d' },
      { y: 1.56, radius: 0.94, height: 0.96, color: '#166534' },
      { y: 2.04, radius: 0.76, height: 0.86, color: '#15803d' },
      { y: 2.46, radius: 0.57, height: 0.74, color: '#16a34a' },
      { y: 2.82, radius: 0.37, height: 0.6, color: '#22c55e' }
    ],
    []
  );

  // カラフルなオーナメント球配置
  const ornaments = useMemo(() => {
    const palette = ['#ef4444', '#fbbf24', '#38bdf8', '#f472b6', '#f8fafc', '#fb923c'];
    const items = [];
    const rings = [
      { y: 0.72, r: 0.96, count: 7, offset: 0.1 },
      { y: 1.24, r: 0.8, count: 6, offset: 0.65 },
      { y: 1.74, r: 0.64, count: 5, offset: 1.2 },
      { y: 2.2, r: 0.47, count: 4, offset: 1.9 },
      { y: 2.58, r: 0.3, count: 3, offset: 2.5 }
    ];
    let idx = 0;
    rings.forEach((ring) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = ring.offset + (i / ring.count) * Math.PI * 2;
        items.push({
          pos: [Math.cos(angle) * ring.r, ring.y, Math.sin(angle) * ring.r],
          color: palette[idx % palette.length],
          size: 0.068 - ring.y * 0.006
        });
        idx += 1;
      }
    });
    return items;
  }, []);

  // 螺旋状に巻かれたイルミネーションライト
  const fairyLights = useMemo(() => {
    const lightColors = ['#fde047', '#fb7185', '#67e8f9', '#86efac', '#fdba74', '#fef08a'];
    const count = 28;
    const list = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 0.68 + t * 2.18;
      const maxR = 1.02 * (1 - t * 0.74);
      const angle = t * Math.PI * 7.5;
      list.push({
        pos: [Math.cos(angle) * maxR, y, Math.sin(angle) * maxR],
        color: lightColors[i % lightColors.length],
        phase: i * 0.72
      });
    }
    return list;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (starRef.current) {
      starRef.current.rotation.y = t * 0.85;
      const starPulse = 1 + Math.sin(t * 3.2) * 0.06;
      starRef.current.scale.setScalar(starPulse);
    }

    if (treeLightRef.current) {
      treeLightRef.current.intensity = 0.75 + Math.sin(t * 2.2) * 0.22;
    }

    for (let i = 0; i < fairyLights.length; i++) {
      const mat = bulbMatRefs.current[i];
      const mesh = bulbMeshRefs.current[i];
      if (!mat) continue;
      const wave = 0.5 + 0.5 * Math.sin(t * 3.1 + fairyLights[i].phase);
      mat.emissiveIntensity = 0.45 + wave * 1.95;
      if (mesh) {
        const s = 0.82 + wave * 0.36;
        mesh.scale.setScalar(s);
      }
    }
  });

  return (
    <group position={position} scale={scale}>
      {/* 足元のホリデー円形ラグ（床クリックを邪魔しないよう raycast 無効） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0]} receiveShadow raycast={NO_RAYCAST}>
        <circleGeometry args={[1.45, Math.max(24, seg)]} />
        <meshStandardMaterial color="#dc2626" roughness={0.88} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} receiveShadow raycast={NO_RAYCAST}>
        <ringGeometry args={[1.18, 1.36, Math.max(24, seg)]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* 木製プランター鉢 + ゴールドのタガ */}
      <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.29, 0.48, seg]} />
        <meshStandardMaterial color="#9a5b32" roughness={0.65} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.372, 0.362, 0.045, seg]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.65} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.325, 0.308, 0.045, seg]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.65} roughness={0.28} />
      </mesh>
      {/* 鉢の中の雪化粧ツリースカート */}
      <mesh position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.04, seg]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </mesh>

      {/* 幹 */}
      <mesh position={[0, 0.68, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.17, 0.62, 14]} />
        <meshStandardMaterial color="#5c3a21" roughness={0.88} />
      </mesh>

      {/* 多段の円錐葉 */}
      {foliageLayers.map((layer, idx) => (
        <mesh
          key={idx}
          position={[0, layer.y, 0]}
          rotation={[0, idx * 0.45, 0]}
          castShadow
          receiveShadow
        >
          <coneGeometry args={[layer.radius, layer.height, Math.max(16, seg)]} />
          <meshStandardMaterial color={layer.color} roughness={0.68} metalness={0.04} />
        </mesh>
      ))}

      {/* カラフルなオーナメント球 */}
      {ornaments.map((orn, idx) => (
        <mesh key={`orn-${idx}`} position={orn.pos} castShadow>
          <sphereGeometry args={[orn.size, 14, 14]} />
          <meshStandardMaterial
            color={orn.color}
            metalness={0.58}
            roughness={0.18}
          />
        </mesh>
      ))}

      {/* アニメーション点滅イルミネーションライト */}
      {fairyLights.map((bulb, idx) => (
        <mesh
          key={`bulb-${idx}`}
          ref={(el) => {
            bulbMeshRefs.current[idx] = el;
          }}
          position={bulb.pos}
        >
          <sphereGeometry args={[0.042, 10, 10]} />
          <meshStandardMaterial
            ref={(el) => {
              bulbMatRefs.current[idx] = el;
            }}
            color={bulb.color}
            emissive={bulb.color}
            emissiveIntensity={1.4}
            roughness={0.15}
          />
        </mesh>
      ))}

      {/* トップの輝く立体スター */}
      <group ref={starRef} position={[0, 3.22, 0]}>
        <mesh geometry={starGeometry} castShadow>
          <meshStandardMaterial
            color="#fde047"
            emissive="#f59e0b"
            emissiveIntensity={1.15}
            metalness={0.5}
            roughness={0.2}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color="#fef9c3" />
        </mesh>
      </group>

      {/* ツリー全体を温かく照らすゆらめきライト */}
      <pointLight
        ref={treeLightRef}
        position={[0, 2.2, 0.35]}
        color="#fde68a"
        intensity={0.8}
        distance={7.5}
      />

      {/* 足元の可愛いプレゼントボックス3個 */}
      {/* ギフト1: レッド × ゴールドリボン */}
      <group position={[-0.64, 0.16, 0.56]} rotation={[0, 0.35, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.34, 0.3, 0.34]} />
          <meshStandardMaterial color="#ef4444" roughness={0.45} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.355, 0.31, 0.06]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.3} metalness={0.3} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.06, 0.31, 0.355]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.3} metalness={0.3} />
        </mesh>
      </group>

      {/* ギフト2: ティール × ホワイトリボン */}
      <group position={[0.62, 0.13, 0.58]} rotation={[0, -0.4, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.3, 0.24, 0.28]} />
          <meshStandardMaterial color="#14b8a6" roughness={0.45} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.315, 0.25, 0.05]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.35} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.05, 0.25, 0.295]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.35} />
        </mesh>
      </group>

      {/* ギフト3: サニーイエロー × ローズリボン */}
      <group position={[0.06, 0.12, 0.82]} rotation={[0, 0.18, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.26, 0.22, 0.26]} />
          <meshStandardMaterial color="#fde047" roughness={0.45} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.275, 0.23, 0.048]} />
          <meshStandardMaterial color="#f43f5e" roughness={0.35} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.048, 0.23, 0.275]} />
          <meshStandardMaterial color="#f43f5e" roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 背が高く存在感のあるシンボルツリー風フィカス/モンステラ調 大型観葉植物
 */
export function LargeSymbolPlant({ position, scale = 1, seg = 24 }) {
  const leafClusters = useMemo(
    () => [
      // 下段の広がるモンステラ/フィカス大葉
      { pos: [0.38, 1.18, 0.18], rot: [0.35, 0.4, -0.38], s: [1.75, 0.28, 1.15], c: '#15803d' },
      { pos: [-0.36, 1.24, 0.24], rot: [0.38, -0.5, 0.35], s: [1.7, 0.28, 1.1], c: '#16a34a' },
      { pos: [0.12, 1.28, -0.4], rot: [-0.42, 0.15, -0.15], s: [1.65, 0.28, 1.12], c: '#166534' },
      { pos: [-0.28, 1.34, -0.28], rot: [-0.3, -0.6, 0.32], s: [1.6, 0.28, 1.05], c: '#15803d' },
      // 中段の豊かな枝葉
      { pos: [0.42, 1.58, -0.08], rot: [0.12, 0.8, -0.35], s: [1.65, 0.32, 1.08], c: '#22c55e' },
      { pos: [-0.4, 1.64, 0.06], rot: [0.18, -0.7, 0.32], s: [1.6, 0.32, 1.08], c: '#16a34a' },
      { pos: [0.06, 1.68, 0.42], rot: [0.42, 0.05, -0.08], s: [1.62, 0.3, 1.06], c: '#22c55e' },
      { pos: [-0.08, 1.72, -0.38], rot: [-0.36, -0.2, 0.12], s: [1.55, 0.3, 1.04], c: '#15803d' },
      // 上段シンボルキャノピー
      { pos: [0.24, 1.96, 0.16], rot: [0.24, 0.5, -0.22], s: [1.45, 0.34, 0.98], c: '#22c55e' },
      { pos: [-0.24, 2.0, -0.12], rot: [-0.2, -0.4, 0.24], s: [1.42, 0.34, 0.96], c: '#4ade80' },
      { pos: [0.0, 2.14, 0.02], rot: [0.08, 0.2, 0.05], s: [1.32, 0.38, 1.05], c: '#4ade80' }
    ],
    []
  );

  return (
    <group position={position} scale={scale}>
      {/* 木製プランタースタンド受け皿 */}
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[0.38, 0.4, 0.08, seg]} />
        <meshStandardMaterial color="#d4a373" roughness={0.65} />
      </mesh>
      {/* 大型ツートンセラミック＆ラタン調プランター鉢 */}
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

      {/* メイン幹 + 分岐する有機的な枝 */}
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

      {/* 大きく艶やかなリーフクラスター */}
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

/**
 * 受付 / インフォメーションカウンター（Open Space 北側ロビー正面）
 */
export function ReceptionCounter3D({ position = [0, 0, -7.3], rotationY = 0, seg = 24 }) {
  const welcomeTex = useMemo(() => getWelcomeSignTexture(), []);
  const screenTex = useMemo(() => getMonitorScreenTexture(), []);
  const slats = [-1.1, -0.88, -0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66, 0.88, 1.1];

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 足元ウェルカムマット */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.92]} receiveShadow raycast={NO_RAYCAST}>
        <planeGeometry args={[2.2, 0.78]} />
        <meshStandardMaterial color="#a7f3d0" roughness={0.88} />
      </mesh>

      {/* カウンター本体ベース（清潔なオフホワイト） */}
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.85, 0.96, 0.78]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.45} />
      </mesh>

      {/* フロントのナチュラルオーク縦木目ルーバー */}
      {slats.map((sx, idx) => (
        <mesh key={idx} position={[sx, 0.48, 0.405]} castShadow>
          <boxGeometry args={[0.09, 0.88, 0.04]} />
          <meshStandardMaterial color="#deb887" roughness={0.52} />
        </mesh>
      ))}

      {/* エメラルドグリーンの間接照明アクセントライン */}
      <mesh position={[0, 0.95, 0.415]}>
        <boxGeometry args={[2.78, 0.035, 0.04]} />
        <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={0.65} />
      </mesh>

      {/* 正面 INFORMATION / WELCOME サインプレート */}
      <mesh position={[0, 0.56, 0.435]}>
        <planeGeometry args={[1.48, 0.37]} />
        <meshStandardMaterial map={welcomeTex} roughness={0.25} />
      </mesh>

      {/* カウンターメイン天板（ライトオーク） */}
      <mesh position={[0, 0.98, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[2.96, 0.06, 0.88]} />
        <meshStandardMaterial color="#f5e6d3" roughness={0.38} />
      </mesh>

      {/* 来客用ハイカウンターシェルフ（ホワイトクォーツ風） */}
      <mesh position={[0, 1.12, 0.24]} castShadow receiveShadow>
        <boxGeometry args={[2.3, 0.05, 0.36]} />
        <meshStandardMaterial color="#ffffff" roughness={0.22} metalness={0.08} />
      </mesh>

      {/* カウンター上の小物 1: 受付タブレット端末 */}
      <group position={[-0.62, 1.15, 0.22]} rotation={[-0.38, 0.2, 0]}>
        <mesh position={[0, 0.1, 0]} castShadow>
          <boxGeometry args={[0.3, 0.21, 0.02]} />
          <meshStandardMaterial color="#1e293b" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.1, 0.012]}>
          <planeGeometry args={[0.26, 0.17]} />
          <meshStandardMaterial
            map={screenTex}
            emissive="#38bdf8"
            emissiveIntensity={0.3}
            emissiveMap={screenTex}
          />
        </mesh>
      </group>

      {/* カウンター上の小物 2: ゴールドの卓上呼び鈴（コールベル） */}
      <group position={[0.05, 1.145, 0.24]}>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.075, 0.082, 0.02, seg]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.035, 0]} castShadow>
          <sphereGeometry args={[0.068, seg, seg, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.78} roughness={0.18} />
        </mesh>
        <mesh position={[0, 0.108, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.02, 12]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* カウンター上の小物 3: カラフルなパンフレットスタンド & ミニフラワー */}
      <group position={[0.72, 1.15, 0.22]}>
        <mesh position={[0, 0.08, 0]} rotation={[-0.2, 0, 0]} castShadow>
          <boxGeometry args={[0.28, 0.18, 0.08]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
        </mesh>
        <mesh position={[-0.07, 0.12, 0.02]} rotation={[-0.2, 0, 0]}>
          <boxGeometry args={[0.08, 0.16, 0.02]} />
          <meshStandardMaterial color="#fb7185" roughness={0.5} />
        </mesh>
        <mesh position={[0.05, 0.12, 0.02]} rotation={[-0.2, 0, 0]}>
          <boxGeometry args={[0.08, 0.16, 0.02]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.5} />
        </mesh>
      </group>

      {/* 一輪挿しフラワーポット */}
      <group position={[-0.95, 1.01, -0.1]}>
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.07, 0.16, 14]} />
          <meshStandardMaterial color="#bae6fd" roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <sphereGeometry args={[0.075, 12, 12]} />
          <meshStandardMaterial color="#f472b6" roughness={0.45} />
        </mesh>
      </group>

      {/* 受付内側のハイスツール */}
      <group position={[0.45, 0, -0.68]}>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.22, 0.24, 0.04, seg]} />
          <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.62, 12]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.66, 0]} castShadow>
          <cylinderGeometry args={[0.21, 0.21, 0.08, seg]} />
          <meshStandardMaterial color="#10b981" roughness={0.65} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * コーヒーメーカー＆ウォーターサーバー付きのカフェコーナー
 */
export function CafeCorner3D({ position = [5.5, 0, 5.6], rotationY = -Math.PI / 2, seg = 24 }) {
  const menuTex = useMemo(() => getCafeMenuTexture(), []);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* カフェカウンター本体（温かみのあるオーク×ミントホワイト） */}
      <mesh position={[-0.25, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.95, 0.9, 0.72]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.6} />
      </mesh>
      {/* カウンター前面の引き戸ディテール */}
      <mesh position={[-0.68, 0.42, 0.37]}>
        <boxGeometry args={[0.82, 0.68, 0.02]} />
        <meshStandardMaterial color="#fde68a" roughness={0.55} />
      </mesh>
      <mesh position={[0.18, 0.42, 0.37]}>
        <boxGeometry args={[0.82, 0.68, 0.02]} />
        <meshStandardMaterial color="#fde68a" roughness={0.55} />
      </mesh>
      {/* カウンター木目天板 */}
      <mesh position={[-0.25, 0.93, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.06, 0.06, 0.8]} />
        <meshStandardMaterial color="#d99b66" roughness={0.42} />
      </mesh>

      {/* エスプレッソ＆ドリップコーヒーメーカー */}
      <group position={[-0.75, 0.96, -0.05]}>
        {/* ベース＆背面タワー */}
        <mesh position={[0, 0.22, -0.06]} castShadow>
          <boxGeometry args={[0.44, 0.44, 0.3]} />
          <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.35} />
        </mesh>
        {/* 赤いレトロモダンなフロントアクセントパネル */}
        <mesh position={[0, 0.32, 0.1]}>
          <boxGeometry args={[0.4, 0.16, 0.06]} />
          <meshStandardMaterial color="#ef4444" roughness={0.28} metalness={0.2} />
        </mesh>
        {/* クローム抽出ヘッド */}
        <mesh position={[-0.08, 0.2, 0.1]}>
          <cylinderGeometry args={[0.045, 0.035, 0.08, 12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* ガラスコーヒーカラフェ */}
        <mesh position={[0.1, 0.11, 0.09]} castShadow>
          <cylinderGeometry args={[0.075, 0.085, 0.16, 14]} />
          <meshStandardMaterial color="#451a03" roughness={0.2} metalness={0.1} />
        </mesh>
        {/* 緑のREADYランプ */}
        <mesh position={[-0.14, 0.33, 0.135]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={1.4} />
        </mesh>
      </group>

      {/* カラフルなマグカップ3個 & ペストリートレイ */}
      {[
        { x: -0.18, z: 0.08, c: '#fb7185' },
        { x: -0.03, z: 0.14, c: '#38bdf8' },
        { x: 0.1, z: 0.05, c: '#34d399' }
      ].map((mug, idx) => (
        <mesh key={idx} position={[mug.x, 1.01, mug.z]} castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.1, 14]} />
          <meshStandardMaterial color={mug.c} roughness={0.28} />
        </mesh>
      ))}

      {/* おやつプレート（ドーナツ風スイーツ） */}
      <group position={[0.42, 0.97, 0.06]}>
        <mesh receiveShadow>
          <cylinderGeometry args={[0.18, 0.15, 0.025, seg]} />
          <meshStandardMaterial color="#ffffff" roughness={0.25} />
        </mesh>
        <mesh position={[-0.05, 0.03, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.048, 0.024, 10, 16]} />
          <meshStandardMaterial color="#f472b6" roughness={0.4} />
        </mesh>
        <mesh position={[0.06, 0.03, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.048, 0.024, 10, 16]} />
          <meshStandardMaterial color="#d97706" roughness={0.45} />
        </mesh>
      </group>

      {/* 黒板風カフェメニューボード（背面パネル） */}
      <group position={[0.38, 1.42, -0.28]}>
        <mesh castShadow>
          <boxGeometry args={[0.64, 0.78, 0.05]} />
          <meshStandardMaterial color="#b45309" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.028]}>
          <planeGeometry args={[0.56, 0.7]} />
          <meshStandardMaterial map={menuTex} roughness={0.65} />
        </mesh>
      </group>

      {/* ウォーターサーバー（クリアブルーのガロンボトル付き） */}
      <group position={[1.12, 0, 0]}>
        {/* 白いディスペンサー筐体 */}
        <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.44, 1.04, 0.44]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.35} metalness={0.08} />
        </mesh>
        {/* 取水口くぼみ */}
        <mesh position={[0, 0.72, 0.215]}>
          <boxGeometry args={[0.28, 0.24, 0.03]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.4} />
        </mesh>
        {/* 冷水(青)・温水(赤)コック */}
        <mesh position={[-0.06, 0.8, 0.235]}>
          <boxGeometry args={[0.04, 0.05, 0.03]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.3} />
        </mesh>
        <mesh position={[0.06, 0.8, 0.235]}>
          <boxGeometry args={[0.04, 0.05, 0.03]} />
          <meshStandardMaterial color="#ef4444" roughness={0.3} />
        </mesh>
        {/* ボトルネック */}
        <mesh position={[0, 1.08, 0]}>
          <cylinderGeometry args={[0.09, 0.14, 0.1, seg]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.3} />
        </mesh>
        {/* 透明アクアブルーの大型ウォーターボトル */}
        <mesh position={[0, 1.34, 0]} castShadow>
          <cylinderGeometry args={[0.19, 0.19, 0.46, seg]} />
          <meshPhysicalMaterial
            color="#38bdf8"
            transparent
            opacity={0.48}
            roughness={0.08}
            metalness={0.05}
            reflectivity={0.9}
          />
        </mesh>
        {/* ボトル内部のミネラルウォーター水位 */}
        <mesh position={[0, 1.3, 0]}>
          <cylinderGeometry args={[0.172, 0.172, 0.34, seg]} />
          <meshStandardMaterial color="#0284c7" transparent opacity={0.55} roughness={0.15} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * ドキュメントキャビネット・本棚（tall: 4段大型本棚 / low: ローキャビネット＋卓上複合機・バインダー）
 */
export function BookshelfCabinet3D({
  position,
  rotationY = 0,
  variant = 'tall',
  seg = 24
}) {
  const bookColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9'];

  if (variant === 'low') {
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        {/* 2段ワイド・ドキュメントローキャビネット */}
        <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.1, 0.92, 0.56]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.48} />
        </mesh>
        {/* ナチュラルオーク天板 */}
        <mesh position={[0, 0.94, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.16, 0.05, 0.6]} />
          <meshStandardMaterial color="#e6ccb2" roughness={0.42} />
        </mesh>
        {/* 前面引き戸＆シルバー取っ手 */}
        <mesh position={[-0.5, 0.45, 0.285]}>
          <boxGeometry args={[0.94, 0.76, 0.02]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
        </mesh>
        <mesh position={[0.5, 0.45, 0.285]}>
          <boxGeometry args={[0.94, 0.76, 0.02]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
        </mesh>

        {/* 天板上のコンパクト複合機 / プリンター */}
        <group position={[-0.52, 0.97, -0.02]}>
          <mesh position={[0, 0.16, 0]} castShadow>
            <boxGeometry args={[0.58, 0.32, 0.44]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.33, 0]}>
            <boxGeometry args={[0.56, 0.04, 0.42]} />
            <meshStandardMaterial color="#334155" roughness={0.4} />
          </mesh>
          {/* 排紙トレイの白い用紙 */}
          <mesh position={[0, 0.18, 0.23]}>
            <boxGeometry args={[0.28, 0.015, 0.14]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>

        {/* カラフルなドキュメントバインダー立て */}
        {bookColors.slice(0, 6).map((c, idx) => (
          <mesh key={idx} position={[0.22 + idx * 0.075, 1.11, -0.04]} castShadow>
            <boxGeometry args={[0.058, 0.28, 0.24]} />
            <meshStandardMaterial color={c} roughness={0.5} />
          </mesh>
        ))}

        {/* 書類スタッキングトレー */}
        <group position={[0.82, 0.97, 0.02]}>
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.3, 0.06, 0.36]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[0.3, 0.06, 0.36]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.45} />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 背高ブックシェルフ外枠（温かみのあるライトオーク） */}
      <mesh position={[0, 1.05, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[1.56, 2.1, 0.04]} />
        <meshStandardMaterial color="#dfc3a3" roughness={0.55} />
      </mesh>
      <mesh position={[-0.76, 1.05, 0]} castShadow>
        <boxGeometry args={[0.05, 2.1, 0.44]} />
        <meshStandardMaterial color="#d4a373" roughness={0.5} />
      </mesh>
      <mesh position={[0.76, 1.05, 0]} castShadow>
        <boxGeometry args={[0.05, 2.1, 0.44]} />
        <meshStandardMaterial color="#d4a373" roughness={0.5} />
      </mesh>

      {/* 下段収納扉（ホワイト） */}
      <mesh position={[0, 0.34, 0.02]} castShadow>
        <boxGeometry args={[1.46, 0.64, 0.4]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.42} />
      </mesh>

      {/* 棚板 4枚 */}
      {[0.68, 1.14, 1.6, 2.07].map((sy, idx) => (
        <mesh key={idx} position={[0, sy, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.52, 0.04, 0.44]} />
          <meshStandardMaterial color="#d4a373" roughness={0.48} />
        </mesh>
      ))}

      {/* 1段目のカラフルな書籍＆ファイルボックス */}
      {Array.from({ length: 11 }).map((_, idx) => {
        const h = 0.28 + (idx % 3) * 0.04;
        return (
          <mesh
            key={`b1-${idx}`}
            position={[-0.6 + idx * 0.085, 0.7 + h / 2, 0.02]}
            castShadow
          >
            <boxGeometry args={[0.068, h, 0.26]} />
            <meshStandardMaterial color={bookColors[idx % bookColors.length]} roughness={0.52} />
          </mesh>
        );
      })}
      <mesh position={[0.5, 0.86, 0.02]} castShadow>
        <boxGeometry args={[0.32, 0.3, 0.28]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.6} />
      </mesh>

      {/* 2段目のファイル＆ミニ地球儀 */}
      {Array.from({ length: 8 }).map((_, idx) => {
        const h = 0.27 + ((idx + 1) % 3) * 0.035;
        return (
          <mesh
            key={`b2-${idx}`}
            position={[0.05 + idx * 0.082, 1.16 + h / 2, 0.02]}
            castShadow
          >
            <boxGeometry args={[0.066, h, 0.25]} />
            <meshStandardMaterial color={bookColors[(idx + 3) % bookColors.length]} roughness={0.52} />
          </mesh>
        );
      })}
      {/* 可愛い水色のミニ地球儀 */}
      <group position={[-0.42, 1.16, 0.04]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.08, 0.09, 0.03, seg]} />
          <meshStandardMaterial color="#b45309" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.17, 0]} castShadow>
          <sphereGeometry args={[0.12, seg, seg]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.35} />
        </mesh>
      </group>

      {/* 3段目の本＆ミニグリーン鉢 */}
      {Array.from({ length: 7 }).map((_, idx) => (
        <mesh
          key={`b3-${idx}`}
          position={[-0.58 + idx * 0.085, 1.76, 0.02]}
          castShadow
        >
          <boxGeometry args={[0.068, 0.28, 0.24]} />
          <meshStandardMaterial color={bookColors[(idx + 2) % bookColors.length]} roughness={0.52} />
        </mesh>
      ))}
      <group position={[0.42, 1.62, 0.04]}>
        <mesh position={[0, 0.07, 0]}>
          <cylinderGeometry args={[0.08, 0.06, 0.14, 14]} />
          <meshStandardMaterial color="#fb7185" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.19, 0]}>
          <sphereGeometry args={[0.11, 14, 14]} />
          <meshStandardMaterial color="#22c55e" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 図表・グラフテクスチャ付きホワイトボード（壁掛け＆スタンド式対応）
 */
export function WhiteboardWithChart3D({
  position,
  rotationY = 0,
  variant = 'sprint',
  width = 3.2,
  height = 1.45,
  freestanding = false
}) {
  const chartTex = useMemo(() => getWhiteboardDiagramTexture(variant), [variant]);
  const boardCenterY = freestanding ? 1.18 : 0;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 可動スタンド脚（freestanding の場合、床 y=0 基準） */}
      {freestanding && (
        <group>
          <mesh position={[-width / 2 + 0.08, 0.82, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 1.6, 12]} />
            <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[width / 2 - 0.08, 0.82, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 1.6, 12]} />
            <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[-width / 2 + 0.08, 0.03, 0]}>
            <boxGeometry args={[0.08, 0.05, 0.68]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[width / 2 - 0.08, 0.03, 0]}>
            <boxGeometry args={[0.08, 0.05, 0.68]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      )}

      <group position={[0, boardCenterY, 0]}>
        {/* アルミ外枠フレーム */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, height, 0.07]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.55} roughness={0.3} />
        </mesh>

        {/* 図表・グラフが描かれたボード面 */}
        <mesh position={[0, 0, 0.038]}>
          <planeGeometry args={[width - 0.12, height - 0.12]} />
          <meshStandardMaterial map={chartTex} roughness={0.22} metalness={0.02} />
        </mesh>

        {/* 下部マーカーペントレー + 3色マーカー & イレーザー */}
        <mesh position={[0, -height / 2 + 0.02, 0.08]} castShadow>
          <boxGeometry args={[width * 0.65, 0.03, 0.1]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.28} />
        </mesh>
        {[
          { x: -0.35, c: '#ef4444' },
          { x: -0.18, c: '#2563eb' },
          { x: -0.01, c: '#10b981' }
        ].map((m, idx) => (
          <mesh
            key={idx}
            position={[m.x, -height / 2 + 0.045, 0.085]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.014, 0.014, 0.12, 8]} />
            <meshStandardMaterial color={m.c} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0.28, -height / 2 + 0.05, 0.085]}>
          <boxGeometry args={[0.14, 0.04, 0.06]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.6} />
        </mesh>

        {/* カラフルな丸マグネット */}
        {[
          { x: width / 2 - 0.22, y: height / 2 - 0.18, c: '#ef4444' },
          { x: width / 2 - 0.34, y: height / 2 - 0.18, c: '#fbbf24' },
          { x: width / 2 - 0.46, y: height / 2 - 0.18, c: '#3b82f6' }
        ].map((mag, idx) => (
          <mesh key={idx} position={[mag.x, mag.y, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.032, 0.032, 0.018, 12]} />
            <meshStandardMaterial color={mag.c} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * 天井から吊り下がるモダンなペンダントライト群（床クリックを遮らないよう全メッシュ raycast 無効）
 */
function DomePendantCluster({
  position,
  shadeColor = '#f8fafc',
  accentColor = '#d4a373',
  glowColor = '#fef3c7',
  offsets = [-0.85, 0, 0.85],
  seg = 20
}) {
  return (
    <group position={position}>
      {/* シーリングレール */}
      <mesh position={[0, 1.55, 0]} raycast={NO_RAYCAST}>
        <boxGeometry args={[offsets.length > 1 ? 2.2 : 0.4, 0.05, 0.14]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.35} />
      </mesh>
      {offsets.map((ox, idx) => (
        <group key={idx} position={[ox, 0, 0]}>
          {/* 吊りコード */}
          <mesh position={[0, 0.82, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.01, 0.01, 1.45, 8]} />
            <meshStandardMaterial color="#475569" roughness={0.5} />
          </mesh>
          {/* ウッドソケットキャップ */}
          <mesh position={[0, 0.14, 0]} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.055, 0.075, 0.11, 14]} />
            <meshStandardMaterial color={accentColor} roughness={0.45} />
          </mesh>
          {/* 北欧風ドームシェード */}
          <mesh position={[0, -0.02, 0]} raycast={NO_RAYCAST}>
            <sphereGeometry args={[0.26, seg, seg, 0, Math.PI * 2, 0, Math.PI * 0.54]} />
            <meshStandardMaterial
              color={shadeColor}
              roughness={0.35}
              metalness={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* 温かい発光バルブ */}
          <mesh position={[0, -0.04, 0]} raycast={NO_RAYCAST}>
            <sphereGeometry args={[0.085, 12, 12]} />
            <meshStandardMaterial
              color={glowColor}
              emissive={glowColor}
              emissiveIntensity={1.35}
              roughness={0.15}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function LinearModernPendant({ position, color = '#6366f1' }) {
  return (
    <group position={position}>
      <mesh position={[-0.85, 0.82, 0]} raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.008, 0.008, 1.5, 8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0.85, 0.82, 0]} raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.008, 0.008, 1.5, 8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      {/* スリム照明バー */}
      <mesh position={[0, 0.05, 0]} raycast={NO_RAYCAST}>
        <boxGeometry args={[2.2, 0.06, 0.14]} />
        <meshStandardMaterial color="#334155" metalness={0.45} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.015, 0]} raycast={NO_RAYCAST}>
        <boxGeometry args={[2.12, 0.025, 0.11]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#fef9c3"
          emissiveIntensity={1.25}
        />
      </mesh>
      <mesh position={[0, 0.085, 0]} raycast={NO_RAYCAST}>
        <boxGeometry args={[2.2, 0.018, 0.145]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

/**
 * コラボレーションテーブル上のノートPC・文具・ミニグリーン装飾
 */
function CollabTableAccessories({ position = [0, 0.78, 2.2], seg = 20 }) {
  const screenTex = useMemo(() => getMonitorScreenTexture(), []);

  return (
    <group position={position}>
      {/* 中央の可愛いミニグリーンポット */}
      <group position={[0, 0.01, 0]}>
        <mesh position={[0, 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.07, 0.12, seg]} />
          <meshStandardMaterial color="#fde68a" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.16, 0]} castShadow>
          <sphereGeometry args={[0.11, seg, seg]} />
          <meshStandardMaterial color="#10b981" roughness={0.5} />
        </mesh>
      </group>

      {/* 開いたノートPC 1（手前席用） */}
      <group position={[-0.85, 0.01, 0.36]} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0.01, 0]} castShadow>
          <boxGeometry args={[0.36, 0.018, 0.25]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.28} />
        </mesh>
        <group position={[0, 0.02, -0.12]} rotation={[-0.28, 0, 0]}>
          <mesh position={[0, 0.11, 0]} castShadow>
            <boxGeometry args={[0.36, 0.22, 0.012]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.11, 0.008]}>
            <planeGeometry args={[0.33, 0.19]} />
            <meshStandardMaterial
              map={screenTex}
              emissive="#38bdf8"
              emissiveIntensity={0.25}
              emissiveMap={screenTex}
            />
          </mesh>
        </group>
      </group>

      {/* 開いたノートPC 2（奥席用） */}
      <group position={[0.85, 0.01, -0.36]}>
        <mesh position={[0, 0.01, 0]} castShadow>
          <boxGeometry args={[0.36, 0.018, 0.25]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.28} />
        </mesh>
        <group position={[0, 0.02, -0.12]} rotation={[-0.28, 0, 0]}>
          <mesh position={[0, 0.11, 0]} castShadow>
            <boxGeometry args={[0.36, 0.22, 0.012]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.11, 0.008]}>
            <planeGeometry args={[0.33, 0.19]} />
            <meshStandardMaterial
              map={screenTex}
              emissive="#38bdf8"
              emissiveIntensity={0.25}
              emissiveMap={screenTex}
            />
          </mesh>
        </group>
      </group>

      {/* カラフルノートブック＆マグカップ */}
      <mesh position={[0.78, 0.018, 0.34]} rotation={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.22, 0.025, 0.28]} />
        <meshStandardMaterial color="#a78bfa" roughness={0.5} />
      </mesh>
      <mesh position={[-0.46, 0.05, -0.32]} castShadow>
        <cylinderGeometry args={[0.042, 0.038, 0.09, 14]} />
        <meshStandardMaterial color="#34d399" roughness={0.28} />
      </mesh>
    </group>
  );
}

/**
 * Nintendo風の丸みと温かみがあるくつろぎペアソファ＆ローテーブル（Open Space 南西ラウンジ）
 */
function CozyLoungeCorner3D({ position = [-3.9, 0, 6.6], rotationY = 0.38, seg = 24 }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* パステルラグ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.35]} receiveShadow raycast={NO_RAYCAST}>
        <circleGeometry args={[1.35, Math.max(24, seg)]} />
        <meshStandardMaterial color="#fef9c3" roughness={0.9} />
      </mesh>

      {/* 2人掛けコージーソファ */}
      <mesh position={[0, 0.24, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[1.68, 0.34, 0.74]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.72} />
      </mesh>
      {/* 背もたれ */}
      <mesh position={[0, 0.56, -0.5]} rotation={[-0.1, 0, 0]} castShadow>
        <boxGeometry args={[1.68, 0.48, 0.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.72} />
      </mesh>
      {/* 丸みのある左右アームレスト */}
      <mesh position={[-0.82, 0.42, -0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.74, 16]} />
        <meshStandardMaterial color="#0284c7" roughness={0.72} />
      </mesh>
      <mesh position={[0.82, 0.42, -0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.74, 16]} />
        <meshStandardMaterial color="#0284c7" roughness={0.72} />
      </mesh>
      {/* 可愛いパステルクッション2個 */}
      <mesh position={[-0.48, 0.5, -0.34]} rotation={[0.2, 0.2, -0.15]} castShadow>
        <boxGeometry args={[0.32, 0.3, 0.12]} />
        <meshStandardMaterial color="#fde047" roughness={0.65} />
      </mesh>
      <mesh position={[0.5, 0.5, -0.34]} rotation={[0.2, -0.2, 0.15]} castShadow>
        <boxGeometry args={[0.32, 0.3, 0.12]} />
        <meshStandardMaterial color="#fb7185" roughness={0.65} />
      </mesh>

      {/* 木製丸コーヒーテーブル */}
      <group position={[0, 0, 0.68]}>
        <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.46, 0.46, 0.045, seg]} />
          <meshStandardMaterial color="#f5e6d3" roughness={0.4} />
        </mesh>
        {[-0.24, 0.24].map((lx) =>
          [-0.2, 0.2].map((lz, idx) => (
            <mesh key={`${lx}-${idx}`} position={[lx, 0.19, lz]} castShadow>
              <cylinderGeometry args={[0.025, 0.02, 0.36, 10]} />
              <meshStandardMaterial color="#b45309" roughness={0.55} />
            </mesh>
          ))
        )}
        {/* テーブル上のマガジン＆ティーカップ */}
        <mesh position={[-0.1, 0.415, 0.04]} rotation={[0, 0.4, 0]}>
          <boxGeometry args={[0.22, 0.02, 0.16]} />
          <meshStandardMaterial color="#6ee7b7" roughness={0.5} />
        </mesh>
        <mesh position={[0.16, 0.44, -0.06]} castShadow>
          <cylinderGeometry args={[0.04, 0.035, 0.075, 12]} />
          <meshStandardMaterial color="#f97316" roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * オフィス全体の装飾・クリスマスツリー・カフェ・受付・本棚・ホワイトボード・照明一式
 */
export default function OfficeDecorations3D({ qualityConfig }) {
  const seg = qualityConfig?.seg || 24;

  return (
    <group>
      {/* 1. 大きなクリスマスツリー（Open Space 北東コーナー付近・動線を妨げないベストポジション） */}
      <ChristmasTree3D position={[5.2, 0, -2.5]} scale={1.06} seg={seg} />

      {/* 2. 受付 / インフォメーションカウンター（北側パノラマ窓前のエントランスロビー） */}
      <ReceptionCounter3D position={[0, 0, -7.3]} rotationY={0} seg={seg} />

      {/* 4. コーヒーメーカー＆ウォーターサーバー付きのカフェコーナー（Open Space 南東コーナー） */}
      <CafeCorner3D position={[5.5, 0, 5.6]} rotationY={-Math.PI / 2} seg={seg} />

      {/* 5. ドキュメントキャビネット・本棚 */}
      {/* Open Space 西側パーティション沿いのローキャビネット＆複合機ステーション */}
      <BookshelfCabinet3D
        position={[-6.55, 0, 2.5]}
        rotationY={Math.PI / 2}
        variant="low"
        seg={seg}
      />
      {/* Focus Zone デスク間の大型ブックシェルフ */}
      <BookshelfCabinet3D
        position={[-12.85, 0, 3.6]}
        rotationY={Math.PI / 2}
        variant="tall"
        seg={seg}
      />
      {/* Remote Zone 奥側の大型ブックシェルフ */}
      <BookshelfCabinet3D
        position={[11.2, 0, -0.55]}
        rotationY={0}
        variant="tall"
        seg={seg}
      />

      {/* 6. 図表・グラフが描かれたホワイトボード（Meeting Room A / B + ロビー可動アイデアボード） */}
      <WhiteboardWithChart3D
        position={[-9.6, 1.42, -9.84]}
        variant="sprint"
        width={3.3}
        height={1.45}
      />
      <WhiteboardWithChart3D
        position={[9.6, 1.42, -9.84]}
        variant="architecture"
        width={3.3}
        height={1.45}
      />
      <WhiteboardWithChart3D
        position={[-3.85, 0, -7.6]}
        rotationY={0.35}
        variant="welcome"
        width={1.65}
        height={1.05}
        freestanding
      />

      {/* 7. コラボテーブル上のノートPC＆小物・くつろぎラウンジソファ */}
      <CollabTableAccessories position={[0, 0.78, 2.2]} seg={seg} />
      <CozyLoungeCorner3D position={[-3.85, 0, 6.65]} rotationY={0.38} seg={seg} />

      {/* 8. 天井から吊り下がるモダンなペンダントライト群 */}
      <DomePendantCluster
        position={[0, 3.45, 2.2]}
        shadeColor="#ffffff"
        accentColor="#d4a373"
        glowColor="#fef3c7"
        offsets={[-0.95, 0, 0.95]}
        seg={seg}
      />
      <DomePendantCluster
        position={[0, 3.45, -7.3]}
        shadeColor="#ecfdf5"
        accentColor="#10b981"
        glowColor="#fef9c3"
        offsets={[-0.65, 0.65]}
        seg={seg}
      />
      <DomePendantCluster
        position={[5.5, 3.35, 5.6]}
        shadeColor="#fed7aa"
        accentColor="#ea580c"
        glowColor="#fde68a"
        offsets={[0]}
        seg={seg}
      />
      <LinearModernPendant position={[-9.6, 3.45, -5.6]} color="#6366f1" />
      <LinearModernPendant position={[9.6, 3.45, -5.6]} color="#8b5cf6" />
    </group>
  );
}
