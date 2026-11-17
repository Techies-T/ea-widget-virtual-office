export const FLOOR_BOUNDS = {
  minX: -13.2,
  maxX: 13.2,
  minZ: -9.2,
  maxZ: 8.8
};

export const OFFICE_ZONES = [
  {
    id: 'open-space',
    label: '🌳 Open Space (Free)',
    shortLabel: 'Open Space',
    color: '#10b981',
    floorColor: '#bbf7d0',
    bounds: { minX: -7.2, maxX: 7.2, minZ: -4.2, maxZ: 9.2 },
    center: [0, 2.2]
  },
  {
    id: 'meeting-room-a',
    label: '💬 Meeting Room A',
    shortLabel: 'Meeting A',
    color: '#6366f1',
    floorColor: '#c7d2fe',
    bounds: { minX: -13.8, maxX: -5.4, minZ: -9.8, maxZ: -1.4 },
    center: [-9.6, -5.6]
  },
  {
    id: 'meeting-room-b',
    label: '🎥 Meeting Room B',
    shortLabel: 'Meeting B',
    color: '#8b5cf6',
    floorColor: '#ddd6fe',
    bounds: { minX: 5.4, maxX: 13.8, minZ: -9.8, maxZ: -1.4 },
    center: [9.6, -5.6]
  },
  {
    id: 'focus-zone',
    label: '🤫 Focus Zone',
    shortLabel: 'Focus Zone',
    color: '#f59e0b',
    floorColor: '#fde68a',
    bounds: { minX: -13.8, maxX: -7.4, minZ: -1.2, maxZ: 9.2 },
    center: [-10.6, 4.0]
  },
  {
    id: 'remote',
    label: '🏡 Remote',
    shortLabel: 'Remote',
    color: '#06b6d4',
    floorColor: '#bae6fd',
    bounds: { minX: 7.4, maxX: 13.8, minZ: -1.2, maxZ: 9.2 },
    center: [10.6, 4.0]
  }
];

const AVATAR_PALETTE = [
  '#38bdf8',
  '#34d399',
  '#a78bfa',
  '#fbbf24',
  '#f472b6',
  '#60a5fa',
  '#fb7185',
  '#2dd4bf'
];

export function getAvatarColor(userId) {
  const idx = Math.abs(Number(userId) || 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

export function clampFloorPosition(x, z) {
  return [
    Math.max(FLOOR_BOUNDS.minX, Math.min(FLOOR_BOUNDS.maxX, x)),
    Math.max(FLOOR_BOUNDS.minZ, Math.min(FLOOR_BOUNDS.maxZ, z))
  ];
}

export function getZoneAtPosition(x, z) {
  for (const zone of OFFICE_ZONES) {
    if (zone.id === 'open-space') continue;
    const b = zone.bounds;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      return zone.id;
    }
  }
  return 'open-space';
}

export function getDefaultSpawnPosition(roomId, index = 0) {
  const zone = OFFICE_ZONES.find((z) => z.id === roomId) || OFFICE_ZONES[0];
  const angle = (index * 137.5 * Math.PI) / 180;
  const radius = 1.4 + (index % 3) * 0.85;
  const rawX = zone.center[0] + Math.cos(angle) * radius;
  const rawZ = zone.center[1] + Math.sin(angle) * radius;
  return clampFloorPosition(rawX, rawZ);
}
