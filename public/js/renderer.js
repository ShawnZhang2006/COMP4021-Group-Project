import { ALTARS, EXIT, WIDTH, HEIGHT, createMap, levelAt, safeTile, distance } from '../shared/world.js';

const PALETTES = [null, { floor: '#26372c', alternate: '#293b30', line: '#344738', wall: '#4d5e46', side: '#19271e' }, { floor: '#32382b', alternate: '#353d2d', line: '#424b34', wall: '#636449', side: '#232a1e' }, { floor: '#2c3435', alternate: '#30393a', line: '#3c4845', wall: '#57665f', side: '#1c2926' }];
const COLORS = { ember: '#ff9772', mint: '#b8e4c2' };
const lerp = (a, b, amount) => a + (b - a) * amount;
const hash = (x, y) => Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;

function fitCanvas(canvas) {
  const ratio = Math.min(2, window.devicePixelRatio || 1), width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return null;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function circle(ctx, x, y, radius, fill, stroke) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function glow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function diamond(ctx, x, y, radius, color) {
  ctx.beginPath(); ctx.moveTo(x, y - radius); ctx.lineTo(x + radius * .55, y); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius * .55, y); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

export class Renderer {
  constructor(canvas, minimap) {
    this.canvas = canvas; this.minimap = minimap; this.map = createMap();
    this.camera = null; this.state = null; this.localId = null; this.particles = [];
    this.positions = new Map(); this.target = null; this.geometry = null;
  }

  setState(state, localId) { this.state = state; this.localId = localId; }
  reset() { this.camera = null; this.positions.clear(); this.particles = []; this.target = null; }
  screenToWorld(clientX, clientY) {
    if (!this.geometry) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect(), g = this.geometry;
    return { x: (clientX - rect.left - g.originX) / g.unit + this.camera.x, y: (clientY - rect.top - g.originY) / g.unit + this.camera.y };
  }

  events(events) {
    for (const event of events) {
      if (!Number.isFinite(event.x)) continue;
      const color = event.type === 'altar' ? '#b8e4c2' : event.type === 'hit' ? '#ff6b6b' : event.type === 'kill' ? '#ffd399' : '#ff9772';
      const count = event.type === 'altar' ? 28 : event.type === 'shot' ? 2 : 8;
      for (let i = 0; i < count; i++) this.particles.push({ x: event.x, y: event.y, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, life: .4 + Math.random() * .5, maxLife: 1, color });
    }
    this.particles = this.particles.slice(-350);
  }

  draw(time, dt) {
    const state = this.state, local = state?.players.find(p => p.id === this.localId), fit = fitCanvas(this.canvas);
    if (!state || !local || !fit) return;
    const { ctx, width: w, height: h } = fit, unit = w < 700 ? 37 : 42;
    if (!this.camera) this.camera = { x: local.x, y: local.y };
    this.camera.x = lerp(this.camera.x, local.x, .16); this.camera.y = lerp(this.camera.y, local.y, .16);
    const originX = (w - (w < 700 ? 110 : 200)) / 2, originY = h * .54;
    this.geometry = { unit, originX, originY };
    const sx = x => originX + (x - this.camera.x) * unit, sy = y => originY + (y - this.camera.y) * unit;
    ctx.fillStyle = '#0b1411'; ctx.fillRect(0, 0, w, h);
    const destroyed = new Set(state.destroyed), warnings = new Set(state.boss?.warnings || []);
    const minY = Math.max(0, Math.floor(this.camera.y - originY / unit) - 1), maxY = Math.min(HEIGHT - 1, Math.ceil(this.camera.y + (h - originY) / unit) + 1);
    for (let y = minY; y <= maxY; y++) for (let x = 0; x < WIDTH; x++) {
      const px = sx(x), py = sy(y), index = y * WIDTH + x;
      if (px < -unit || px > w + unit) continue;
      const level = levelAt(y), palette = PALETTES[level], tile = this.map[index];
      if (destroyed.has(index)) {
        if (hash(x, y) > .7) { ctx.fillStyle = '#4d342c'; ctx.fillRect(px + 10, py + 10 + Math.sin(time + x) * 3, 2, 2); }
        continue;
      }
      const locked = level > state.stage && tile < 2;
      ctx.globalAlpha = locked ? .32 : 1;
      ctx.fillStyle = (x + y) % 2 ? palette.floor : palette.alternate; ctx.fillRect(px, py, unit, unit);
      ctx.strokeStyle = palette.line; ctx.lineWidth = .6; ctx.strokeRect(px + .5, py + .5, unit - 1, unit - 1);
      if (tile === 1) {
        ctx.fillStyle = palette.side; ctx.fillRect(px + 1, py + 5, unit - 2, unit - 4);
        ctx.fillStyle = palette.wall; ctx.fillRect(px + 2, py + 1, unit - 4, unit - 9);
        ctx.fillStyle = '#b8c19a18'; ctx.fillRect(px + 4, py + 3, unit - 8, 2);
        ctx.strokeStyle = '#0c1b1680'; ctx.beginPath(); ctx.moveTo(px + unit * .6, py + 2); ctx.lineTo(px + unit * .6, py + unit - 8); ctx.stroke();
      } else if (tile >= 2 && state.stage < tile) {
        ctx.fillStyle = '#172c2580'; ctx.fillRect(px, py, unit, unit);
        ctx.strokeStyle = '#e3b478'; ctx.lineWidth = 1.4;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px + k * 11, py); ctx.lineTo(px + k * 11, py + unit); ctx.stroke(); }
      } else if (hash(x, y) > .82 && !safeTile(x, y)) {
        ctx.strokeStyle = '#83966544'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 10, py + 29); ctx.lineTo(px + 8, py + 23); ctx.moveTo(px + 10, py + 29); ctx.lineTo(px + 13, py + 20); ctx.stroke();
      }
      if (warnings.has(index)) {
        ctx.fillStyle = `rgba(255,103,66,${.17 + Math.sin(time * 14) * .1})`; ctx.fillRect(px, py, unit, unit);
        ctx.strokeStyle = '#ff966280'; ctx.beginPath(); ctx.moveTo(px + 5, py + 2); ctx.lineTo(px + 19, py + 21); ctx.lineTo(px + 11, py + 29); ctx.lineTo(px + 25, py + 40); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (const altar of state.altars) {
      const x = sx(altar.x), y = sy(altar.y), unlocked = altar.stage <= state.stage;
      if (y < -120 || y > h + 120) continue;
      const color = altar.complete ? '#c4f2c6' : unlocked ? '#e7bd80' : '#6f7f6d';
      if (unlocked) glow(ctx, x, y, 100, altar.complete ? '#98db8c22' : '#daa16e18');
      circle(ctx, x, y, 30, '#162c2190', color + '66');
      ctx.setLineDash([3, 7]); circle(ctx, x, y, 40, null, color + '66'); ctx.setLineDash([]);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * altar.energy / 100); ctx.stroke();
      ctx.fillStyle = '#324435'; ctx.fillRect(x - 14, y + 4, 28, 9); ctx.fillStyle = '#718363'; ctx.fillRect(x - 14, y - 1, 28, 8);
      diamond(ctx, x, y - 8 + Math.sin(time * 2) * 2, 17, color);
      if (unlocked) { ctx.globalAlpha = .25; glow(ctx, x, y - 15, 35, color); ctx.globalAlpha = 1; }
      ctx.fillStyle = '#dce8d0'; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(`${altar.id}  ${altar.complete ? 'AWAKENED' : unlocked ? Math.floor(altar.energy) + '%' : 'SEALED'}`, x, y + 58);
    }

    if (state.exitOpen) {
      const x = sx(EXIT.x), y = sy(EXIT.y), radius = EXIT.radius * unit;
      const finalAltar = state.altars.find(altar => altar.id === 'C3');
      ctx.strokeStyle = '#d6ef9b55'; ctx.lineWidth = 3; ctx.setLineDash([5, 8]);
      ctx.beginPath(); ctx.moveTo(sx(finalAltar.x), sy(finalAltar.y)); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
      glow(ctx, x, y, radius * 2, '#d6ef9b33'); circle(ctx, x, y, radius, '#b8e4c222', '#ecf5c1');
      ctx.strokeStyle = '#eef3cc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * state.exitProgress); ctx.stroke();
      ctx.fillStyle = '#f5f5cf'; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('EXIT', x, y - radius - 13);
    }
    for (const effect of state.effects) {
      const x = sx(effect.x), y = sy(effect.y), radius = effect.radius * unit;
      ctx.globalAlpha = .15; circle(ctx, x, y, radius, effect.type === 'suppress' ? '#a8dca1' : '#8addce'); ctx.globalAlpha = .6;
      ctx.setLineDash([8, 8]); circle(ctx, x, y, radius, null, '#b1dbc4'); ctx.setLineDash([]); ctx.globalAlpha = 1;
      if (effect.type === 'reveal') circle(ctx, x, y, ((time * 75) % radius), null, '#c1e7ce88');
      if (effect.type === 'decoy') { glow(ctx, x, y, 50, '#ffbb7d55'); diamond(ctx, x, y - 6, 12, '#ffbf89'); circle(ctx, x, y, 12 + Math.sin(time * 5) * 4, null, '#eac08d'); }
    }
    for (const stone of state.stones) {
      const x = sx(stone.x), y = sy(stone.y) + Math.sin(time * 3 + stone.id) * 2;
      glow(ctx, x, y, 20, '#ffb76b33'); diamond(ctx, x, y, 7, '#ffc388'); diamond(ctx, x - 1, y - 1, 3, '#fff1bd');
    }
    for (const enemy of state.enemies) {
      const x = sx(enemy.x), y = sy(enemy.y);
      const revealed = enemy.revealUntil > state.elapsed || state.effects.some(e => e.type === 'reveal' && distance(e, enemy) <= e.radius);
      if (enemy.attack) {
        const ax = sx(enemy.attack.x), ay = sy(enemy.attack.y);
        ctx.lineWidth = 2; circle(ctx, ax, ay, unit * .8, '#fc806e22', '#fa8c73');
        ctx.strokeStyle = '#ffcf9b'; ctx.beginPath(); ctx.arc(ax, ay, unit * .8, -Math.PI / 2, Math.PI * 2 * (1 - enemy.attack.remaining / .8) - Math.PI / 2); ctx.stroke();
      }
      ctx.globalAlpha = revealed ? 1 : enemy.attack ? .23 : .035;
      circle(ctx, x, y + 6, 13, '#07120ccc');
      ctx.fillStyle = '#7e6c86'; ctx.beginPath(); ctx.moveTo(x - 13, y + 8); ctx.quadraticCurveTo(x - 16, y - 13, x - 8, y - 9); ctx.lineTo(x - 5, y - 17); ctx.lineTo(x + 1, y - 10); ctx.lineTo(x + 10, y - 15); ctx.quadraticCurveTo(x + 18, y + 1, x + 11, y + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f4bf9a'; ctx.fillRect(x - 7, y - 3, 4, 3); ctx.fillRect(x + 3, y - 3, 4, 3); ctx.globalAlpha = 1;
    }
    for (const bullet of state.bullets) {
      const x = sx(bullet.x), y = sy(bullet.y);
      ctx.strokeStyle = '#ffcea7'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(bullet.angle) * 13, y - Math.sin(bullet.angle) * 13); ctx.stroke(); circle(ctx, x, y, 2.8, '#fff4d4');
    }
    if (state.boss) {
      const x = sx(state.boss.x), y = sy(state.boss.y);
      glow(ctx, x, y, 95, '#e45f4a44');
      ctx.fillStyle = '#191715'; ctx.strokeStyle = '#db8461'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 33, y + 28); ctx.lineTo(x - 40, y - 10); ctx.lineTo(x - 29, y - 41); ctx.lineTo(x - 12, y - 22); ctx.lineTo(x, y - 35); ctx.lineTo(x + 13, y - 23); ctx.lineTo(x + 30, y - 44); ctx.lineTo(x + 41, y - 5); ctx.lineTo(x + 33, y + 30); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffab77'; ctx.fillRect(x - 23, y - 7, 14, 5); ctx.fillRect(x + 9, y - 7, 14, 5); diamond(ctx, x, y + 12, 11, '#bd5942');
    }
    for (const player of state.players) {
      let position = this.positions.get(player.id);
      if (!position || distance(position, player) > 3) position = { x: player.x, y: player.y };
      position.x = lerp(position.x, player.x, .4); position.y = lerp(position.y, player.y, .4); this.positions.set(player.id, position);
      const x = sx(position.x), y = sy(position.y), color = COLORS[player.color];
      ctx.save();
      if (player.protectedUntil > state.elapsed && Math.floor(time * 12) % 2 === 0) ctx.globalAlpha = .55;
      ctx.fillStyle = '#06110c99'; ctx.beginPath(); ctx.ellipse(x, y + 10, 15, 8, 0, 0, Math.PI * 2); ctx.fill();
      if (player.health <= 0) {
        circle(ctx, x, y, 15, '#573731', color); ctx.fillStyle = color; ctx.fillRect(x - 7, y - 2, 14, 4); ctx.fillRect(x - 2, y - 7, 4, 14);
      } else {
        const step = Math.sin(time * 12 + player.x * 3) * (distance(position, player) > .03 ? 2.5 : .5);
        ctx.fillStyle = '#131d18'; ctx.fillRect(x - 8, y + 6, 6, 10 + step); ctx.fillRect(x + 2, y + 6, 6, 10 - step);
        ctx.fillStyle = player.color === 'ember' ? '#9f6445' : '#668a66';
        ctx.beginPath(); ctx.moveTo(x - 9, y - 6); ctx.lineTo(x + 8, y - 6); ctx.lineTo(x + 13, y + 10); ctx.quadraticCurveTo(x, y + 15, x - 14, y + 9); ctx.closePath(); ctx.fill();
        circle(ctx, x, y - 8, 10, color); circle(ctx, x + Math.cos(player.angle) * 2, y - 7, 6, '#27312a');
        ctx.save(); ctx.translate(x, y); ctx.rotate(player.angle); ctx.fillStyle = '#c9c9ac'; ctx.fillRect(3, -3, 20, 6); ctx.fillStyle = '#514f3e'; ctx.fillRect(11, -4, 8, 8); ctx.restore();
      }
      ctx.restore();
      if (player.id === this.localId) { ctx.setLineDash([2, 4]); circle(ctx, x, y + 4, 20, null, color + '99'); ctx.setLineDash([]); }
      ctx.fillStyle = color; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(player.username + (player.id === this.localId ? ' / YOU' : ''), x, y - 29);
      if (player.rescueProgress > 0) { ctx.lineWidth = 3; ctx.strokeStyle = '#ccedb6'; ctx.beginPath(); ctx.arc(x, y, 23, -Math.PI / 2, -Math.PI / 2 + Math.PI * player.rescueProgress); ctx.stroke(); }
    }
    for (const particle of this.particles) {
      particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      ctx.globalAlpha = Math.max(0, particle.life); ctx.fillStyle = particle.color; ctx.fillRect(sx(particle.x) - 1, sy(particle.y) - 1, 3, 3);
    }
    this.particles = this.particles.filter(p => p.life > 0); ctx.globalAlpha = 1;
    if (this.target) { ctx.strokeStyle = '#ffb087'; ctx.lineWidth = 1.5; const x = sx(this.target.x), y = sy(this.target.y); circle(ctx, x, y, 18, null, '#ffc29e'); ctx.beginPath(); ctx.moveTo(x - 25, y); ctx.lineTo(x + 25, y); ctx.moveTo(x, y - 25); ctx.lineTo(x, y + 25); ctx.stroke(); }
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const ctx = this.minimap.getContext('2d'), w = this.minimap.width, h = this.minimap.height, unit = w / WIDTH, destroyed = new Set(state.destroyed);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#0d1912'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      if (destroyed.has(y * WIDTH + x)) continue;
      const tile = this.map[y * WIDTH + x];
      ctx.fillStyle = levelAt(y) > state.stage ? '#283328' : tile === 1 ? '#5a674c' : '#364a36'; ctx.fillRect(x * unit, y * unit, unit - .4, unit - .4);
    }
    for (const altar of state.altars) { ctx.fillStyle = altar.stage > state.stage ? '#76816b' : altar.complete ? '#d8f2c2' : '#c8c588'; ctx.fillRect(altar.x * unit - 3, altar.y * unit - 3, 6, 6); }
    for (const player of state.players) circle(ctx, player.x * unit, player.y * unit, 3, COLORS[player.color], '#0b1e11');
  }
}

