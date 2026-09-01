const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev';

// Signup Endpoint
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    db.run(
      `INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`,
      [name, email, passwordHash],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already in use' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        
        const userId = this.lastID;
        const token = jwt.sign({ id: userId, name, email }, JWT_SECRET, { expiresIn: '24h' });
        
        // Seed default appliances and alerts for the new user
        seedDefaultData(userId);
        
        res.status(201).json({ message: 'User created successfully', token, user: { id: userId, name, email } });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login Endpoint
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email } });
  });
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied, token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

function seedDefaultData(userId) {
  const appliances = [
    ['Air Conditioner', 'Bedroom', 1200, 1, 5.2, '❄'],
    ['Refrigerator', 'Kitchen', 180, 1, 24, '▣'],
    ['Water Heater', 'Bathroom', 2000, 0, 1.1, '♨'],
    ['Television', 'Living Room', 110, 1, 4.3, '▤'],
    ['Washing Machine', 'Laundry', 500, 0, 0.8, '◉'],
    ['Ceiling Fan', 'Living Room', 75, 1, 8.5, '✣']
  ];
  
  const applianceStmt = db.prepare(`INSERT INTO appliances (user_id, name, room, watts, on_state, hours, icon) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  appliances.forEach(app => applianceStmt.run(userId, ...app));
  applianceStmt.finalize();

  const alerts = [
    ['Air conditioner running unusually long', 'Bedroom AC has been active for 5.2 hours today.', '10 minutes ago', 1, '❄'],
    ['High peak-hour consumption detected', 'Usage between 7 PM and 8 PM was 32% above your normal level.', 'Yesterday', 1, '⚡'],
    ['Television may be idle', 'TV has been switched on with low activity for 2 hours.', 'Yesterday', 1, '▤'],
    ['Weekly target achieved', 'You used 8.4% less energy than last week.', '2 days ago', 0, '✓']
  ];

  const alertStmt = db.prepare(`INSERT INTO alerts (user_id, title, text, time, unread, icon) VALUES (?, ?, ?, ?, ?, ?)`);
  alerts.forEach(alert => alertStmt.run(userId, ...alert));
  alertStmt.finalize();
}

module.exports = { router, authenticateToken };
