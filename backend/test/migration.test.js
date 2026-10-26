const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-migration-'));
process.env.DB_PATH = path.join(directory, 'test.sqlite');
const db = require('../db');

test('older accounts, extra columns and archived records survive migration and restart', async () => {
  let closed = false;
  try {
    await db.run(
      'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)'
    );
    await db.run(
      'CREATE TABLE appliances (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT, room TEXT, watts INTEGER, on_state INTEGER, hours REAL, icon TEXT)'
    );
    // Represents data from a retired screen. Migration must never discard an existing table.
    await db.run('CREATE TABLE settings (user_id INTEGER PRIMARY KEY, goal_name TEXT)');
    await db.run(
      "INSERT INTO users(id,name,email,password_hash,address) VALUES (1,'Existing household','legacy@example.com','hash-to-preserve','Saved address')"
    );
    await db.run("INSERT INTO appliances VALUES (1,1,'Existing fan','Living',75,1,8,'fan')");
    await db.run("INSERT INTO settings VALUES (1,'Saved household record')");
    await db.migrate();
    await db.migrate();
    assert.equal(
      (await db.get('SELECT password_hash FROM users WHERE id=1')).password_hash,
      'hash-to-preserve'
    );
    assert.equal((await db.get('SELECT address FROM users WHERE id=1')).address, 'Saved address');
    assert.equal((await db.get('SELECT name FROM appliances WHERE id=1')).name, 'Existing fan');
    await db.run(
      "INSERT INTO readings(user_id,date,value,note) VALUES (1,'2026-01-01',100,'Persistent reading')"
    );
    await db.run("INSERT INTO bills(user_id,month,units,amount) VALUES (1,'2026-01',180,6420)");
    await db.close();
    closed = true;
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `const db=require('./db');(async()=>{await db.migrate();console.log(JSON.stringify({user:await db.get('SELECT * FROM users WHERE id=1'),appliance:await db.get('SELECT * FROM appliances WHERE id=1'),reading:await db.get('SELECT * FROM readings WHERE user_id=1'),bill:await db.get('SELECT * FROM bills WHERE user_id=1'),archive:await db.get('SELECT * FROM settings WHERE user_id=1')}));await db.close()})().catch(()=>process.exit(1))`,
      ],
      { cwd: path.resolve(__dirname, '..'), env: process.env, encoding: 'utf8' }
    );
    const saved = JSON.parse(output.trim());
    assert.equal(saved.user.password_hash, 'hash-to-preserve');
    assert.equal(saved.user.address, 'Saved address');
    assert.equal(saved.appliance.on_state, 1);
    assert.equal(saved.reading.value, 100);
    assert.equal(saved.bill.amount, 6420);
    assert.equal(saved.archive.goal_name, 'Saved household record');
  } finally {
    if (!closed) await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
