import express from 'express';
import session from 'express-session';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import { Store } from './server/store.js';
import { Rooms } from './server/rooms.js';

const root = dirname(fileURLToPath(import.meta.url));

// HTTP account routes and session maintenance are adapted from Lab 5.
// The shared HTTP/Socket.IO server and ready lifecycle are adapted from Lab 6.
export async function createApplication({ dataDirectory = process.env.ASHFALL_DATA_DIR || join(root, 'data'), sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex') } = {}) {
  const store = new Store(dataDirectory);
  await store.initialize();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  const gameSession = session({
    name: 'ashfall.sid', secret: sessionSecret, resave: false, saveUninitialized: false, rolling: true,
    cookie: { maxAge: 12 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
  });
  app.use(gameSession);
  const httpServer = createServer(app);
  const io = new Server(httpServer, { transports: ['websocket'], maxHttpBufferSize: 16384 });
  io.engine.use(gameSession);
  const rooms = new Rooms(io, store);
  app.get('/api/session', (req, res) => res.json({ user: req.session.user || null }));
  app.post('/api/register', async (req, res) => {
    try {
      const { username, password, confirmation } = req.body || {};
      await store.register(typeof username === 'string' ? username.trim() : username, password, confirmation);
      res.status(201).json({ success: true });
    } catch (error) {
      const expected = /username|password|characters|letters|registered/.test(error.message);
      res.status(expected ? 400 : 500).json({ error: expected ? error.message : 'Registration could not be saved. Please try again.' });
    }
  });
  app.post('/api/signin', async (req, res) => {
    const { username, password } = req.body || {};
    try {
      const user = await store.authenticate(typeof username === 'string' ? username.trim() : username, password);
      if (!user) return res.status(401).json({ error: 'Incorrect username or password.' });
      req.session.regenerate(error => {
        if (error) return res.status(500).json({ error: 'Could not create a login session.' });
        req.session.user = user;
        req.session.save(error => error ? res.status(500).json({ error: 'Could not save your login session.' }) : res.json({ user }));
      });
    } catch { res.status(500).json({ error: 'Sign-in is temporarily unavailable.' }); }
  });
  app.post('/api/signout', (req, res) => {
    const user = req.session.user;
    if (user) rooms.connections.get(user.username.toLowerCase())?.disconnect(true);
    req.session.destroy(() => { res.clearCookie('ashfall.sid'); res.json({ success: true }); });
  });
  app.get('/api/rankings', (req, res) => res.json({ ranking: store.leaderboard(req.query.difficulty) }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', rooms: rooms.rooms.size }));
  app.get('/README.html', (req, res) => res.sendFile(join(root, 'README.html')));
  app.use(express.static(join(root, 'public'), { dotfiles: 'deny' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.type === 'entity.parse.failed' ? 400 : 500).json({ error: error.type === 'entity.parse.failed' ? 'Please send valid JSON.' : 'The server could not complete this request.' });
  });
  return { app, httpServer, io, rooms, store,
    async close() {
      rooms.close();
      await new Promise(resolve => io.close(resolve));
      if (httpServer.listening) await new Promise(resolve => httpServer.close(resolve));
      await store.writes;
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const application = await createApplication();
  application.httpServer.listen(8000, () => console.log('ASHFALL is running at http://localhost:8000'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await application.close(); process.exit(0); });
}
