import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as client } from 'socket.io-client';
import { createApplication } from '../server.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 3000) { for (let time = 0; time < timeout; time += 20) { if (predicate()) return; await wait(20); } assert.fail('The expected real-time state did not arrive.'); }
const emit = (socket, event, payload = {}) => new Promise((resolve, reject) => socket.timeout(3000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));

test('HTTP sessions, real WebSocket pairing, isolated rooms, cheats and restart work together', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ashfall-integration-'));
  const app = await createApplication({ dataDirectory: directory, sessionSecret: 'integration-test-secret' });
  const sockets = [];
  t.after(async () => { for (const socket of sockets) socket.disconnect(); await app.close(); await rm(directory, { recursive: true, force: true }); });
  app.httpServer.listen(0, '127.0.0.1'); await once(app.httpServer, 'listening');
  const url = `http://127.0.0.1:${app.httpServer.address().port}`;
  const post = async (path, body, cookie) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const invalid = await post('/api/register', { username: 'x', password: 'short' }); assert.equal(invalid.status, 400);
  const badLogin = await post('/api/signin', { username: 'Ghost', password: 'wrongpass' }); assert.equal(badLogin.status, 401);
  const crew = [];
  for (let i = 0; i < 4; i++) {
    const username = `Explorer${i}`, password = 'secretpass1';
    assert.equal((await post('/api/register', { username, password, confirmation: password })).status, 201);
    const login = await post('/api/signin', { username, password }); assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const restored = await (await fetch(url + '/api/session', { headers: { Cookie: cookie } })).json(); assert.equal(restored.user.username, username);
    const socket = client(url, { transports: ['websocket'], extraHeaders: { Cookie: cookie }, autoConnect: false, reconnection: false }); sockets.push(socket);
    const state = { lobby: null, game: null, result: null };
    socket.on('lobby', value => { state.lobby = value; }); socket.on('game:started', value => { state.game = value; }); socket.on('game:state', value => { state.game = value; }); socket.on('game:over', value => { state.result = value; });
    socket.connect(); await once(socket, 'connect'); await until(() => state.lobby);
    assert.equal(socket.io.engine.transport.name, 'websocket'); crew.push({ socket, cookie, state, username });
  }
  const duplicate = client(url, { transports: ['websocket'], extraHeaders: { Cookie: crew[0].cookie }, autoConnect: false, reconnection: false }); sockets.push(duplicate);
  const rejected = once(duplicate, 'connect_error'); duplicate.connect(); assert.match((await rejected)[0].message, /already connected/); duplicate.disconnect();
  for (const player of crew) assert.equal((await emit(player.socket, 'queue:join')).ok, true);
  await until(() => crew.every(p => p.state.lobby?.room));
  const firstId = crew[0].state.lobby.room.id, secondId = crew[2].state.lobby.room.id;
  assert.notEqual(firstId, secondId); assert.equal(crew[1].state.lobby.room.id, firstId);
  assert.equal((await emit(crew[1].socket, 'room:difficulty', { difficulty: 'hard' })).ok, false);
  assert.equal((await emit(crew[0].socket, 'room:difficulty', { difficulty: 'hard' })).ok, true);
  for (const player of crew) await emit(player.socket, 'room:ready');
  await until(() => crew.every(p => p.state.game));
  assert.equal(crew[0].state.game.difficulty, 'hard'); assert.equal(crew[2].state.game.difficulty, 'normal');
  const originalX = crew[0].state.game.players[0].x;
  crew[0].socket.emit('game:input', { x: 1 }); await until(() => crew[1].state.game.players[0].x > originalX + .05);
  await emit(crew[0].socket, 'game:action', { type: 'cheat', key: 'invincible', enabled: true });
  await emit(crew[0].socket, 'game:action', { type: 'cheat', key: 'charge' });
  await until(() => crew[1].state.game.stage === 2);
  assert.equal(crew[2].state.game.stage, 1); assert.equal(crew[2].state.game.cheated, false);
  await emit(crew[0].socket, 'game:action', { type: 'cheat', key: 'charge' });
  await emit(crew[0].socket, 'game:action', { type: 'cheat', key: 'charge' });
  await until(() => crew[1].state.game.exitOpen);
  const game = app.rooms.rooms.get(firstId).game;
  for (const player of game.players) { player.x = 23.5; player.y = 37.5; game.receiveInput(player.id, {}); }
  await until(() => crew[0].state.result && crew[1].state.result, 4000);
  assert.equal(crew[0].state.result.outcome, 'victory'); assert.equal(crew[0].state.result.cheated, true);
  assert.equal(crew[0].state.result.ranking.length, 0);
  await emit(crew[0].socket, 'room:restart'); await until(() => crew[0].state.lobby.room.players.every(p => !p.ready));
  await emit(crew[0].socket, 'room:ready'); await emit(crew[1].socket, 'room:ready');
  await until(() => crew[0].state.game.stage === 1 && !crew[0].state.game.cheated);
  assert.equal(crew[0].state.game.players[0].stones, 0); assert.equal(crew[0].state.game.players[0].skills.length, 0);
  crew[0].state.result = null; crew[1].socket.disconnect(); await until(() => crew[0].state.result?.outcome === 'aborted');
  assert.equal(crew[0].state.result.roomClosed, true);
  const audio = await fetch(url + '/assets/audio/shoot.wav'); assert.equal(audio.status, 200); assert.equal(Buffer.from(await audio.arrayBuffer()).subarray(0, 4).toString(), 'RIFF');
  const page = await (await fetch(url)).text(); assert.match(page, /<html lang="en">/); assert.doesNotMatch(page, /[\u3400-\u9fff]/);
  const signout = await post('/api/signout', {}, crew[3].cookie); assert.equal(signout.status, 200);
  assert.equal((await (await fetch(url + '/api/session', { headers: { Cookie: crew[3].cookie } })).json()).user, null);
});
