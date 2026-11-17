import * as THREE from 'three';

const cachedTextures = new Map();

export function getWoodFloorTexture(size = 512, anisotropy = 8) {
  const key = `wood_bright_${size}`;
  if (cachedTextures.has(key)) return cachedTextures.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#e7d5bc';
  ctx.fillRect(0, 0, size, size);

  const plankCount = 8;
  const plankH = size / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const shade = (i * 5) % 14;
    ctx.fillStyle = `rgb(${232 - shade}, ${211 - shade}, ${182 - shade})`;
    ctx.fillRect(0, i * plankH + 1, size, plankH - 2);

    // 柔らかな木目ライン
    ctx.strokeStyle = 'rgba(139, 98, 57, 0.08)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 6; g++) {
      ctx.beginPath();
      const y = i * plankH + (plankH / 6) * g + 2;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + 2, size * 0.7, y - 2, size, y);
      ctx.stroke();
    }

    // 板の横目地・縦継ぎ目
    ctx.fillStyle = 'rgba(148, 114, 78, 0.22)';
    ctx.fillRect(0, i * plankH, size, 1.5);
    const jointX = ((i * 173) % (size * 0.7)) + size * 0.15;
    ctx.fillRect(jointX, i * plankH, 2, plankH);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  cachedTextures.set(key, tex);
  return tex;
}

export function getCarpetTexture(hexBase = '#bbf7d0', size = 256, anisotropy = 8) {
  const key = `carpet_${hexBase}_${size}`;
  if (cachedTextures.has(key)) return cachedTextures.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = hexBase;
  ctx.fillRect(0, 0, size, size);

  // 明るい織物の細かな質感
  for (let y = 0; y < size; y += 3) {
    for (let x = 0; x < size; x += 3) {
      const bright = (x * 13 + y * 29) % 11 === 0;
      ctx.fillStyle = bright ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.035)';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  cachedTextures.set(key, tex);
  return tex;
}

export function getMonitorScreenTexture() {
  const key = 'monitor_screen';
  if (cachedTextures.has(key)) return cachedTextures.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 144);

  // サイドバー
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 48, 144);

  // コード / ダッシュボード行
  const barColors = ['#38bdf8', '#34d399', '#a78bfa', '#60a5fa', '#fbbf24'];
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = barColors[i % barColors.length];
    const w = 40 + ((i * 37) % 120);
    ctx.fillRect(62, 16 + i * 13, w, 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedTextures.set(key, tex);
  return tex;
}

