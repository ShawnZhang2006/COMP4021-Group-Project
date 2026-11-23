import { ALTARS, EXIT, DIFFICULTIES, SKILLS, WIDTH, HEIGHT, distance, levelAt } from '../shared/world.js';
import { Renderer, drawHero } from './renderer.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const html = (element, value) => { if (element.innerHTML !== value) element.innerHTML = value; };
const formatTime = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const state = { user: null, socket: null, scene: 'home', register: true, lobby: { room: null, queued: false }, game: null, result: null, selected: null, pointer: null, keys: new Set(), fire: false, sound: false, audioUnlocked: false, notification: '', notificationUntil: 0 };
const renderer = new Renderer($('game-canvas'), $('minimap'));
let toastTimer, animationFrame, previousFrame = performance.now(), lastShotSound = 0, lastChoiceSignature = '';

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function showScene(scene) {
  state.scene = scene;
  for (const id of ['home', 'game', 'result']) $(id + '-view').hidden = id !== scene;
  document.body.classList.toggle('playing', scene === 'game');
  if (scene !== 'game') { state.keys.clear(); state.fire = false; state.selected = null; renderer.target = null; for (const id of ['cheat-dialog', 'skill-dialog', 'leave-dialog']) $(id).close(); }
  if (scene === 'game') { $('game-canvas').focus({ preventScroll: true }); window.scrollTo(0, 0); }
}

async function api(path, body) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function request(event, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!state.socket?.connected) return reject(new Error('Your signal is offline. Reconnect from the lobby.'));
    state.socket.timeout(5000).emit(event, payload, (error, response) => {
      if (error) reject(new Error('The server did not respond. Please try again.'));
      else if (!response?.ok) reject(new Error(response?.error || 'The action could not be completed.'));
      else resolve(response);
    });
  });
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    if (state.socket?.connected) return resolve();
    state.socket?.removeAllListeners(); state.socket?.disconnect();
    const socket = window.io({ transports: ['websocket'], reconnection: false });
    state.socket = socket;
    socket.on('connect', () => { $('connection-badge').textContent = 'CONNECTED'; renderLobby(); resolve(); });
    socket.on('connect_error', error => { $('connection-badge').textContent = 'OFFLINE'; $('lobby-message').textContent = error.message; reject(error); });
    socket.on('lobby', lobby => { state.lobby = lobby; if (state.scene !== 'game' || !lobby.room) showScene('home'); renderLobby(); });
    socket.on('notice', message => toast(message));
    socket.on('game:started', game => {
      state.game = game; state.result = null; state.selected = null; lastChoiceSignature = ''; renderer.reset();
      state.notification = 'Find the First Light. Shoot, collect stones with E, then charge A1.'; state.notificationUntil = performance.now() + 5000;
      showScene('game'); renderGame();
    });
    socket.on('game:state', game => { state.game = game; if (state.scene === 'game') renderGame(); });
    socket.on('game:events', events => {
      renderer.events(events);
      for (const event of events) {
        if (event.type === 'shot' && performance.now() - lastShotSound > 110) { playSound('shoot-audio', .18); lastShotSound = performance.now(); }
        if (event.type === 'altar') playSound('altar-audio', .35);
        const messages = { stage: `Stage ${event.stage} unlocked. Choose a new skill.`, boss: 'THE DESTROYER HAS AWAKENED. Reach C3 before the world falls.', exit: 'The Last Light is awake. Reach the exit together!', down: `${event.username} is down. Hold E nearby to revive.`, revive: `${event.username} is back on their feet.` };
        if (messages[event.type]) { state.notification = messages[event.type]; state.notificationUntil = performance.now() + 4500; }
      }
    });
    socket.on('game:over', result => { state.result = result; state.game = null; showScene('result'); renderResult(); });
    socket.on('disconnect', reason => {
      $('connection-badge').textContent = 'OFFLINE';
      if (reason === 'io client disconnect') return;
      state.lobby = { room: null, queued: false }; state.game = null;
      if (state.user) { showScene('home'); renderLobby(); $('lobby-message').textContent = 'Connection lost. Choose Find a teammate to reconnect. The previous run has ended.'; }
    });
  });
}

