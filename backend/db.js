const sqlite3 = require('sqlite3');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const connection = new sqlite3.Database(
  process.env.DB_PATH || path.join(__dirname, 'database.sqlite')
);
connection.configure('busyTimeout', 5000);
// A transaction owns the connection until it commits or rolls back. Other requests wait.
const context = new AsyncLocalStorage();
let queue = Promise.resolve();
function exclusive(work) {
  if (context.getStore()) return work();
  const pending = queue.then(() => context.run(true, work));
  queue = pending.catch(() => {});
  return pending;
}
const run = (sql, args = []) =>
  exclusive(
    () =>
      new Promise((resolve, reject) => {
        connection.run(sql, args, function (error) {
          error ? reject(error) : resolve({ id: this.lastID, changes: this.changes });
        });
      })
  );
const all = (sql, args = []) =>
  exclusive(
    () =>
      new Promise((resolve, reject) => {
        connection.all(sql, args, (error, rows) => (error ? reject(error) : resolve(rows)));
      })
  );
const get = async (sql, args) => (await all(sql, args))[0];
const transaction = (work) =>
  exclusive(async () => {
    await run('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await run('COMMIT');
      return result;
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  });
async function migrate() {
  await run('PRAGMA foreign_keys = ON');
  await run('PRAGMA journal_mode = WAL');
  await transaction(async () => {
    await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    const columns = await all('PRAGMA table_info(users)');
    // Add only the security field needed by older accounts. Never drop old tables or columns.
    if (!columns.some((column) => column.name === 'recovery_hash'))
      await run('ALTER TABLE users ADD COLUMN recovery_hash TEXT');
    await run(`CREATE TABLE IF NOT EXISTS appliances (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      name TEXT NOT NULL, room TEXT NOT NULL, watts REAL NOT NULL, hours REAL NOT NULL DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
    await run(`CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL, value REAL NOT NULL CHECK(value >= 0), note TEXT NOT NULL DEFAULT '', UNIQUE(user_id,date))`);
    await run(`CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL, units REAL NOT NULL CHECK(units >= 0), amount REAL NOT NULL CHECK(amount >= 0), UNIQUE(user_id,month))`);
    await run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL, agent TEXT NOT NULL)`);
    await run(
      'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)'
    );
    for (const table of ['appliances', 'readings', 'bills', 'sessions'])
      await run(`CREATE INDEX IF NOT EXISTS idx_${table}_user ON ${table}(user_id)`);
  });
}
module.exports = {
  run,
  all,
  get,
  transaction,
  migrate,
  close: () =>
    new Promise((resolve, reject) => connection.close((e) => (e ? reject(e) : resolve()))),
};