export function getDualMonitorSecondaryTexture() {
  const key = 'monitor_screen_secondary';
  if (cachedTextures.has(key)) return cachedTextures.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 144);

  // 上部ステータスバー
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 22);
  const dots = ['#fb7185', '#fbbf24', '#34d399'];
  dots.forEach((c, idx) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(12 + idx * 10, 11, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // 左側メトリクスカード
  const cardColors = ['#38bdf8', '#a78bfa', '#34d399'];
  cardColors.forEach((c, idx) => {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(10 + idx * 80, 30, 74, 36);
    ctx.fillStyle = c;
    ctx.fillRect(14 + idx * 80, 36, 36, 6);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(14 + idx * 80, 48, 52, 10);
  });

  // 下部エリアチャート風波形
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(10, 74, 236, 60);
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const pts = [
    [18, 120],
    [52, 106],
    [88, 112],
    [124, 92],
    [162, 98],
    [198, 84],
    [236, 88]
  ];
  pts.forEach(([x, y], idx) => {
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedTextures.set(key, tex);
  return tex;
}

export function getWhiteboardDiagramTexture(variant = 'sprint') {
  const key = `whiteboard_diagram_${variant}`;
  if (cachedTextures.has(key)) return cachedTextures.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // 明るいホワイトボード背景 & 薄いドットグリッド
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = '#e2e8f0';
  for (let y = 16; y < 256; y += 16) {
    for (let x = 16; x < 512; x += 16) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  if (variant === 'sprint') {
    // ヘッダー帯
    ctx.fillStyle = '#eef2ff';
    ctx.fillRect(16, 14, 480, 34);
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(16, 14, 8, 34);
    ctx.fillStyle = '#1e1b4b';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('SPRINT ROADMAP & TEAM KPI', 34, 37);

    // 左半分: カンバン＆カラフル付箋ボード
    const cols = [
      { title: 'TODO', color: '#f59e0b', notes: ['#fef08a', '#fed7aa'] },
      { title: 'DOING', color: '#3b82f6', notes: ['#bfdbfe', '#fbcfe8', '#fef08a'] },
      { title: 'DONE!', color: '#10b981', notes: ['#bbf7d0', '#bbf7d0'] }
    ];
    cols.forEach((col, cIdx) => {
      const cx = 20 + cIdx * 84;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cx, 58, 76, 180);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, 58, 76, 180);

      ctx.fillStyle = col.color;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(col.title, cx + 10, 74);

      col.notes.forEach((nColor, nIdx) => {
        const ny = 84 + nIdx * 46;
        ctx.fillStyle = 'rgba(15,23,42,0.08)';
        ctx.fillRect(cx + 10, ny + 3, 58, 36);
        ctx.fillStyle = nColor;
        ctx.fillRect(cx + 8, ny, 58, 36);
        ctx.fillStyle = '#475569';
        ctx.fillRect(cx + 14, ny + 10, 40, 4);
        ctx.fillRect(cx + 14, ny + 20, 28, 4);
      });
    });

    // 右半分: 棒グラフ + 成長トレンド折れ線
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(280, 58, 214, 180);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(280, 58, 214, 180);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('WEEKLY VELOCITY', 294, 78);

    const bars = [
      { h: 52, c: '#93c5fd' },
      { h: 74, c: '#60a5fa' },
      { h: 68, c: '#818cf8' },
      { h: 98, c: '#34d399' },
      { h: 122, c: '#10b981' }
    ];
    bars.forEach((b, idx) => {
      const bx = 302 + idx * 36;
      const by = 218 - b.h;
      ctx.fillStyle = b.c;
      ctx.fillRect(bx, by, 22, b.h);
    });

    // 赤マーカーの上昇矢印
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(308, 162);
    ctx.lineTo(346, 136);
    ctx.lineTo(384, 142);
    ctx.lineTo(420, 108);
    ctx.lineTo(458, 84);
    ctx.stroke();

    // 矢印先端
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(464, 78);
    ctx.lineTo(448, 83);
    ctx.lineTo(459, 95);
    ctx.closePath();
    ctx.fill();
  } else if (variant === 'architecture') {
    // ヘッダー帯
    ctx.fillStyle = '#f5f3ff';
    ctx.fillRect(16, 14, 480, 34);
    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(16, 14, 8, 34);
    ctx.fillStyle = '#2e1065';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('AI WORKSPACE ARCHITECTURE & FLOW', 34, 37);

    // フロー図ノード
    const nodes = [
      { x: 28, y: 80, w: 96, h: 50, bg: '#dbeafe', border: '#3b82f6', label: 'Team UI' },
      { x: 158, y: 80, w: 104, h: 50, bg: '#ede9fe', border: '#8b5cf6', label: 'AI Agent' },
      { x: 158, y: 164, w: 104, h: 50, bg: '#dcfce7', border: '#10b981', label: 'Calendar' },
      { x: 296, y: 120, w: 96, h: 54, bg: '#fef3c7', border: '#f59e0b', label: '3D Office' }
    ];

    // 接続矢印ライン
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(124, 105);
    ctx.lineTo(158, 105);
    ctx.moveTo(210, 130);
    ctx.lineTo(210, 164);
    ctx.moveTo(262, 105);
    ctx.lineTo(296, 142);
    ctx.moveTo(262, 189);
    ctx.lineTo(296, 152);
    ctx.stroke();

    nodes.forEach((n) => {
      ctx.fillStyle = n.bg;
      ctx.fillRect(n.x, n.y, n.w, n.h);
      ctx.strokeStyle = n.border;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(n.x, n.y, n.w, n.h);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(n.label, n.x + 16, n.y + 30);
    });

    // 右側ドーナツグラフ
    const cx = 446;
    const cy = 148;
    const slices = [
      { start: 0, end: Math.PI * 0.9, color: '#8b5cf6' },
      { start: Math.PI * 0.9, end: Math.PI * 1.55, color: '#10b981' },
      { start: Math.PI * 1.55, end: Math.PI * 2, color: '#f59e0b' }
    ];
    slices.forEach((s) => {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 44, s.start, s.end);
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('98%', cx - 12, cy + 4);
  } else {
    // Open Space 用 お知らせ＆アイデアボード
    ctx.fillStyle = '#ecfdf5';
    ctx.fillRect(14, 14, 484, 38);
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('WELCOME TO VIRTUAL OFFICE! 🎄', 28, 39);

    const stickies = [
      { x: 28, y: 70, c: '#fef08a', title: 'Coffee Ready!' },
      { x: 184, y: 74, c: '#fbcfe8', title: 'Holiday Party' },
      { x: 340, y: 68, c: '#bae6fd', title: 'Idea Jam 15:00' },
      { x: 100, y: 156, c: '#bbf7d0', title: 'Free Chat OK!' },
      { x: 276, y: 158, c: '#fed7aa', title: 'Happy Winter!' }
    ];
    stickies.forEach((s) => {
      ctx.fillStyle = 'rgba(15,23,42,0.08)';
      ctx.fillRect(s.x + 3, s.y + 4, 132, 68);
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, 132, 68);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(s.title, s.x + 12, s.y + 30);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(s.x + 12, s.y + 44, 84, 5);
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedTextures.set(key, tex);
  return tex;
}

export function getCafeMenuTexture() {
  const key = 'cafe_menu_board';
  if (cachedTextures.has(key)) return cachedTextures.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');

  // 黒板ベース
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 320);

  // 内側チョーク枠
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, 228, 292);

  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('OFFICE CAFE', 54, 54);

  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(36, 68);
  ctx.lineTo(220, 68);
  ctx.stroke();

  const items = [
    ['Hot Blend', 'FREE'],
    ['Cafe Latte', 'FREE'],
    ['Matcha Milk', 'FREE'],
    ['Hot Cocoa', 'NEW!'],
    ['Fresh Water', '24H']
  ];
  ctx.font = 'bold 15px sans-serif';
  items.forEach(([name, tag], idx) => {
    const y = 108 + idx * 40;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(name, 32, y);
    ctx.fillStyle = tag === 'NEW!' ? '#fda4af' : '#6ee7b7';
    ctx.fillText(tag, 174, y);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedTextures.set(key, tex);
  return tex;
}

export function getWelcomeSignTexture() {
  const key = 'reception_welcome_sign';
  if (cachedTextures.has(key)) return cachedTextures.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 128);

  // パステルグリーンのアクセントライン
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillStyle = '#34d399';
  ctx.fillRect(0, 116, 512, 12);

  // アイコン丸バッジ
  ctx.fillStyle = '#d1fae5';
  ctx.beginPath();
  ctx.arc(76, 65, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.arc(76, 65, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('INFORMATION', 132, 66);
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('WELCOME TO VIRTUAL WORKSPACE', 134, 94);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedTextures.set(key, tex);
  return tex;
}