function renderAccount() {
  $('auth-card').hidden = !!state.user; $('lobby-card').hidden = !state.user; $('signout-button').hidden = !state.user;
  if (state.user) { $('lobby-title').textContent = `${state.user.username}'s crew`; renderLobby(); }
}

function renderLobby() {
  if (!state.user) return;
  const { room, queued } = state.lobby;
    const members = room?.players || [{ id: state.socket?.id, username: state.user.username, color: 'ember', ready: false }];
  html($('crew-list'), members.map(member => `<div class="crew-member"><div class="crew-avatar ${member.color}">${escape(member.username[0].toUpperCase())}</div><div><span class="crew-name">${escape(member.username)}${member.id === state.socket?.id ? ' / YOU' : ''}</span></div><span class="crew-ready">${member.ready ? 'READY' : room ? 'NOT READY' : 'ONLINE'}</span></div>`).join('') + (members.length === 1 ? `<div class="crew-member crew-empty"><div class="crew-avatar mint">?</div><div><span class="crew-name">Waiting for a teammate</span></div></div>` : ''));
  $('queue-button').hidden = !!room; $('queue-button').textContent = queued ? 'Cancel search' : 'Find a teammate';
  $('ready-button').hidden = !room; $('leave-room-button').hidden = !room; $('difficulty-section').hidden = !room;
  $('lobby-description').textContent = room ? 'Choose a difficulty, then both players click Ready.' : queued ? 'Keep this page open while we find a teammate.' : '';
  $('lobby-description').hidden = !room && !queued;
  $('lobby-footnote').hidden = !!room || queued;
  if (room) {
    const own = room.players.find(p => p.id === state.socket?.id), host = room.host === state.socket?.id;
    $('ready-button').textContent = own?.ready ? 'Ready — waiting for your partner' : 'Ready for expedition';
    $('host-label').textContent = host ? 'YOU ARE THE HOST' : 'HOST CHOOSES';
    for (const button of document.querySelectorAll('[data-difficulty]')) { button.classList.toggle('selected', button.dataset.difficulty === room.difficulty); button.disabled = !host; }
    const difficulty = DIFFICULTIES[room.difficulty]; $('difficulty-description').textContent = `${difficulty.armor} armor · ${difficulty.health} health · 240 seconds`;
  }
}

function selectSkill(slot) {
  const local = state.game?.players.find(p => p.id === state.socket?.id);
  if (!local?.skills[slot]) return toast('Complete an altar stage to unlock this slot.');
  state.selected = state.selected === slot ? null : slot;
  if (state.selected === null) renderer.target = null;
  else toast(`${SKILLS[local.skills[slot]].name} selected. Click intact ground to cast. Esc cancels.`);
  renderGame();
}

