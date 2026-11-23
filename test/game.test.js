import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { ALTARS, EXIT, WIDTH, createMap, findPath, tileOpen } from '../public/shared/world.js';

const users = [{ id: 'one', username: 'ExplorerOne' }, { id: 'two', username: 'ExplorerTwo' }];
const create = difficulty => { const game = new Game(users, difficulty); game.nextSpawn = Infinity; return game; };
function advance(game, seconds, each) { for (let time = 0; time < seconds - .00001 && !game.result; time += .05) { each?.(); game.update(Math.min(.05, seconds - time)); } }
function charge(game, id, player = game.players[0]) {
  const altar = game.altars.find(a => a.id === id);
  player.x = altar.x; player.y = altar.y; player.stones = 4;
  for (let i = 0; i < 4; i++) game.action(player.id, { type: 'interact' });
}

test('all difficulty values are correct and armor absorbs a whole hit', () => {
  for (const [difficulty, armor, health] of [['easy', 10, 5], ['normal', 7, 4], ['hard', 5, 3]]) {
    const game = create(difficulty), player = game.players[0];
    assert.equal(player.armor, armor); assert.equal(player.health, health);
    player.armor = 1; game.hit(player);
    assert.equal(player.armor, 0); assert.equal(player.health, health);
    game.elapsed += 1.1; game.hit(player); assert.equal(player.health, health - 1);
    game.hit(player); assert.equal(player.health, health - 1, 'Protection prevents duplicate hits.');
  }
});

test('a contested stone is only picked up once, including beside an empty altar', () => {
  const game = create(), altar = game.altars[0];
  for (const player of game.players) { player.x = altar.x; player.y = altar.y; }
  game.stones.push({ id: 40, x: altar.x, y: altar.y });
  game.action('one', { type: 'interact' }); game.action('two', { type: 'interact' });
  assert.equal(game.players[0].stones, 1); assert.equal(game.players[1].stones, 0); assert.equal(game.stones.length, 0);
  assert.equal(altar.energy, 0, 'An empty pack must not block pickup or deposit the new stone in the same press.');
});

test('mana absorption consumes exactly one stone and full mana consumes none', () => {
  const game = create(), player = game.players[0]; player.stones = 2;
  game.action('one', { type: 'absorb' }); assert.equal(player.stones, 2);
  player.mana = 80; game.action('one', { type: 'absorb' });
  assert.equal(player.mana, 100); assert.equal(player.stones, 1);
});

test('both second-stage altars are required and completed altars stay locked', () => {
  const game = create(); charge(game, 'A1'); assert.equal(game.stage, 2);
  charge(game, 'B2'); assert.equal(game.stage, 2);
  charge(game, 'A2'); assert.equal(game.stage, 3);
  advance(game, 6); assert.equal(game.altars[0].energy, 100); assert.equal(game.altars[0].complete, true);
  assert.equal(game.players[0].skillCredits, 2);
});

test('revival takes two uninterrupted seconds and does not restore armor', () => {
  const game = create(), [rescuer, downed] = game.players;
  downed.health = 0; downed.armor = 0; downed.x = rescuer.x + .5; downed.y = rescuer.y;
  const input = () => game.receiveInput('one', { interact: true });
  advance(game, 1.4, input); assert.equal(downed.health, 0);
  game.receiveInput('one', { x: 1, interact: true }); game.update(.05); assert.equal(rescuer.rescueProgress, 0);
  rescuer.x = downed.x - .5;
  advance(game, 1.9, input); assert.equal(downed.health, 0);
  advance(game, .2, input); assert.equal(downed.health, 1); assert.equal(downed.armor, 0); assert.equal(rescuer.stats.rescues, 1);
});

test('teleport validates mana, cooldown, unlocked ground and nearby teammate', () => {
  const game = create(), [player, teammate] = game.players;
  player.skills = ['teleport']; player.cooldowns = { teleport: 0 }; player.mana = 100;
  game.action('one', { type: 'cast', slot: 0, x: 22.5, y: 37.5 }); assert.equal(player.mana, 100);
  game.action('one', { type: 'cast', slot: 0, x: 8.5, y: 7.5, teammate: true }); assert.equal(player.mana, 60); assert.equal(teammate.x, 8.5);
  game.action('one', { type: 'cast', slot: 0, x: 8.5, y: 7.5 }); assert.equal(player.mana, 60);
  game.action('one', { type: 'cast', slot: '__proto__', x: 8.5, y: 7.5 }); assert.equal(player.mana, 60);
});