export function drawHero(canvas, time) {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { ctx, width: w, height: h } = fit;
  ctx.clearRect(0, 0, w, h);
  const cx = w * .52, top = h * .15, scale = Math.min(w / 480, h / 710);
  ctx.save(); ctx.translate(cx, top); ctx.scale(scale, scale);
  ctx.strokeStyle = '#70826820'; ctx.lineWidth = 1;
  for (let k = -10; k <= 10; k++) { ctx.beginPath(); ctx.moveTo(k * 35 - 350, -100); ctx.lineTo(k * 35 + 350, 650); ctx.stroke(); }
  const island = (x, y, wide, deep, altarColor, label, phase) => {
    const iso = (a, b, z = 0) => ({ x: x + (a - b) * 22, y: y + (a + b) * 11 - z });
    for (let a = 0; a < wide; a++) for (let b = 0; b < deep; b++) {
      if (hash(a + phase, b) < .06 && a > 0 && b > 0) continue;
      const p = iso(a, b), depth = 18 + hash(a, b + phase) * 23;
      ctx.fillStyle = '#233525'; ctx.beginPath(); ctx.moveTo(p.x - 22, p.y); ctx.lineTo(p.x, p.y + 11); ctx.lineTo(p.x, p.y + 11 + depth); ctx.lineTo(p.x - 22, p.y + depth); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#182b1c'; ctx.beginPath(); ctx.moveTo(p.x, p.y + 11); ctx.lineTo(p.x + 22, p.y); ctx.lineTo(p.x + 22, p.y + depth); ctx.lineTo(p.x, p.y + 11 + depth); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hash(a, b + phase) > .5 ? '#526448' : '#45583e'; ctx.strokeStyle = '#81936a55'; ctx.beginPath(); ctx.moveTo(p.x, p.y - 11); ctx.lineTo(p.x + 22, p.y); ctx.lineTo(p.x, p.y + 11); ctx.lineTo(p.x - 22, p.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if ((a === 0 || b === deep - 1) && hash(a + phase, b) > .4) {
        ctx.fillStyle = '#253b29'; ctx.fillRect(p.x - 9, p.y - 28, 15, 26); ctx.fillStyle = '#7a8b62'; ctx.fillRect(p.x - 10, p.y - 31, 17, 6);
      }
    }
    const center = iso(2.8, 2.2), ax = center.x, ay = center.y;
    glow(ctx, ax, ay - 40, 90, altarColor + '28');
    ctx.strokeStyle = altarColor + '77'; ctx.beginPath(); ctx.ellipse(ax, ay, 37, 18, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#14271b'; ctx.fillRect(ax - 17, ay - 17, 34, 21); ctx.fillStyle = '#91a277'; ctx.fillRect(ax - 19, ay - 21, 38, 9);
    diamond(ctx, ax, ay - 40 + Math.sin(time * 1.5 + phase) * 4, 23, altarColor);
    ctx.globalAlpha = .18; const gradient = ctx.createLinearGradient(ax, ay - 160, ax, ay - 30); gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, altarColor); ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(ax - 7, ay - 30); ctx.lineTo(ax - 36, ay - 180); ctx.lineTo(ax + 36, ay - 180); ctx.lineTo(ax + 7, ay - 30); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#bccca8'; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillText(label, x - 135, y + 32);
  };
  ctx.strokeStyle = '#a7bf7b77'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(20, 90); ctx.bezierCurveTo(190, 90, -160, 200, 0, 240); ctx.bezierCurveTo(200, 230, -160, 350, 0, 400); ctx.stroke(); ctx.setLineDash([]);
  island(5, 20, 6, 5, '#e5ad7c', 'C3 / THE LAST LIGHT', 2);
  island(-25, 185, 6, 5, '#bbd5a2', 'B2 / THE HOLLOW', 1);
  island(0, 345, 6, 5, '#ff9970', 'A1 / THE OUTSKIRTS', 0);
  for (let i = 0; i < 42; i++) { const x = (hash(i, 4) - .5) * 450, y = (hash(i, 8) * 500 - time * (3 + hash(i, 3) * 6)) % 500; ctx.fillStyle = i % 3 ? '#b7c89455' : '#ffb88099'; ctx.fillRect(x, y, 1.5, 1.5); }
  ctx.restore();
}
