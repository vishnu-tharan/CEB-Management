const sqlite3 = require('sqlite3');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const connection = new sqlite3.Database(process.env.DB_PATH || path.join(__dirname, 'database.sqlite'));
connection.configure('busyTimeout', 5000);
const context = new AsyncLocalStorage();
let queue = Promise.resolve();
function exclusive(work) {
  if (context.getStore()) return work();
  const pending = queue.then(() => context.run(true, work));
  queue = pending.catch(() => {});
  return pending;
}
const run = (sql, args = []) => exclusive(() => new Promise((resolve, reject) => {
  connection.run(sql, args, function (error) { error ? reject(error) : resolve({ id: this.lastID, changes: this.changes }); });
}));
const all = (sql, args = []) => exclusive(() => new Promise((resolve, reject) => {
  connection.all(sql, args, (error, rows) => error ? reject(error) : resolve(rows));
}));
const get = async (sql, args) => (await all(sql, args))[0];
const transaction = work => exclusive(async () => {
  await run('BEGIN IMMEDIATE');
  try { const result = await work(); await run('COMMIT'); return result; }
  catch (error) { await run('ROLLBACK'); throw error; }
});
async function migrate() {
  await run('PRAGMA foreign_keys = ON');
  await run('PRAGMA journal_mode = WAL');
  await transaction(async () => {
    await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    const columns = await all('PRAGMA table_info(users)');
    for (const [name, type] of Object.entries({phone:"TEXT DEFAULT ''", avatar:"TEXT DEFAULT ''", address:"TEXT DEFAULT ''", district:"TEXT DEFAULT ''", account_number:"TEXT DEFAULT ''", recovery_hash:'TEXT'})) {
      if (!columns.some(c => c.name === name)) await run(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
    }
    await run(`CREATE TABLE IF NOT EXISTS appliances (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      name TEXT NOT NULL, room TEXT NOT NULL, watts REAL NOT NULL, on_state INTEGER DEFAULT 0, hours REAL DEFAULT 0,
      icon TEXT, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
    if (!(await all('PRAGMA table_info(appliances)')).some(c => c.name === 'brand')) await run("ALTER TABLE appliances ADD COLUMN brand TEXT DEFAULT ''");
    await run(`CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      title TEXT NOT NULL, text TEXT NOT NULL, time TEXT NOT NULL, unread INTEGER DEFAULT 1, icon TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
    await run(`CREATE TABLE IF NOT EXISTS settings (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      monthly_target REAL NOT NULL DEFAULT 210, budget REAL NOT NULL DEFAULT 6000, high_usage INTEGER NOT NULL DEFAULT 1,
      power_limit REAL NOT NULL DEFAULT 3000, reminders INTEGER NOT NULL DEFAULT 1, goal_name TEXT NOT NULL DEFAULT 'My monthly energy target')`);
    await run(`CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL, value REAL NOT NULL CHECK(value >= 0), note TEXT NOT NULL DEFAULT '', UNIQUE(user_id,date))`);
    await run(`CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL, units REAL NOT NULL CHECK(units >= 0), amount REAL NOT NULL CHECK(amount >= 0), UNIQUE(user_id,month))`);
    await run(`CREATE TABLE IF NOT EXISTS schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      appliance_id INTEGER NOT NULL REFERENCES appliances(id) ON DELETE CASCADE, start TEXT NOT NULL, end TEXT NOT NULL,
      days TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, UNIQUE(user_id,appliance_id))`);
    await run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL, agent TEXT NOT NULL)`);
    await run(`CREATE TABLE IF NOT EXISTS security_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await run('CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
    for (const table of ['appliances','alerts','readings','bills','schedules','sessions','security_events']) await run(`CREATE INDEX IF NOT EXISTS idx_${table}_user ON ${table}(user_id)`);
    await run('INSERT OR IGNORE INTO settings (user_id) SELECT id FROM users');
  });
}
module.exports = { run, all, get, transaction, migrate, close: () => new Promise((resolve, reject) => connection.close(e => e ? reject(e) : resolve())) };