import { ALTARS, EXIT, WIDTH, HEIGHT, DURATION, INTERACTION_RANGE, AUTO_PICKUP_RANGE, REVIVE_DURATION, DIFFICULTIES, SKILLS, createMap, canStand, tileOpen, safeTile, levelAt, distance, findPath } from '../public/shared/world.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const ASSIST_PRESENTATION_SECONDS = 2;
const cleanInput = input => ({
  x: finite(input?.x) ? clamp(input.x, -1, 1) : 0,
  y: finite(input?.y) ? clamp(input.y, -1, 1) : 0,
  angle: finite(input?.angle) ? input.angle : 0,
  fire: input?.fire === true,
  interact: input?.interact === true
});

export class Game {
  constructor(users, difficulty = 'normal', options = {}) {
    if (users.length !== 2 || !DIFFICULTIES[difficulty]) throw new Error('A game needs two players and a valid difficulty.');
    this.difficulty = difficulty;
    this.random = options.random || Math.random;
    this.elapsed = 0;
    this.stage = 1;
    this.map = createMap();
    this.destroyed = new Set();
    this.altars = ALTARS.map(a => ({ ...a, energy: 0, complete: false }));
    this.players = users.map((user, i) => ({
      id: user.id, username: user.username, color: i === 0 ? 'ember' : 'mint',
      x: 13.5 + i * 2, y: 11.5, angle: -Math.PI / 2,
      armor: DIFFICULTIES[difficulty].armor, health: DIFFICULTIES[difficulty].health, mana: 100,
      maxArmor: DIFFICULTIES[difficulty].armor, maxHealth: DIFFICULTIES[difficulty].health,
      stones: 0, skills: [], cooldowns: {}, skillCredits: 0, choiceDeadline: 0,
      input: cleanInput({}), inputAt: 0, lastHit: -10, protectedUntil: 0, nextRegen: 0, nextShot: 0,
      rescueProgress: 0, notice: '', noticeUntil: 0,
      stats: { kills: 0, stones: 0, energy: 0, rescues: 0, damage: 0 }
    }));
    this.enemies = [];
    this.bullets = [];
    this.stones = [];
    this.effects = [];
    this.boss = null;
    this.nextSpawn = 1;
    this.nextId = 1;
    this.exitProgress = 0;
    this.cheats = { invincible: false, infiniteMana: false };
    this.everCheated = false;
    this.assistanceRemaining = 0;
    this.result = null;
    this.events = [];
  }

  player(id) { return this.players.find(p => p.id === id); }
  event(type, values = {}) { this.events.push({ id: this.nextId++, type, ...values }); }
  notice(player, text) { player.notice = text; player.noticeUntil = this.elapsed + 2.2; }

  receiveInput(id, input) {
    const player = this.player(id);
    if (!player || this.result || this.assistanceRemaining > 0) return;
    player.input = cleanInput(input);
    player.inputAt = this.elapsed;
  }

  action(id, action) {
    const player = this.player(id);
    if (!player || this.result || this.assistanceRemaining > 0 || !action || typeof action.type !== 'string') return;
    if (action.type === 'cheat') return this.cheat(action);
    if (action.type === 'choose') return this.choose(player, action.skill);
    if (player.health <= 0) return this.notice(player, 'You are down. Your teammate can revive you.');
    if (action.type === 'interact') this.interact(player);
    if (action.type === 'absorb') {
      if (player.stones <= 0) return this.notice(player, 'No energy stones in your pack.');
      if (player.mana >= 100) return this.notice(player, 'Your mana is already full.');
      player.stones--; player.mana = Math.min(100, player.mana + 40);
      this.event('absorb', { x: player.x, y: player.y });
    }
    if (action.type === 'cast') this.cast(player, action);
  }

