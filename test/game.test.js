import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { ALTARS, EXIT, WIDTH, INTERACTION_RANGE, AUTO_PICKUP_RANGE, REVIVE_DURATION, canStand, distance, safeTile, createMap, findPath, tileOpen } from '../public/shared/world.js';

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

test('automatic pickup respects range and pack capacity without duplicating stones', () => {
  const game = create(), [first, second] = game.players;
  second.x = first.x; second.y = first.y; first.stones = 7;
  game.stones = [
    { id: 101, x: first.x + .4, y: first.y },
    { id: 102, x: first.x + .5, y: first.y },
    { id: 103, x: first.x + AUTO_PICKUP_RANGE + .1, y: first.y }
  ];
  game.update(.05);
  assert.equal(first.stones, 8); assert.equal(second.stones, 1);
  assert.deepEqual(game.stones.map(stone => stone.id), [103]);
  assert.equal(game.events.filter(event => event.type === 'pickup').length, 2);
});

test('altar interaction works within the shared two-tile range and rejects farther targets', () => {
  const game = create(), player = game.players[0], altar = game.altars[0];
  player.stones = 2; player.x = altar.x + INTERACTION_RANGE + .1; player.y = altar.y;
  game.action(player.id, { type: 'interact' }); assert.equal(altar.energy, 0); assert.equal(player.stones, 2);
  player.x = altar.x + INTERACTION_RANGE - .1;
  game.action(player.id, { type: 'interact' }); assert.equal(altar.energy, 25); assert.equal(player.stones, 1);
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

test('rescue and automatic pickup run independently when other stones remain on the map', () => {
  const game = create(), [rescuer, downed] = game.players;
  downed.health = 0; downed.armor = 0; downed.x = rescuer.x + INTERACTION_RANGE - .25; downed.y = rescuer.y;
  game.stones = [{ id: 110, x: rescuer.x + .4, y: rescuer.y }, { id: 111, x: 25.5, y: 11.5 }];
  const input = () => game.receiveInput(rescuer.id, { interact: true });
  advance(game, REVIVE_DURATION - .1, input);
  assert.equal(downed.health, 0); assert.equal(rescuer.stones, 1); assert.equal(game.stones.length, 1);
  advance(game, .2, input);
  assert.equal(downed.health, 1); assert.equal(downed.armor, 0); assert.equal(rescuer.stats.rescues, 1);
});

test('damage and leaving rescue range each require a fresh uninterrupted rescue', () => {
  const game = create(), [rescuer, downed] = game.players;
  downed.health = 0; downed.x = rescuer.x + .5; downed.y = rescuer.y;
  const input = () => game.receiveInput(rescuer.id, { interact: true });
  advance(game, 1, input); game.hit(rescuer); assert.equal(rescuer.rescueProgress, 0);
  advance(game, .15, () => game.receiveInput(rescuer.id, {}));
  advance(game, 1, input); assert.equal(downed.health, 0);
  downed.x = rescuer.x + INTERACTION_RANGE + .1; game.receiveInput(rescuer.id, { interact: true }); game.update(.05);
  assert.equal(rescuer.rescueProgress, 0);
  downed.x = rescuer.x + .5; advance(game, REVIVE_DURATION + .1, input); assert.equal(downed.health, 1);
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
  game.players[0].x -= EXIT.radius + .5; game.update(.05); assert.equal(game.exitProgress, 0);
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

test('world collapse ends a clean fully charged run before extraction completes on the same tick', () => {
  const game = create();
  game.stage = 3; game.exitOpen = true;
  for (const altar of game.altars) { altar.complete = true; altar.energy = 100; }
  for (const player of game.players) { player.x = EXIT.x; player.y = EXIT.y; player.stones = 8; }
  game.spawnBoss();
  game.boss.index = game.boss.path.length - 1;
  game.destroyed = new Set(game.boss.path.slice(0, -1));
  game.boss.interval = .05;
  game.exitProgress = 1.99;
  assert.equal(game.result, null);
  game.update(.05);
  assert.equal(game.boss.index, game.boss.path.length);
  assert.equal(game.result?.outcome, 'defeat');
  assert.match(game.result.reason, /world collapsed/i);
  assert.equal(game.result.cheated, false);
  assert.ok(game.players.every(player => player.health > 0 && player.stones === 8));
  const elapsed = game.elapsed;
  game.update(1);
  assert.equal(game.elapsed, elapsed);
  assert.equal(game.result.outcome, 'defeat');
});

for (const key of ['invincible', 'infiniteMana', 'restore', 'charge']) test(`${key} guarantees escape and preserves the last destructible tile, even after switches are disabled`, () => {
  const game = create();
  game.action('one', { type: 'cheat', key, enabled: true });
  game.action('one', { type: 'cheat', key, enabled: false });
  game.stage = 3;
  game.spawnBoss();
  game.boss.index = game.boss.path.length - 1;
  game.destroyed = new Set(game.boss.path.slice(0, -1));
  const lastTile = game.boss.path.at(-1);
  game.update(1);
  assert.equal(game.result, null);
  assert.equal(game.snapshot().assistancePending, true);
  assert.equal(game.destroyed.has(lastTile), false);
  assert.equal(game.boss.index, game.boss.path.length - 1);
  assert.ok(game.altars.every(altar => altar.complete));
  assert.ok(game.players.every(player => player.health > 0 && distance(player, EXIT) <= EXIT.radius));
  const position = { x: game.players[0].x, y: game.players[0].y };
  game.receiveInput('one', { x: 1, y: 1 });
  game.update(1.9);
  assert.equal(game.result, null);
  assert.deepEqual({ x: game.players[0].x, y: game.players[0].y }, position);
  game.update(.2);
  assert.equal(game.result?.outcome, 'victory');
  assert.equal(game.result.cheated, true);
  assert.match(game.result.reason, /Cheat assistance/);
});

for (const failure of ['timeout', 'both down']) test(`cheat assistance completes an escape on ${failure}`, () => {
  const game = create();
  game.action('one', { type: 'cheat', key: 'infiniteMana', enabled: true });
  if (failure === 'timeout') game.elapsed = 239.99;
  else for (const player of game.players) player.health = 0;
  game.update(.05);
  assert.equal(game.result, null);
  assert.equal(game.snapshot().assistancePending, true);
  game.update(2);
  assert.equal(game.result?.outcome, 'victory');
  assert.equal(game.result.cheated, true);
  assert.ok(game.players.every(player => player.health > 0 && distance(player, EXIT) <= EXIT.radius));
});

test('unused cheat controls do not protect a clean run, and leaving still aborts a cheated run', () => {
  const clean = create();
  clean.action('one', { type: 'cheat', key: 'invincible', enabled: false });
  clean.elapsed = 239.99; clean.update(.05);
  assert.equal(clean.result?.outcome, 'defeat'); assert.equal(clean.result.cheated, false);
  const cheated = create();
  cheated.action('one', { type: 'cheat', key: 'restore' });
  cheated.finish('aborted', 'An explorer disconnected.');
  assert.equal(cheated.result.outcome, 'aborted');
});

test('the relocated exit and route from C3 allow escape before complete world destruction', () => {
  const game = create(), finalAltar = game.altars.find(altar => altar.id === 'C3');
  game.stage = 3; game.exitOpen = true;
  for (const altar of game.altars) { altar.complete = true; altar.energy = 100; }
  for (const player of game.players) { player.x = finalAltar.x; player.y = finalAltar.y; }
  game.spawnBoss(); advance(game, 60);
  assert.ok(game.boss.index < game.boss.path.length); assert.equal(game.result, null);
  assert.ok(safeTile(Math.floor(EXIT.x), Math.floor(EXIT.y)));
  assert.ok(canStand(game.map, EXIT.x, EXIT.y, game.stage, game.destroyed));
  const route = findPath(game.map, finalAltar, EXIT, game.stage, game.destroyed);
  assert.ok(route.length > 0); assert.ok(route.every(point => canStand(game.map, point.x, point.y, game.stage, game.destroyed)));
  advance(game, 10, () => {
    for (const player of game.players) {
      const next = findPath(game.map, player, EXIT, game.stage, game.destroyed)[0];
      const length = next ? distance(player, next) : 0;
      game.receiveInput(player.id, !next || distance(player, EXIT) < EXIT.radius * .5 || length < .01 ? {} : { x: (next.x - player.x) / length, y: (next.y - player.y) / length });
    }
  });
  assert.equal(game.result?.outcome, 'victory'); assert.equal(game.result.cheated, false);
  assert.ok(game.boss.index < game.boss.path.length);
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