test('cheats apply to the whole crew and cannot restore ranking eligibility', () => {
  const game = create();
  game.action('one', { type: 'cheat', key: 'invincible', enabled: true });
  for (const player of game.players) { const armor = player.armor; game.hit(player); assert.equal(player.armor, armor); }
  game.action('two', { type: 'cheat', key: 'invincible', enabled: false });
  assert.equal(game.cheats.invincible, false); assert.equal(game.everCheated, true);
  game.action('one', { type: 'cheat', key: 'charge' }); assert.equal(game.stage, 2);
  game.action('one', { type: 'cheat', key: 'charge' }); assert.equal(game.stage, 3);
  assert.equal(game.altars.find(a => a.id === 'A2').complete, true);
  assert.equal(game.altars.find(a => a.id === 'B2').complete, true);
  const next = create(); assert.equal(next.everCheated, false); assert.equal(next.cheats.invincible, false); assert.equal(next.players[0].skillCredits, 0);
});

test('automatic skill selection never duplicates an owned skill', () => {
  const game = create(); charge(game, 'A1'); advance(game, 8.1);
  assert.deepEqual(game.players[0].skills, ['reveal']);
  charge(game, 'A2'); charge(game, 'B2'); advance(game, 8.1);
  assert.deepEqual(game.players[0].skills, ['reveal', 'decoy']);
});

test('a normal run requires both living players to stay at the exit', () => {
  const game = create(); charge(game, 'A1'); charge(game, 'A2'); charge(game, 'B2'); charge(game, 'C3');
  game.players[0].x = EXIT.x; game.players[0].y = EXIT.y;
  advance(game, 2.1); assert.equal(game.result, null);
  game.players[1].x = EXIT.x; game.players[1].y = EXIT.y; game.players[1].health = 0;
  advance(game, 2.1); assert.equal(game.result, null);
  game.players[1].health = 1; advance(game, 1); assert.equal(game.result, null);
  game.players[0].x -= 2; game.update(.05); assert.equal(game.exitProgress, 0);
  game.players[0].x = EXIT.x; advance(game, 2.1);
  assert.equal(game.result.outcome, 'victory'); assert.equal(game.result.cheated, false);
});

test('world collapse is terminal with C3 unfinished even if stones remain', () => {
  const game = create(); game.stage = 3;
  for (const player of game.players) { player.x = 22.5; player.y = 37.5; player.stones = 8; }
  advance(game, 71);
  assert.equal(game.result.outcome, 'defeat'); assert.match(game.result.reason, /collapsed/);
  assert.equal(game.players[0].stones, 8);
});

test('the timer ends the game at four minutes', () => {
  const game = create(); advance(game, 241);
  assert.equal(game.result.outcome, 'defeat'); assert.equal(game.result.elapsed, 240); assert.match(game.result.reason, /four-minute/);
});

test('map routes connect each unlocked altar while sealed floors are inaccessible', () => {
  const map = createMap();
  assert.equal(tileOpen(map, 14, 14, 1), false);
  assert.equal(tileOpen(map, 14, 14, 2), true);
  assert.equal(findPath(map, { x: 13.5, y: 11.5 }, ALTARS[2], 1).length, 0);
  for (const altar of ALTARS) assert.ok(findPath(map, { x: 13.5, y: 11.5 }, altar, 3).length > 0);
  assert.equal(tileOpen(map, 8, 7, 3, new Set([7 * WIDTH + 8])), false);
});

test('malformed movement does not produce NaN positions or faster diagonal movement', () => {
  const game = create(), p = game.players[0]; const { x, y } = p;
  game.receiveInput('one', { x: NaN, y: Infinity }); game.update(.05); assert.equal(p.x, x); assert.equal(p.y, y);
  game.receiveInput('one', { x: 100, y: 100 }); game.update(.05);
  assert.ok(Math.hypot(p.x - x, p.y - y) <= .201);
});