  interact(player) {
    const downed = this.players.find(p => p.id !== player.id && p.health <= 0 && distance(player, p) <= INTERACTION_RANGE);
    if (downed) return this.notice(player, 'Hold E for 2 seconds to revive your teammate.');
    const altar = this.altars.filter(a => a.stage <= this.stage && !a.complete && distance(a, player) <= INTERACTION_RANGE)
      .sort((a, b) => distance(a, player) - distance(b, player))[0];
    if (altar && player.stones > 0) {
      const supplied = Math.min(25, 100 - altar.energy);
      player.stones--; altar.energy += supplied;
      player.stats.stones++; player.stats.energy += supplied;
      this.event('charge', { x: altar.x, y: altar.y, altar: altar.id });
      this.checkAltars();
      return;
    }
    const nearest = this.stones.filter(s => distance(s, player) <= INTERACTION_RANGE).sort((a, b) => distance(a, player) - distance(b, player))[0];
    if (nearest) {
      if (player.stones >= 8) return this.notice(player, 'Your pack is full. Charge an altar or press R.');
      player.stones++;
      this.stones = this.stones.filter(s => s.id !== nearest.id);
      this.event('pickup', { x: nearest.x, y: nearest.y });
      return;
    }
    this.notice(player, altar ? 'Collect stones first. Press E beside a dropped stone.' : 'Move closer to a stone, unfinished altar or downed teammate.');
  }

  checkAltars() {
    for (const altar of this.altars) {
      if (altar.energy >= 100 && !altar.complete) {
        altar.energy = 100; altar.complete = true;
        this.event('altar', { x: altar.x, y: altar.y, altar: altar.id });
      }
    }
    const current = this.altars.filter(a => a.stage === this.stage);
    if (!current.every(a => a.complete)) return;
    if (this.stage === 3 && this.exitOpen) return;
    for (const player of this.players) {
      player.skillCredits++;
      if (!player.choiceDeadline) player.choiceDeadline = this.elapsed + 8;
    }
    if (this.stage < 3) {
      this.stage++;
      this.event('stage', { stage: this.stage });
    } else {
      this.exitOpen = true;
      this.event('exit', EXIT);
    }
  }

  choose(player, skill) {
    if (!player.skillCredits || !Object.hasOwn(SKILLS, skill) || player.skills.includes(skill) || player.skills.length >= 3) return;
    player.skills.push(skill); player.cooldowns[skill] = 0; player.skillCredits--;
    player.choiceDeadline = player.skillCredits ? this.elapsed + 8 : 0;
    this.notice(player, `${SKILLS[skill].name} equipped in slot ${player.skills.length}.`);
  }

