import { BoundingBox } from './bounding-box.js';

export const WIDTH = 30;
export const HEIGHT = 45;
export const DURATION = 240;
export const TICK_RATE = 20;
export const INTERACTION_RANGE = 2;
export const AUTO_PICKUP_RANGE = 1.5;
export const REVIVE_DURATION = 2;
export const DIFFICULTIES = {
  easy: { armor: 10, health: 5, label: 'Easy' },
  normal: { armor: 7, health: 4, label: 'Normal' },
  hard: { armor: 5, health: 3, label: 'Hard' }
};
export const ALTARS = [
  { id: 'A1', x: 8.5, y: 7.5, stage: 1, level: 1, name: 'The First Light' },
  { id: 'A2', x: 23.5, y: 7.5, stage: 2, level: 1, name: 'The Forgotten Light' },
  { id: 'B2', x: 8.5, y: 22.5, stage: 2, level: 2, name: 'The Hollow Light' },
  { id: 'C3', x: 22.5, y: 37.5, stage: 3, level: 3, name: 'The Last Light' }
];
export const EXIT = { x: 15, y: 37.5, radius: 2 };
export const SKILLS = {
  reveal: { name: 'Reveal', cost: 20, cooldown: 8, duration: 4, radius: 6, description: 'Expose hidden enemies for both players.' },
  decoy: { name: 'Decoy', cost: 25, cooldown: 10, duration: 5, radius: 6, description: 'Draw enemies away from an altar or a friend.' },
  teleport: { name: 'Teleport', cost: 40, cooldown: 12, duration: 0, radius: 2, description: 'Jump to safe ground. Hold Shift to move a nearby teammate.' },
  suppress: { name: 'Suppress', cost: 30, cooldown: 12, duration: 4, radius: 4, description: 'Slow nearby enemies and the world destroyer.' }
};
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const levelAt = y => Math.min(3, Math.max(1, Math.floor(y / 15) + 1));
export function safeTile(x, y) {
  const point = { x: x + .5, y: y + .5 };
  if (ALTARS.some(altar => distance(point, altar) <= 2) || distance(point, EXIT) <= EXIT.radius) return true;
  // Keep the escape route walkable until world destruction ends the run.
  const finalAltar = ALTARS.find(altar => altar.id === 'C3');
  const dx = EXIT.x - finalAltar.x, dy = EXIT.y - finalAltar.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared ? Math.max(0, Math.min(1, ((point.x - finalAltar.x) * dx + (point.y - finalAltar.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - finalAltar.x - along * dx, point.y - finalAltar.y - along * dy) <= 1;
}

export function createMap() {
  return Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const x = i % WIDTH, y = Math.floor(i / WIDTH), localY = y % 15;
    if (safeTile(x, y)) return 0;
    if ((y === 14 || y === 15 || y === 29 || y === 30) && (x === 14 || x === 15)) return y < 20 ? 2 : 3;
    if (x === 0 || x === WIDTH - 1 || localY === 0 || localY === 14) return 1;
    if ((x === 5 && localY >= 4 && localY <= 7) || (x >= 15 && x <= 19 && localY === 5) || (x === 21 && localY >= 10 && localY <= 12)) return 1;
    return 0;
  });
}

export function tileOpen(map, x, y, stage, destroyed = new Set()) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || destroyed.has(y * WIDTH + x)) return false;
  const tile = map[y * WIDTH + x];
  if (levelAt(y) > stage && tile < 2) return false;
  return tile === 0 || (tile >= 2 && stage >= tile);
}

// Grid collision follows the bounding-box collision approach in Lab 3.
export function canStand(map, x, y, stage, destroyed = new Set(), radius = .26) {
  const box = BoundingBox(y - radius, x - radius, y + radius, x + radius);
  return Object.values(box.getPoints()).every(([px, py]) => tileOpen(map, px, py, stage, destroyed));
}

export function findPath(map, start, end, stage, destroyed = new Set()) {
  const sx = Math.floor(start.x), sy = Math.floor(start.y), ex = Math.floor(end.x), ey = Math.floor(end.y);
  if (sx < 0 || sy < 0 || sx >= WIDTH || sy >= HEIGHT || !tileOpen(map, ex, ey, stage, destroyed)) return [];
  const first = sy * WIDTH + sx, goal = ey * WIDTH + ex;
  const parents = new Int32Array(WIDTH * HEIGHT).fill(-2);
  parents[first] = -1;
  const queue = [first];
  for (let k = 0; k < queue.length && parents[goal] === -2; k++) {
    const current = queue[k], x = current % WIDTH, y = Math.floor(current / WIDTH);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const next = ny * WIDTH + nx;
      if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT || parents[next] !== -2 || !tileOpen(map, nx, ny, stage, destroyed)) continue;
      parents[next] = current; queue.push(next);
    }
  }
  if (parents[goal] === -2) return [];
  const path = [];
  for (let node = goal; node !== first && node >= 0; node = parents[node]) path.push({ x: node % WIDTH + .5, y: Math.floor(node / WIDTH) + .5 });
  return path.reverse();
}
