import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, scrypt as deriveKey, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(deriveKey);
export const validUsername = name => typeof name === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(name);
export const validPassword = password => typeof password === 'string' && password.length >= 8 && password.length <= 64;
export const rankOrder = (a, b) => b.score - a.score || a.elapsed - b.elapsed || b.rescues - a.rescues || a.username.localeCompare(b.username);

// Extends Lab 5's JSON account storage and asynchronous password verification.
// Node's built-in scrypt replaces the lab's native Argon2 dependency.
export class Store {
  constructor(directory) {
    this.directory = directory;
    this.users = {};
    this.rankings = [];
    this.writes = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true });
    for (const [file, key, fallback] of [['users.json', 'users', {}], ['rankings.json', 'rankings', []]]) {
      try { this[key] = JSON.parse(await readFile(join(this.directory, file), 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        this[key] = fallback;
        await this.save(file, fallback);
      }
    }
  }

  save(filename, data) {
    const contents = JSON.stringify(data, null, 2) + '\n';
    const operation = this.writes.catch(() => {}).then(async () => {
      const target = join(this.directory, filename), temporary = target + '.tmp';
      await writeFile(temporary, contents, { mode: 0o600 });
      await rename(temporary, target);
    });
    this.writes = operation;
    return operation;
  }

  async register(username, password, confirmation) {
    if (!validUsername(username)) throw new Error('Use 3-16 letters, numbers or underscores for your username.');
    if (!validPassword(password)) throw new Error('Your password must contain 8-64 characters.');
    if (password !== confirmation) throw new Error('The passwords do not match.');
    const key = username.toLowerCase();
    if (Object.hasOwn(this.users, key)) throw new Error('That username is already registered.');
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    // Match Lab 5's second duplicate check after asynchronous password hashing.
    if (Object.hasOwn(this.users, key)) throw new Error('That username is already registered.');
    Object.defineProperty(this.users, key, { value: { username, salt, hash }, enumerable: true, writable: true, configurable: true });
    try { await this.save('users.json', this.users); }
    catch (error) { delete this.users[key]; throw error; }
    return { username };
  }

  async authenticate(username, password) {
    if (!validUsername(username) || !validPassword(password)) return null;
    const account = this.users[username.toLowerCase()];
    if (!account || !Object.hasOwn(this.users, username.toLowerCase())) return null;
    const candidate = await scrypt(password, account.salt, 64);
    const stored = Buffer.from(account.hash, 'hex');
    return stored.length === candidate.length && timingSafeEqual(stored, candidate) ? { username: account.username } : null;
  }

  leaderboard(difficulty = 'normal') {
    return this.rankings.filter(r => r.difficulty === difficulty).sort(rankOrder).slice(0, 25)
      .map((record, index) => ({ ...record, rank: index + 1 }));
  }

  async record(result) {
    if (result.outcome !== 'victory' || result.cheated) return;
    for (const player of result.players) {
      const record = { username: player.username, difficulty: result.difficulty, score: player.score, elapsed: result.elapsed, kills: player.stats.kills, stones: player.stats.stones, rescues: player.stats.rescues };
      const index = this.rankings.findIndex(r => r.username === record.username && r.difficulty === record.difficulty);
      if (index === -1) this.rankings.push(record);
      else if (rankOrder(record, this.rankings[index]) < 0) this.rankings[index] = record;
    }
    await this.save('rankings.json', this.rankings);
  }
}