function renderGame() {
  const game = state.game, local = game?.players.find(p => p.id === state.socket?.id);
  if (!local) return;
  renderer.setState(game, state.socket.id);
  $('timer').textContent = formatTime(Math.ceil(game.remaining)); $('timer').parentElement.classList.toggle('urgent', game.remaining < 45);
  $('stage-title').textContent = game.exitOpen ? 'Leave together' : ['The First Light', 'Two lights. One crew.', 'The Last Light'][game.stage - 1];
  $('run-difficulty').textContent = game.difficulty.toUpperCase(); $('cheat-badge').hidden = !game.cheated;
  const names = ['THE OUTSKIRTS', 'THE HOLLOW', 'THE LAST SANCTUM']; $('level-label').textContent = `LEVEL 0${levelAt(local.y)} / ${names[levelAt(local.y) - 1]}`;
  $('boss-label').hidden = !game.boss; if (game.boss) $('boss-label').textContent = `WORLD LOST / ${Math.floor(game.boss.progress * 100)}%`;
  $('objective-text').textContent = game.exitOpen ? 'Stand at the exit together for 2 seconds.' : ['Restore A1 to open level two.', 'Restore A2 on level one and B2 on level two.', 'Charge C3. Outrun the destroyer.'][game.stage - 1];
  html($('altar-list'), game.altars.map(a => `<div class="altar-row ${a.stage > game.stage ? 'locked' : ''}"><div class="altar-label"><span>${a.id} / LEVEL ${a.level}</span><span>${a.complete ? 'FULL' : a.stage > game.stage ? 'SEALED' : Math.floor(a.energy) + '%'}</span></div><div class="altar-track"><i style="width:${a.energy}%"></i></div></div>`).join(''));
  html($('player-vitals'), game.players.map(p => `<div class="vital-card ${p.color}"><div class="vital-heading"><span>${escape(p.username)}${p.id === local.id ? ' / YOU' : ''}</span><span>◇ ${p.stones}/8</span></div><div class="vital-bar armor" title="Armor ${p.armor}/${p.maxArmor}"><i style="width:${p.armor / p.maxArmor * 100}%"></i></div><div class="vital-bar health" title="Health ${p.health}/${p.maxHealth}"><i style="width:${p.health / p.maxHealth * 100}%"></i></div><div class="vital-bar mana" title="Mana ${Math.floor(p.mana)}/100"><i style="width:${p.mana}%"></i></div><div class="vital-meta"><span>${p.health <= 0 ? 'DOWNED' : `${p.armor} ARM / ${p.health} HP`}</span><span>${Math.floor(p.mana)} MP</span></div></div>`).join(''));
  html($('skill-rack'), [0, 1, 2].map(slot => {
    const skill = local.skills[slot], spec = SKILLS[skill], remaining = Math.max(0, (local.cooldowns[skill] || 0) - game.elapsed);
    return `<button class="skill-button ${spec ? '' : 'empty'} ${state.selected === slot ? 'selected' : ''}" data-slot="${slot}" aria-label="Skill slot ${slot + 1}${spec ? ': ' + spec.name : ': locked'}"><kbd>${slot + 1}</kbd><strong>${spec?.name || 'Locked'}</strong>${spec ? `<small>${spec.cost} MANA</small>` : ''}${remaining > 0 ? `<span class="skill-cooldown">${Math.ceil(remaining)}s</span>` : ''}</button>`;
  }).join(''));
  $('downed-message').hidden = local.health > 0;
  $('world-message').textContent = local.notice || (performance.now() < state.notificationUntil ? state.notification : '');
  const nearDown = game.players.find(p => p.id !== local.id && p.health <= 0 && distance(local, p) <= 1);
  const nearAltar = local.stones > 0 && game.altars.find(a => a.stage <= game.stage && !a.complete && distance(local, a) <= 1);
  const nearStone = local.stones < 8 && game.stones.find(s => distance(local, s) <= 1);
  const hint = nearDown ? `Hold to revive ${nearDown.username} (${local.rescueProgress.toFixed(1)}/2s)` : nearAltar ? `Charge ${nearAltar.id} / use 1 stone` : nearStone ? 'Pick up energy stone' : '';
  $('interaction-hint').hidden = !hint || local.health <= 0; $('interaction-hint').querySelector('span').textContent = hint;
  for (const [id, key] of [['invincible-toggle', 'invincible'], ['mana-toggle', 'infiniteMana']]) { $(id).setAttribute('aria-checked', String(game.cheats[key])); $(id).textContent = game.cheats[key] ? 'On' : 'Off'; }
  const signature = local.skillCredits ? local.skills.join(',') + ':' + local.skillCredits : '';
  if (signature && !$('cheat-dialog').open && !$('manual-dialog').open && !$('leave-dialog').open) {
    if (signature !== lastChoiceSignature) {
      html($('skill-options'), Object.entries(SKILLS).filter(([key]) => !local.skills.includes(key)).map(([key, spec]) => `<button class="skill-option" data-choose="${key}"><strong>${spec.name}</strong><p>${spec.description}</p><small>${spec.cost} MANA / ${spec.cooldown}s COOLDOWN</small></button>`).join(''));
      lastChoiceSignature = signature;
    }
    $('choice-timer').textContent = `${Math.max(0, Math.ceil(local.choiceDeadline - game.elapsed))}s`;
    if (!$('skill-dialog').open) { state.keys.clear(); state.fire = false; $('skill-dialog').showModal(); }
  } else if (!signature && $('skill-dialog').open) { $('skill-dialog').close(); lastChoiceSignature = ''; }
}

