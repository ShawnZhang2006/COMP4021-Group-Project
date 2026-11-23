import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { io as socketClient } from 'socket.io-client';
import { createApplication } from '../server.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 4000) { for (let t = 0; t < timeout; t += 20) { if (predicate()) return; await delay(20); } assert.fail('The interface did not reach the expected state.'); }

test('English interface connects forms, lobby, cheat switches, canvas drawing and results to a real server', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ashfall-interface-'));
  const application = await createApplication({ dataDirectory: directory });
  application.httpServer.listen(0, '127.0.0.1'); await once(application.httpServer, 'listening');
  const base = `http://127.0.0.1:${application.httpServer.address().port}`;
  const source = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(source, { url: base, pretendToBeVisual: true });
  const { window } = dom, document = window.document, sockets = [];
  const original = Object.fromEntries(['window', 'document', 'fetch', 'requestAnimationFrame', 'setInterval'].map(key => [key, globalThis[key]]));
  let cookie = '', frame = null, sendInput = null, drawCalls = 0, browserModule;
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    return () => { drawCalls++; };
  } });
  window.HTMLCanvasElement.prototype.getContext = () => context;
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get() { return this.id === 'hero-canvas' ? 500 : 1100; } });
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get() { return this.id === 'hero-canvas' ? 760 : 600; } });
  window.HTMLMediaElement.prototype.play = async () => {}; window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function() { if (this.hasAttribute('open')) { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); } };
  window.scrollTo = () => {};
  window.io = options => { const socket = socketClient(base, { ...options, extraHeaders: { Cookie: cookie } }); sockets.push(socket); return socket; };
  globalThis.window = window; globalThis.document = document;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 0; };
  globalThis.setInterval = callback => { sendInput = callback; return 0; };
  globalThis.fetch = async (path, options = {}) => {
    const response = await original.fetch(base + path, { ...options, headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) } });
    const received = response.headers.getSetCookie(); if (received.length) cookie = received.map(c => c.split(';')[0]).join('; ');
    return response;
  };
  t.after(async () => {
    browserModule?.disposeApplication();
    for (const socket of sockets) { socket.removeAllListeners(); socket.disconnect(); }
    await application.close(); dom.window.close();
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  browserModule = await import('../public/js/app.js');
  globalThis.setInterval = original.setInterval;
  const get = id => document.getElementById(id);
  assert.ok(frame); frame(performance.now()); assert.ok(drawCalls > 50, 'The procedural home art executes without canvas API errors.');
  get('username').value = 'x'; get('password').value = 'short';
  get('auth-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.match(get('auth-message').textContent, /username/);
  get('username').value = 'WindowPilot'; get('password').value = 'interfacepass1'; get('confirmation').value = 'different';
  get('auth-form').dispatchEvent(new window.Event('submit', { cancelable: true })); assert.match(get('auth-message').textContent, /match/);
  get('confirmation').value = 'interfacepass1'; get('auth-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await until(() => sockets[0]?.connected && !get('lobby-card').hidden);
  assert.match(get('crew-list').textContent, /WindowPilot/);
  const post = (path, body) => original.fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await post('/api/register', { username: 'SocketPilot', password: 'interfacepass1', confirmation: 'interfacepass1' });
  const login = await post('/api/signin', { username: 'SocketPilot', password: 'interfacepass1' });
  const partner = socketClient(base, { transports: ['websocket'], extraHeaders: { Cookie: login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') }, autoConnect: false }); sockets.push(partner);
  partner.connect(); await once(partner, 'connect');
  get('queue-button').click(); partner.emit('queue:join', {});
  await until(() => !get('ready-button').hidden);
  assert.match(get('crew-list').textContent, /SocketPilot/);
  get('ready-button').click(); partner.emit('room:ready', {});
  await until(() => !get('game-view').hidden);
  frame(performance.now()); assert.ok(drawCalls > 500, 'The world renderer and minimap execute.');
  assert.equal(get('sound-button').getAttribute('aria-pressed'), 'true');
  get('sound-button').click();
  get('game-canvas').dispatchEvent(new window.MouseEvent('pointerdown', { button: 0 }));
  window.dispatchEvent(new window.MouseEvent('pointerup'));
  assert.equal(get('sound-button').getAttribute('aria-pressed'), 'false', 'Shooting must respect the explicit mute choice.');
  const game = [...application.rooms.rooms.values()][0].game;
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'd', bubbles: true })); sendInput();
  const initial = game.players.find(p => p.username === 'WindowPilot').x;
  await until(() => game.players.find(p => p.username === 'WindowPilot').x > initial);
  document.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'd', bubbles: true })); sendInput();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); assert.ok(get('cheat-dialog').open);
  get('invincible-toggle').click(); await until(() => get('invincible-toggle').getAttribute('aria-checked') === 'true');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); assert.equal(get('cheat-dialog').open, false); assert.equal(game.cheats.invincible, true);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  get('invincible-toggle').click(); await until(() => game.cheats.invincible === false);
  for (let stage = 1; stage <= 3; stage++) {
    document.querySelector('[data-cheat="charge"]').click();
    await until(() => stage === 3 ? game.exitOpen : game.stage === stage + 1);
  }
  assert.equal(game.everCheated, true);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  await until(() => get('skill-dialog').open); assert.equal(document.querySelectorAll('[data-choose]').length, 4);
  document.querySelector('[data-choose="reveal"]').click(); await until(() => game.players.find(p => p.username === 'WindowPilot').skills.includes('reveal'));
  for (const player of game.players) { player.x = 23.5; player.y = 37.5; player.input.x = 0; player.input.y = 0; }
  await until(() => !get('result-view').hidden);
  assert.match(get('result-title').textContent, /Together/); assert.equal(get('skill-dialog').open, false);
  assert.match(get('stats-body').textContent, /WindowPilot/); assert.match(get('result-meta').textContent, /UNRANKED/);
  get('restart-button').click(); await until(() => !get('home-view').hidden && !get('ready-button').hidden);
  assert.equal(document.documentElement.lang, 'en'); assert.doesNotMatch(document.body.textContent, /[\u3400-\u9fff]/);
});
