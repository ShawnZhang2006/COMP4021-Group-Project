import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';

async function setup(t) { const directory = await mkdtemp(join(tmpdir(), 'ashfall-store-')); t.after(() => rm(directory, { recursive: true, force: true })); const store = new Store(directory); await store.initialize(); return { store, directory }; }

test('registration validates input and prevents duplicate names during concurrent hashing', async t => {
  const { store } = await setup(t);
  await assert.rejects(store.register('x', 'password1', 'password1'), /username/);
  await assert.rejects(store.register('Explorer', 'short', 'short'), /password/);
  await assert.rejects(store.register('Explorer', 'password1', 'password2'), /match/);
  const attempts = await Promise.allSettled([store.register('Explorer', 'password1', 'password1'), store.register('explorer', 'password1', 'password1')]);
  assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1);
  assert.equal(await store.authenticate('Explorer', 'wrongpass'), null);
  assert.ok(await store.authenticate('EXPLORER', 'password1'));
});

test('accounts persist as hashes, including usernames matching object property names', async t => {
  const { store, directory } = await setup(t);
  await store.register('__proto__', 'password1', 'password1');
  assert.ok(await store.authenticate('__proto__', 'password1'));
  assert.notEqual(store.users.__proto__.hash, 'password1');
  const reloaded = new Store(directory); await reloaded.initialize();
  assert.ok(await reloaded.authenticate('__proto__', 'password1'));
});

test('the leaderboard keeps best individual records per difficulty and excludes cheated or failed games', async t => {
  const { store, directory } = await setup(t);
  const result = { outcome: 'victory', cheated: false, difficulty: 'normal', elapsed: 180, players: [{ username: 'Explorer', score: 300, stats: { kills: 3, stones: 4, rescues: 1 } }] };
  await store.record(result); await store.record({ ...result, cheated: true, players: [{ ...result.players[0], score: 9999 }] });
  await store.record({ ...result, outcome: 'defeat', players: [{ ...result.players[0], score: 9999 }] });
  assert.equal(store.leaderboard()[0].score, 300);
  await store.record({ ...result, elapsed: 170 }); assert.equal(store.leaderboard()[0].elapsed, 170);
  await store.record({ ...result, difficulty: 'hard' }); assert.equal(store.leaderboard('hard').length, 1);
  const reloaded = new Store(directory); await reloaded.initialize(); assert.equal(reloaded.leaderboard()[0].score, 300);
});
