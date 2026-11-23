import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { EXIT, distance, findPath, canStand } from '../public/shared/world.js';

// These server-side bots know entity positions. They verify mechanical reachability
// through legal inputs, not human reaction times, visibility or difficulty balance.
function playthrough(difficulty) {
  let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const game = new Game([{ id: 'one', username: 'PilotOne' }, { id: 'two', username: 'PilotTwo' }], difficulty, { random });
  for (let frame = 0; frame < 4802 && !game.result; frame++) {
    for (const [index, player] of game.players.entries()) {
      if (player.skillCredits) game.action(player.id, { type: 'choose', skill: ['reveal', 'teleport', 'suppress'].find(key => !player.skills.includes(key)) });
      if (player.health <= 0) continue;
      const partner = game.players.find(p => p.id !== player.id);
      let target, rescuing = false;
      if (partner.health <= 0) { target = partner; rescuing = distance(player, partner) <= .9; }
      else if (game.exitOpen) target = EXIT;
      else {
        const candidates = game.altars.filter(a => a.stage === game.stage && !a.complete);
        const altar = candidates.find(a => a.id === (index ? 'B2' : 'A2')) || candidates[0];
        if (game.stage === 3 && player.skills.includes('teleport') && player.y < 30 && (player.cooldowns.teleport || 0) <= game.elapsed && player.mana >= 40) {
          game.action(player.id, { type: 'cast', slot: player.skills.indexOf('teleport'), x: 22.5, y: 37.5 });
        }
        if (player.stones >= 5 || (altar.energy > 30 && player.stones > 0)) {
          target = altar;
          if (distance(player, altar) <= .9) game.action(player.id, { type: 'interact' });
        } else {
          const reachable = entity => distance(player, entity) < 1 || findPath(game.map, player, entity, game.stage, game.destroyed).length;
          const nearest = entities => entities.filter(reachable).sort((a, b) => distance(a, player) - distance(b, player))[0];
          const stone = nearest(game.stones);
          if (stone) {
            target = stone;
            if (distance(player, stone) <= .9) game.action(player.id, { type: 'interact' });
          } else target = nearest(game.enemies) || altar;
        }
      }
      const enemy = game.enemies.slice().sort((a, b) => distance(a, player) - distance(b, player))[0];
      const path = findPath(game.map, player, target, game.stage, game.destroyed);
      let next = path[0] || target;
      if (distance(target, player) < .5) next = player;
      const warning = game.enemies.find(e => e.attack?.kind === 'player' && distance(e.attack, player) < 1.2);
      if (warning && !rescuing) {
        const escapes = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => ({ x: player.x + x, y: player.y + y }))
          .filter(p => canStand(game.map, p.x, p.y, game.stage, game.destroyed))
          .sort((a, b) => distance(b, warning.attack) - distance(a, warning.attack));
        next = escapes[0] || next;
      }
      let dx = next.x - player.x, dy = next.y - player.y, length = Math.hypot(dx, dy);
      if (length < .1) { dx = 0; dy = 0; length = 1; }
      game.receiveInput(player.id, { x: rescuing ? 0 : dx / length, y: rescuing ? 0 : dy / length, interact: rescuing,
        fire: !!enemy && distance(enemy, player) < 12, angle: enemy ? Math.atan2(enemy.y - player.y, enemy.x - player.x) : 0 });
      if (player.skills.includes('reveal') && enemy && distance(enemy, player) < 6 && (player.cooldowns.reveal || 0) <= game.elapsed && player.mana > 35) {
        game.action(player.id, { type: 'cast', slot: player.skills.indexOf('reveal'), x: player.x, y: player.y });
      }
    }
    game.update(.05); game.events.length = 0;
  }
  return game;
}

for (const difficulty of ['easy', 'normal', 'hard']) test(`legal inputs can complete a full uncheated ${difficulty} run`, () => {
  const game = playthrough(difficulty);
  assert.equal(game.result?.outcome, 'victory'); assert.equal(game.result.cheated, false);
  assert.ok(game.elapsed <= 240); assert.equal(game.stage, 3); assert.ok(game.boss);
  assert.ok(game.altars.every(altar => altar.complete)); assert.ok(game.players.every(player => player.health > 0));
  assert.ok(game.players.reduce((sum, p) => sum + p.stats.kills, 0) >= 16);
});
