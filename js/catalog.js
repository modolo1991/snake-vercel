export const STORAGE_KEY = 'snake-deluxe-save-v2';
export const COIN_SPAWN_EVERY = 4;
export const COIN_LIFE_STEPS = 16;

export const levelDefs = [
  { name: 'Garden Start', speed: 7.2, target: 6, obstacles: [], tunnels: 0, coinValue: 1 },
  { name: 'Twin Tunnels', speed: 8.1, target: 8, obstacles: [], tunnels: 1, coinValue: 1 },
  { name: 'Brick Lane', speed: 9.1, target: 10, obstacles: line(6, 6, 6, 13).concat(line(13, 6, 13, 13)), tunnels: 1, coinValue: 2 },
  { name: 'Crosswind', speed: 10.1, target: 12, obstacles: line(4, 10, 8, 10).concat(line(11, 10, 15, 10)).concat(line(10, 4, 10, 8)).concat(line(10, 11, 10, 15)), tunnels: 2, coinValue: 2 },
  { name: 'Vault', speed: 11.3, target: 14, obstacles: rectBorder(4, 4, 11, 11), tunnels: 2, coinValue: 3 }
];

export const catalog = [
  { id: 'skin-mint', type: 'skin', name: 'Mint', cost: 0, desc: 'Classic green.', colors: { body: '#34d399', head: '#10b981', eye: '#06281d' } },
  { id: 'skin-gold', type: 'skin', name: 'Gold', cost: 10, desc: 'A shiny prestige skin.', colors: { body: '#fbbf24', head: '#f59e0b', eye: '#4b2e05' } },
  { id: 'skin-neon', type: 'skin', name: 'Neon', cost: 18, desc: 'Blue-purple arcade glow.', colors: { body: '#60a5fa', head: '#8b5cf6', eye: '#130b2f' } },
  { id: 'skin-coral', type: 'skin', name: 'Coral', cost: 24, desc: 'Bright sunset look.', colors: { body: '#fb7185', head: '#ef4444', eye: '#3b0b16' } },
  { id: 'power-shield', type: 'power', name: 'Shield', cost: 12, desc: 'One crash save each run.' },
  { id: 'power-slow', type: 'power', name: 'Slow Time', cost: 14, desc: 'Take 12% off level speed.' },
  { id: 'power-magnet', type: 'power', name: 'Coin Magnet', cost: 16, desc: 'Nearby coins slide into you.' }
];

export function defaultProfile() {
  return {
    best: 0,
    coins: 0,
    owned: ['skin-mint'],
    equippedSkin: 'skin-mint',
    activePowers: [],
    updatedAt: new Date().toISOString(),
  };
}

function line(x1, y1, x2, y2) {
  const cells = [];
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  let x = x1;
  let y = y1;
  cells.push({ x, y });
  while (x !== x2 || y !== y2) {
    if (x !== x2) x += dx;
    if (y !== y2) y += dy;
    cells.push({ x, y });
  }
  return cells;
}

function rectBorder(x, y, w, h) {
  const cells = [];
  for (let xx = x; xx <= x + w; xx++) {
    cells.push({ x: xx, y });
    cells.push({ x: xx, y: y + h });
  }
  for (let yy = y + 1; yy < y + h; yy++) {
    cells.push({ x, y: yy });
    cells.push({ x: x + w, y: yy });
  }
  return dedupeCells(cells);
}

function dedupeCells(cells) {
  const seen = new Set();
  return cells.filter((cell) => {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