function rankingMarkup(records) {
  if (!records.length) return '<div class="empty-board">No clean victories on this difficulty yet.</div>';
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Explorer</th><th>Rank</th><th>Score</th><th>Time</th><th>Kills</th><th>Stones</th><th>Revives</th></tr></thead><tbody>${records.map(r => `<tr class="${r.username === state.user?.username ? 'current-player' : ''}"><td>${escape(r.username)}</td><td>${r.rank}</td><td>${r.score}</td><td>${formatTime(r.elapsed)}</td><td>${r.kills}</td><td>${r.stones}</td><td>${r.rescues}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderResult() {
  const result = state.result;
  if (!result) return;
  $('result-title').innerHTML = result.outcome === 'victory' ? 'You made it.<br><em>Together.</em>' : result.outcome === 'aborted' ? 'A signal lost.<br><em>A new beginning.</em>' : 'The light went out.<br><em>Try again, together.</em>';
  $('result-reason').textContent = result.storageError || result.reason;
  html($('result-meta'), `<span>${result.difficulty.toUpperCase()}</span><span>${formatTime(result.elapsed)} ELAPSED</span><span class="tag ${result.cheated ? 'warning' : ''}">${result.cheated ? 'CHEATS USED · UNRANKED' : result.outcome === 'victory' ? 'RANKED' : 'UNRANKED'}</span>`);
  html($('stats-body'), result.players.map(p => `<tr class="${p.username === state.user?.username ? 'current-player' : ''}"><td>${escape(p.username)}</td><td>${p.score}</td><td>${p.stats.kills}</td><td>${p.stats.stones}</td><td>${Math.round(p.stats.energy)}</td><td>${p.stats.rescues}</td><td>${p.stats.damage}</td></tr>`).join(''));
  $('result-board-difficulty').textContent = result.difficulty.toUpperCase(); html($('result-ranking'), rankingMarkup(result.ranking || []));
  $('restart-button').hidden = result.roomClosed || !state.socket?.connected;
}

function setAuthMode(register) {
  state.register = register;
  $('auth-card').classList.toggle('signin-mode', !register);
  $('register-tab').classList.toggle('selected', register); $('register-tab').setAttribute('aria-selected', String(register));
  $('signin-tab').classList.toggle('selected', !register); $('signin-tab').setAttribute('aria-selected', String(!register));
  $('confirmation-field').hidden = !register;
  $('username').placeholder = register ? '3–16 letters, numbers or underscores' : '';
  $('password').placeholder = register ? '8–64 characters' : '';
  $('password').autocomplete = register ? 'new-password' : 'current-password';
  $('auth-submit').textContent = register ? 'Create account' : 'Sign in'; $('auth-message').textContent = '';
}

function openManual() { state.keys.clear(); state.fire = false; $('manual-dialog').showModal(); }
function playSound(id, volume) {
  if (!state.sound) return;
  const audio = $(id); audio.volume = volume; audio.currentTime = 0; audio.play().catch(() => {});
}
function activateSound(force = false) {
  if (state.sound) return;
  if (state.audioUnlocked && !force) return;
  state.audioUnlocked = true;
  state.sound = true; $('sound-button').textContent = 'Sound on'; $('sound-button').setAttribute('aria-pressed', 'true');
  // Prime both HTML audio elements during a user gesture for browser playback policies.
  for (const id of ['shoot-audio', 'altar-audio']) { const audio = $(id); audio.volume = 0; audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {}); }
}

$('register-tab').onclick = () => setAuthMode(true); $('signin-tab').onclick = () => setAuthMode(false);
$('auth-form').onsubmit = async event => {
  event.preventDefault();
  const username = $('username').value.trim(), password = $('password').value, confirmation = $('confirmation').value;
  $('auth-message').textContent = '';
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return $('auth-message').textContent = 'Use 3–16 letters, numbers or underscores for your username.';
  if (password.length < 8 || password.length > 64) return $('auth-message').textContent = 'Your password must contain 8–64 characters.';
  if (state.register && password !== confirmation) return $('auth-message').textContent = 'The passwords do not match.';
  $('auth-submit').disabled = true;
  try {
    if (state.register) await api('/api/register', { username, password, confirmation });
    const result = await api('/api/signin', { username, password });
    state.user = result.user; $('auth-form').reset(); renderAccount();
    await connectSocket(); toast('Signal established. Find a teammate to begin.');
  } catch (error) { $('auth-message').textContent = error.message; if (state.user) $('lobby-message').textContent = error.message; }
  finally { $('auth-submit').disabled = false; }
};
$('signout-button').onclick = async () => { try { await api('/api/signout', {}); state.socket?.disconnect(); state.user = null; state.game = null; state.lobby = { room: null, queued: false }; showScene('home'); renderAccount(); } catch (error) { toast(error.message); } };
$('queue-button').onclick = async () => {
  $('lobby-message').textContent = '';
  try { if (!state.socket?.connected) await connectSocket(); await request(state.lobby.queued ? 'queue:leave' : 'queue:join'); activateSound(); }
  catch (error) { $('lobby-message').textContent = error.message; }
};
$('ready-button').onclick = async () => { try { activateSound(); await request('room:ready'); } catch (error) { $('lobby-message').textContent = error.message; } };
$('leave-room-button').onclick = () => request('room:leave').catch(error => toast(error.message));
for (const button of document.querySelectorAll('[data-difficulty]')) button.onclick = () => request('room:difficulty', { difficulty: button.dataset.difficulty }).catch(error => toast(error.message));
$('manual-button').onclick = openManual; $('learn-button').onclick = openManual; $('game-help-button').onclick = openManual;
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => button.closest('dialog').close();
$('sound-button').onclick = () => { if (!state.sound) { activateSound(true); playSound('altar-audio', .2); } else { state.sound = false; $('sound-button').textContent = 'Sound off'; $('sound-button').setAttribute('aria-pressed', 'false'); } };
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', () => { state.keys.clear(); state.fire = false; });
$('skill-dialog').addEventListener('cancel', event => event.preventDefault());
$('skill-options').onclick = event => { const button = event.target.closest('[data-choose]'); if (button) request('game:action', { type: 'choose', skill: button.dataset.choose }).catch(error => toast(error.message)); };
$('skill-rack').onclick = event => { const button = event.target.closest('[data-slot]'); if (button) selectSkill(Number(button.dataset.slot)); };
for (const button of document.querySelectorAll('[data-cheat]')) button.onclick = () => {
  const key = button.dataset.cheat;
  request('game:action', { type: 'cheat', key, enabled: !state.game?.cheats[key] }).catch(error => toast(error.message));
};
$('abort-button').onclick = () => { state.keys.clear(); state.fire = false; $('leave-dialog').showModal(); };
$('confirm-leave').onclick = () => { $('leave-dialog').close(); request('room:leave').then(() => { state.game = null; showScene('home'); }).catch(error => toast(error.message)); };
$('restart-button').onclick = () => request('room:restart').catch(error => toast(error.message));
$('home-button').onclick = () => { const finish = () => { state.game = null; state.result = null; state.lobby = { room: null, queued: false }; showScene('home'); renderLobby(); }; state.socket?.connected ? request('room:leave').then(finish).catch(error => toast(error.message)) : finish(); };
document.querySelector('.brand').onclick = event => { if (state.scene === 'game') { event.preventDefault(); $('leave-dialog').showModal(); } };

async function loadLeaderboard(difficulty) {
  for (const button of document.querySelectorAll('[data-board]')) button.classList.toggle('selected', button.dataset.board === difficulty);
  $('global-ranking').textContent = 'Receiving explorer records…';
  try { const result = await api(`/api/rankings?difficulty=${difficulty}`); html($('global-ranking'), rankingMarkup(result.ranking)); } catch (error) { $('global-ranking').textContent = error.message; }
}
$('leaderboard-button').onclick = () => { state.keys.clear(); state.fire = false; $('leaderboard-dialog').showModal(); loadLeaderboard('normal'); };
for (const button of document.querySelectorAll('[data-board]')) button.onclick = () => loadLeaderboard(button.dataset.board);

document.addEventListener('keydown', event => {
  if (state.scene !== 'game' || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === 'tab') {
    event.preventDefault(); if (event.repeat) return;
    if ($('cheat-dialog').open) $('cheat-dialog').close();
    else { $('skill-dialog').close(); $('manual-dialog').close(); $('leave-dialog').close(); $('leaderboard-dialog').close(); state.keys.clear(); state.fire = false; $('cheat-dialog').showModal(); }
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  if (['w', 'a', 's', 'd', 'e', 'r', '1', '2', '3', ' '].includes(key)) event.preventDefault();
  state.keys.add(key);
  if (event.repeat) return;
  if (key === 'escape') { state.selected = null; renderer.target = null; renderGame(); }
  if (['1', '2', '3'].includes(key)) selectSkill(Number(key) - 1);
  if (key === 'e' || key === 'r') request('game:action', { type: key === 'e' ? 'interact' : 'absorb' }).catch(error => toast(error.message));
});
document.addEventListener('keyup', event => state.keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { state.keys.clear(); state.fire = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { state.keys.clear(); state.fire = false; } });
$('game-canvas').addEventListener('pointermove', event => { state.pointer = renderer.screenToWorld(event.clientX, event.clientY); if (state.selected !== null) renderer.target = state.pointer; });
$('game-canvas').addEventListener('pointerdown', event => {
  if (event.button !== 0 || state.scene !== 'game') return;
  event.preventDefault(); activateSound();
  if (state.selected !== null) {
    const target = renderer.screenToWorld(event.clientX, event.clientY);
    request('game:action', { type: 'cast', slot: state.selected, ...target, teammate: event.shiftKey }).catch(error => toast(error.message)); state.selected = null; renderer.target = null; renderGame();
  } else state.fire = true;
});
window.addEventListener('pointerup', () => { state.fire = false; });
$('game-canvas').addEventListener('contextmenu', event => event.preventDefault());
$('minimap').onclick = event => {
  const local = state.game?.players.find(p => p.id === state.socket?.id);
  if (state.selected === null || local?.skills[state.selected] !== 'teleport') return toast('Select Teleport, then click an unlocked altar on this map.');
  const rect = $('minimap').getBoundingClientRect(), target = { x: (event.clientX - rect.left) / rect.width * WIDTH, y: (event.clientY - rect.top) / rect.height * HEIGHT };
  const altar = ALTARS.filter(a => a.stage <= state.game.stage).sort((a, b) => distance(a, target) - distance(b, target))[0];
  if (!altar || distance(altar, target) > 4) return toast('Click an unlocked altar to select its safe zone.');
  request('game:action', { type: 'cast', slot: state.selected, x: altar.x, y: altar.y, teammate: event.shiftKey }).catch(error => toast(error.message)); state.selected = null; renderer.target = null; renderGame();
};

const inputTimer = setInterval(() => {
  if (state.scene !== 'game' || !state.socket?.connected || !state.game) return;
  const local = state.game.players.find(p => p.id === state.socket.id), blocked = !!document.querySelector('dialog[open]');
  const input = { x: blocked ? 0 : Number(state.keys.has('d')) - Number(state.keys.has('a')), y: blocked ? 0 : Number(state.keys.has('s')) - Number(state.keys.has('w')), fire: !blocked && state.fire, interact: !blocked && state.keys.has('e'), angle: local && state.pointer ? Math.atan2(state.pointer.y - local.y, state.pointer.x - local.x) : -Math.PI / 2 };
  state.socket.emit('game:input', input);
}, 50);

function animate(now) {
  const dt = Math.min(.05, (now - previousFrame) / 1000); previousFrame = now;
  if (state.scene === 'home') drawHero($('hero-canvas'), now / 1000);
  if (state.scene === 'game') renderer.draw(now / 1000, dt);
  animationFrame = requestAnimationFrame(animate);
}
animationFrame = requestAnimationFrame(animate);
renderAccount();
api('/api/session').then(async result => { if (result.user) { state.user = result.user; renderAccount(); await connectSocket(); } }).catch(error => toast(error.message));

export function disposeApplication() {
  clearInterval(inputTimer); clearTimeout(toastTimer); window.cancelAnimationFrame(animationFrame);
  state.socket?.removeAllListeners(); state.socket?.disconnect();
}
