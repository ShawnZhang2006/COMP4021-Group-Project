import { randomUUID } from 'node:crypto';
import { Game } from './game.js';
import { DIFFICULTIES, TICK_RATE } from '../public/shared/world.js';

// Adapts Lab 6's join/ready/start/update/disconnect lifecycle to isolated rooms.
export class Rooms {
  constructor(io, store) {
    this.io = io;
    this.store = store;
    this.rooms = new Map();
    this.connections = new Map();
    this.queue = [];
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
    this.previous = performance.now();
    io.use((socket, next) => {
      const user = socket.request.session?.user;
      if (!user) return next(new Error('Please sign in before connecting.'));
      if (this.connections.has(user.username.toLowerCase())) return next(new Error('This account is already connected in another tab. Use a different account for player two.'));
      socket.user = user;
      this.connections.set(user.username.toLowerCase(), socket);
      next();
    });
    io.on('connection', socket => this.connect(socket));
  }

  connect(socket) {
    socket.roomId = null;
    this.lobby(socket);
    const handle = (event, fn) => socket.on(event, (payload, ack) => {
      try {
        const value = fn(payload || {});
        if (typeof ack === 'function') ack({ ok: true, ...value });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, error: error.message });
        else socket.emit('notice', error.message);
      }
    });
    handle('queue:join', () => this.join(socket));
    handle('queue:leave', () => { this.queue = this.queue.filter(s => s.id !== socket.id); this.lobby(socket); });
    handle('room:difficulty', data => {
      const room = this.requireRoom(socket);
      if (room.game && !room.game.result) throw new Error('Difficulty cannot change during a run.');
      if (room.members[0].id !== socket.id) throw new Error('The room host chooses the difficulty.');
      if (!Object.hasOwn(DIFFICULTIES, data.difficulty)) throw new Error('Choose a valid difficulty.');
      room.difficulty = data.difficulty; room.ready.clear(); this.broadcastLobby(room);
    });
    handle('room:ready', () => {
      const room = this.requireRoom(socket);
      if (room.game) throw new Error('Choose Play again after the current run.');
      room.ready.has(socket.id) ? room.ready.delete(socket.id) : room.ready.add(socket.id);
      this.broadcastLobby(room);
      if (room.members.length === 2 && room.ready.size === 2) this.start(room);
    });
    handle('room:restart', () => {
      const room = this.requireRoom(socket);
      if (!room.game?.result) throw new Error('Finish the current run before restarting.');
      room.game = null; room.ready.clear(); room.finalizing = false; this.broadcastLobby(room);
    });
    handle('room:leave', () => this.leave(socket));
    socket.on('game:input', input => {
      const room = this.rooms.get(socket.roomId);
      room?.game?.receiveInput(socket.id, input);
    });
    handle('game:action', action => {
      const room = this.requireRoom(socket);
      if (!room.game || room.game.result) throw new Error('There is no active run.');
      room.game.action(socket.id, action);
    });
    socket.on('disconnect', () => {
      this.queue = this.queue.filter(s => s.id !== socket.id);
      const key = socket.user.username.toLowerCase();
      if (this.connections.get(key)?.id === socket.id) this.connections.delete(key);
      this.leave(socket, true);
    });
  }

  requireRoom(socket) {
    const room = this.rooms.get(socket.roomId);
    if (!room || !room.members.some(s => s.id === socket.id)) throw new Error('Join a room first.');
    return room;
  }

  lobby(socket) {
    const room = this.rooms.get(socket.roomId);
    socket.emit('lobby', {
      room: room ? { id: room.id, difficulty: room.difficulty, host: room.members[0].id,
        players: room.members.map((s, index) => ({ id: s.id, username: s.user.username, ready: room.ready.has(s.id), color: index ? 'mint' : 'ember' })) } : null,
      queued: this.queue.some(s => s.id === socket.id)
    });
  }

  broadcastLobby(room) { for (const member of room.members) this.lobby(member); }

  join(socket) {
    if (socket.roomId) throw new Error('You already have a teammate.');
    if (this.queue.some(s => s.id === socket.id)) return;
    this.queue.push(socket);
    this.queue = this.queue.filter(s => s.connected);
    if (this.queue.length >= 2) {
      const members = this.queue.splice(0, 2);
      const room = { id: randomUUID(), members, difficulty: 'normal', ready: new Set(), game: null, finalizing: false };
      this.rooms.set(room.id, room);
      for (const member of members) { member.roomId = room.id; member.join(room.id); }
      this.broadcastLobby(room);
    } else this.lobby(socket);
  }

  start(room) {
    room.game = new Game(room.members.map(s => ({ id: s.id, username: s.user.username })), room.difficulty);
    room.finalizing = false;
    this.io.to(room.id).emit('game:started', room.game.snapshot());
  }

  leave(socket, disconnected = false) {
    this.queue = this.queue.filter(s => s.id !== socket.id);
    const room = this.rooms.get(socket.roomId);
    if (room) {
      if (room.game && !room.game.result) {
        room.game.finish('aborted', disconnected ? `${socket.user.username} disconnected. This run is not ranked.` : `${socket.user.username} left the room. This run is not ranked.`);
        this.io.to(room.id).emit('game:over', { ...room.game.result, ranking: this.store.leaderboard(room.difficulty), roomClosed: true });
      }
      for (const member of room.members) {
        member.leave(room.id); member.roomId = null;
        if (member.connected) {
          if (!room.game || room.game.result?.outcome !== 'aborted') this.lobby(member);
          if (member.id !== socket.id) member.emit('notice', 'Your teammate left. You can find another explorer.');
        }
      }
      this.rooms.delete(room.id);
    }
    socket.roomId = null;
    if (!disconnected) this.lobby(socket);
  }

  tick() {
    const now = performance.now();
    const dt = Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    for (const room of this.rooms.values()) {
      const game = room.game;
      if (!game || game.result) continue;
      // Fixed simulation steps retain elapsed wall time after a slow event-loop tick.
      for (let remaining = dt; remaining > .000001 && !game.result; remaining -= .05) game.update(Math.min(.05, remaining));
      if (game.events.length) this.io.to(room.id).emit('game:events', game.events.splice(0));
      this.io.to(room.id).emit('game:state', game.snapshot());
      if (game.result && !room.finalizing) {
        room.finalizing = true;
        this.store.record(game.result).then(() => {
          if (this.rooms.get(room.id) !== room) return;
          this.io.to(room.id).emit('game:over', { ...game.result, ranking: this.store.leaderboard(room.difficulty) });
        }).catch(error => {
          console.error('Could not save the leaderboard:', error.message);
          this.io.to(room.id).emit('game:over', { ...game.result, ranking: this.store.leaderboard(room.difficulty), storageError: 'This result could not be saved. Please try again later.' });
        });
      }
    }
  }

  close() { clearInterval(this.timer); }
}