  cast(player, action) {
    if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot > 2) return;
    const skill = player.skills[action.slot];
    if (!skill) return this.notice(player, 'That skill slot is empty. Complete an altar stage to choose a skill.');
    const spec = SKILLS[skill];
    if ((player.cooldowns[skill] || 0) > this.elapsed) return this.notice(player, 'That skill is still cooling down.');
    if (!this.cheats.infiniteMana && player.mana < spec.cost) return this.notice(player, 'Not enough mana. Wait or press R to absorb a stone.');
    if (!finite(action.x) || !finite(action.y) || !canStand(this.map, action.x, action.y, this.stage, this.destroyed)) return this.notice(player, 'Choose intact ground in an unlocked area.');
    const target = { x: action.x, y: action.y };
    if (skill === 'teleport') {
      const subject = action.teammate ? this.players.find(p => p.id !== player.id) : player;
      if (subject !== player && distance(subject, player) > 2) return this.notice(player, 'Your teammate must be within 2 tiles.');
      subject.x = target.x; subject.y = target.y;
      subject.rescueProgress = 0;
      this.event('teleport', { ...target, color: subject.color });
    } else {
      this.effects.push({ id: this.nextId++, type: skill, ...target, radius: spec.radius, expires: this.elapsed + spec.duration });
      this.event('skill', { ...target, skill });
    }
    if (!this.cheats.infiniteMana) player.mana -= spec.cost;
    player.cooldowns[skill] = this.elapsed + spec.cooldown;
  }

  cheat(action) {
    const { key } = action;
    if (!['invincible', 'infiniteMana', 'restore', 'charge'].includes(key)) return;
    if (key === 'invincible' || key === 'infiniteMana') {
      if (typeof action.enabled !== 'boolean') return;
      this.cheats[key] = action.enabled;
      if (action.enabled) this.everCheated = true;
    } else this.everCheated = true;
    if (key === 'restore') for (const player of this.players) {
      player.health = player.maxHealth; player.armor = player.maxArmor; player.mana = 100;
      player.protectedUntil = this.elapsed + 2;
    }
    if (key === 'charge') {
      for (const altar of this.altars) if (altar.stage === this.stage && !altar.complete) altar.energy = 100;
      this.checkAltars();
    }
    this.event('cheat', { key, enabled: action.enabled });
  }

  hit(player) {
    if (player.health <= 0 || this.cheats.invincible || player.protectedUntil > this.elapsed) return;
    if (player.armor > 0) player.armor--;
    else player.health--;
    player.stats.damage++; player.lastHit = this.elapsed; player.rescueProgress = 0;
    player.protectedUntil = this.elapsed + 1;
    player.nextRegen = this.elapsed + 7;
    this.event('hit', { x: player.x, y: player.y, color: player.color });
    if (player.health <= 0) this.event('down', { username: player.username, x: player.x, y: player.y });
  }

  move(entity, dx, dy, radius = .26) {
    if (canStand(this.map, entity.x + dx, entity.y, this.stage, this.destroyed, radius)) entity.x += dx;
    if (canStand(this.map, entity.x, entity.y + dy, this.stage, this.destroyed, radius)) entity.y += dy;
  }

  updateRescue(player, input, dt) {
    const downed = this.players.find(other => other.id !== player.id && other.health <= 0 && distance(player, other) <= INTERACTION_RANGE);
    if (!input.interact || !downed || input.x || input.y || this.elapsed - player.lastHit <= .1) {
      player.rescueProgress = 0;
      return;
    }
    player.rescueProgress += dt;
    if (player.rescueProgress + 1e-9 < REVIVE_DURATION) return;
    downed.health = 1; downed.armor = 0; downed.protectedUntil = this.elapsed + 2;
    downed.lastHit = this.elapsed; downed.nextRegen = this.elapsed + 7;
    player.stats.rescues++; player.rescueProgress = 0;
    this.event('revive', { x: downed.x, y: downed.y, username: downed.username });
  }

  pickupNearbyStones(player) {
    const picked = new Set();
    for (const stone of this.stones) {
      if (distance(stone, player) > AUTO_PICKUP_RANGE) continue;
      if (player.stones >= 8) {
        this.notice(player, 'Your pack is full. Charge an altar or press R.');
        break;
      }
      player.stones++; picked.add(stone.id);
      this.event('pickup', { x: stone.x, y: stone.y });
    }
    if (picked.size) this.stones = this.stones.filter(stone => !picked.has(stone.id));
  }

  update(dt) {
    if (this.result) return;
    if (!finite(dt) || dt <= 0) return;
    if (this.assistanceRemaining > 0) {
      this.assistanceRemaining -= dt;
      if (this.assistanceRemaining <= 0) this.finish('victory', 'Cheat assistance brought both explorers safely to the exit.');
      return;
    }
    this.elapsed += dt;
    for (const altar of this.altars) if (!altar.complete && altar.stage <= this.stage) altar.energy = Math.max(0, altar.energy - dt);
    this.effects = this.effects.filter(effect => effect.expires > this.elapsed);
    for (const player of this.players) {
      if (player.choiceDeadline && this.elapsed >= player.choiceDeadline) this.choose(player, Object.keys(SKILLS).find(key => !player.skills.includes(key)));
      player.mana = this.cheats.infiniteMana ? 100 : Math.min(100, player.mana + 8 * dt);
      if (player.health <= 0) continue;
      if (player.armor < player.maxArmor && this.elapsed - player.lastHit >= 5 && this.elapsed >= player.nextRegen) {
        player.armor++; player.nextRegen = this.elapsed + 2;
      }
      // Stale inputs expire so an unfocused or disconnected client cannot keep walking.
      const input = this.elapsed - player.inputAt <= .4 ? player.input : cleanInput({});
      const length = Math.max(1, Math.hypot(input.x, input.y));
      player.angle = input.angle;
      this.move(player, input.x / length * 4 * dt, input.y / length * 4 * dt);
      this.updateRescue(player, input, dt);
      this.pickupNearbyStones(player);
      if (input.fire && this.elapsed >= player.nextShot && (this.cheats.infiniteMana || player.mana >= 5)) {
        if (!this.cheats.infiniteMana) player.mana -= 5;
        player.nextShot = this.elapsed + .25;
        this.bullets.push({ id: this.nextId++, owner: player.id, x: player.x, y: player.y, angle: player.angle, expires: this.elapsed + 1.2 });
        this.event('shot', { x: player.x, y: player.y, color: player.color });
      }
    }
    if (this.stage === 3 && !this.boss && this.players.some(p => levelAt(p.y) === 3)) this.spawnBoss();
    if (this.elapsed >= this.nextSpawn) { this.spawnEnemy(); this.nextSpawn = this.elapsed + 3; }
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    if (this.assistanceRemaining > 0) return;
    if (this.result) return;
    if (this.players.every(p => p.health <= 0)) return this.finish('defeat', 'Both explorers are down.');
    if (this.exitOpen && this.players.every(p => p.health > 0 && distance(p, EXIT) <= EXIT.radius)) this.exitProgress += dt;
    else this.exitProgress = 0;
    if (this.exitProgress >= 2 && this.elapsed <= DURATION) return this.finish('victory', 'Both explorers made it out.');
    if (this.elapsed >= DURATION) this.finish('defeat', 'The four-minute window has closed.');
  }

  spawnEnemy() {
    if (this.enemies.length >= 10) return;
    const alive = this.players.filter(p => p.health > 0);
    for (let attempt = 0; attempt < 70; attempt++) {
      const near = alive.length && this.random() < .8 ? alive[Math.floor(this.random() * alive.length)] : null;
      const level = near ? levelAt(near.y) : 1 + Math.floor(this.random() * this.stage);
      const position = { x: 1.5 + Math.floor(this.random() * (WIDTH - 2)), y: (level - 1) * 15 + 1.5 + Math.floor(this.random() * 13) };
      if (!canStand(this.map, position.x, position.y, this.stage, this.destroyed) || safeTile(Math.floor(position.x), Math.floor(position.y)) || this.players.some(p => distance(p, position) < 2)) continue;
      this.enemies.push({ id: this.nextId++, ...position, health: 2, nextAttack: this.elapsed + 1, revealUntil: 0, attack: null, path: [], pathAt: 0 });
      return;
    }
  }

  updateBullets(dt) {
    for (const bullet of this.bullets) {
      const steps = Math.max(1, Math.ceil(14 * dt / .18));
      for (let step = 0; step < steps; step++) {
        bullet.x += Math.cos(bullet.angle) * 14 * dt / steps;
        bullet.y += Math.sin(bullet.angle) * 14 * dt / steps;
        const cell = Math.floor(bullet.y) * WIDTH + Math.floor(bullet.x);
        const outside = bullet.x < 0 || bullet.y < 0 || bullet.x >= WIDTH || bullet.y >= HEIGHT;
        if (outside || (!this.destroyed.has(cell) && !tileOpen(this.map, bullet.x, bullet.y, this.stage, this.destroyed))) { bullet.expires = 0; break; }
        const enemy = this.enemies.find(e => e.health > 0 && distance(e, bullet) < .45);
        if (!enemy) continue;
        enemy.health--; enemy.revealUntil = this.elapsed + .7; bullet.expires = 0;
        this.event('impact', { x: enemy.x, y: enemy.y });
        if (enemy.health <= 0) {
          const owner = this.player(bullet.owner);
          if (owner) owner.stats.kills++;
          this.stones.push({ id: this.nextId++, x: enemy.x, y: enemy.y });
          this.event('kill', { x: enemy.x, y: enemy.y });
        }
        break;
      }
    }
    this.bullets = this.bullets.filter(b => b.expires > this.elapsed);
    this.enemies = this.enemies.filter(e => e.health > 0);
  }

  enemyTarget(enemy) {
    const decoy = this.effects.filter(e => e.type === 'decoy' && distance(e, enemy) <= e.radius).sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
    if (decoy) return { ...decoy, kind: 'decoy' };
    const altar = this.stage >= 2 ? this.altars.filter(a => a.stage <= this.stage && !a.complete && distance(a, enemy) <= 6).sort((a, b) => distance(a, enemy) - distance(b, enemy))[0] : null;
    if (altar) return { ...altar, kind: 'altar' };
    const player = this.players.filter(p => p.health > 0).sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
    return player ? { x: player.x, y: player.y, id: player.id, kind: 'player' } : null;
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      const slow = this.effects.some(e => e.type === 'suppress' && distance(e, enemy) <= e.radius) ? .5 : 1;
      if (enemy.attack) {
        enemy.attack.remaining -= dt * slow;
        if (enemy.attack.remaining <= 0) {
          const target = enemy.attack;
          if (target.kind === 'player') {
            const player = this.player(target.id);
            if (player && distance(player, target) <= 1.1) this.hit(player);
          } else if (target.kind === 'altar') {
            const altar = this.altars.find(a => a.id === target.id);
            if (altar && !altar.complete) altar.energy = Math.max(0, altar.energy - 10);
          }
          enemy.attack = null; enemy.revealUntil = this.elapsed + 1; enemy.nextAttack = this.elapsed + 2 / slow;
        }
        continue;
      }
      const target = this.enemyTarget(enemy);
      if (!target) continue;
      if (distance(enemy, target) <= 1 && this.elapsed >= enemy.nextAttack) {
        enemy.attack = { x: target.x, y: target.y, kind: target.kind, id: target.id, remaining: .8 };
        continue;
      }
      if (distance(enemy, target) <= .7) continue;
      if (this.elapsed >= enemy.pathAt) {
        enemy.path = findPath(this.map, enemy, target, this.stage, this.destroyed);
        enemy.pathAt = this.elapsed + .5;
      }
      const next = enemy.path[0];
      if (next) {
        const length = distance(enemy, next), amount = Math.min(length, 2.5 * slow * dt);
        if (length > .001) this.move(enemy, (next.x - enemy.x) / length * amount, (next.y - enemy.y) / length * amount, .22);
        if (distance(enemy, next) < .1) enemy.path.shift();
      }
    }
  }

  spawnBoss() {
    const path = [];
    for (let y = 0; y < HEIGHT; y++) for (let j = 0; j < WIDTH; j++) {
      const x = y % 2 ? WIDTH - 1 - j : j;
      if (!safeTile(x, y)) path.push(y * WIDTH + x);
    }
    this.boss = { x: 14.5, y: 1.5, path, progress: 0, index: 0, interval: 70 / path.length, born: this.elapsed };
    this.event('boss', { x: 14.5, y: 1.5 });
  }

  updateBoss(dt) {
    const boss = this.boss;
    if (!boss || boss.index >= boss.path.length) return;
    const slow = this.effects.some(e => e.type === 'suppress' && distance(e, boss) <= e.radius) ? .75 : 1;
    boss.progress += dt * slow;
    while (boss.progress >= boss.interval && boss.index < boss.path.length) {
      if (this.everCheated && boss.index === boss.path.length - 1) return this.assistedEscape();
      boss.progress -= boss.interval;
      const index = boss.path[boss.index++];
      boss.x = index % WIDTH + .5; boss.y = Math.floor(index / WIDTH) + .5;
      this.destroyed.add(index);
      for (const player of this.players) if (Math.floor(player.x) === Math.floor(boss.x) && Math.floor(player.y) === Math.floor(boss.y)) {
        this.hit(player); this.relocate(player);
      }
    }
    this.enemies = this.enemies.filter(e => !this.destroyed.has(Math.floor(e.y) * WIDTH + Math.floor(e.x)));
    this.stones = this.stones.filter(s => !this.destroyed.has(Math.floor(s.y) * WIDTH + Math.floor(s.x)));
    for (const player of this.players) if (distance(player, boss) < .9) this.hit(player);
    if (boss.index >= boss.path.length) this.finish('defeat', 'The world collapsed before both explorers escaped.');
  }

  relocate(player) {
    const level = levelAt(player.y), positions = [];
    for (let y = (level - 1) * 15 + 1; y < level * 15 - 1; y++) for (let x = 1; x < WIDTH - 1; x++) {
      if (canStand(this.map, x + .5, y + .5, this.stage, this.destroyed)) positions.push({ x: x + .5, y: y + .5 });
    }
    positions.sort((a, b) => distance(a, player) - distance(b, player));
    const target = positions[0] || this.altars.find(a => a.level === level && a.stage <= this.stage);
    if (target) { player.x = target.x; player.y = target.y; }
  }

  assistedEscape() {
    if (this.result || this.assistanceRemaining > 0 || !this.everCheated) return this.result;
    this.stage = 3;
    for (const altar of this.altars) { altar.energy = 100; altar.complete = true; }
    this.exitOpen = true;
    this.exitProgress = 2;
    for (const player of this.players) {
      player.health = player.maxHealth; player.armor = player.maxArmor;
      player.x = EXIT.x; player.y = EXIT.y;
      player.input = cleanInput({}); player.rescueProgress = 0;
    }
    this.assistanceRemaining = ASSIST_PRESENTATION_SECONDS;
  }

  finish(outcome, reason) {
    if (this.result) return this.result;
    if (outcome === 'defeat' && this.everCheated) return this.assistedEscape();
    const elapsed = Math.min(DURATION, this.elapsed);
    this.result = {
      outcome, reason, elapsed: Math.round(elapsed * 100) / 100, difficulty: this.difficulty, cheated: this.everCheated,
      players: this.players.map(p => ({ id: p.id, username: p.username, color: p.color, stats: { ...p.stats },
        score: p.stats.kills * 10 + p.stats.stones * 20 + p.stats.rescues * 30 + (outcome === 'victory' ? 100 + Math.floor(Math.max(0, DURATION - elapsed)) : 0) }))
    };
    return this.result;
  }

  snapshot() {
    return {
      elapsed: this.elapsed, remaining: Math.max(0, DURATION - this.elapsed), stage: this.stage,
      difficulty: this.difficulty, altars: this.altars, destroyed: [...this.destroyed],
      players: this.players.map(({ input, nextRegen, nextShot, inputAt, lastHit, ...player }) => ({ ...player, notice: player.noticeUntil > this.elapsed ? player.notice : '' })),
      enemies: this.enemies.map(({ path, pathAt, ...enemy }) => enemy), bullets: this.bullets, stones: this.stones, effects: this.effects,
      boss: this.boss ? { x: this.boss.x, y: this.boss.y, progress: this.boss.index / this.boss.path.length,
        warnings: this.boss.path.slice(this.boss.index, this.boss.index + Math.ceil(1 / this.boss.interval)) } : null,
      exitOpen: !!this.exitOpen, exitProgress: this.exitProgress, assistancePending: this.assistanceRemaining > 0,
      cheats: this.cheats, cheated: this.everCheated
    };
  }
}
