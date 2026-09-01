const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Create users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error("Error creating users table", err.message);
      else {
        // Migration: add phone and avatar if they don't exist
        db.all("PRAGMA table_info(users)", (err, columns) => {
          if (!err) {
            const hasPhone = columns.some(c => c.name === 'phone');
            const hasAvatar = columns.some(c => c.name === 'avatar');
            if (!hasPhone) db.run("ALTER TABLE users ADD COLUMN phone TEXT");
            if (!hasAvatar) db.run("ALTER TABLE users ADD COLUMN avatar TEXT");
          }
        });
      }
    });

    // Create appliances table
    db.run(`CREATE TABLE IF NOT EXISTS appliances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      room TEXT NOT NULL,
      watts INTEGER NOT NULL,
      on_state BOOLEAN DEFAULT 0,
      hours REAL DEFAULT 0,
      icon TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`, (err) => {
      if (err) console.error("Error creating appliances table", err.message);
    });

    // Create alerts table
    db.run(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      time TEXT NOT NULL,
      unread BOOLEAN DEFAULT 1,
      icon TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`, (err) => {
      if (err) console.error("Error creating alerts table", err.message);
    });
  }
});

module.exports = db;
