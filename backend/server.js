const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const { router: authRouter, authenticateToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Auth routes
app.use('/api/auth', authRouter);

// Profile routes
app.get('/api/users/profile', authenticateToken, (req, res) => {
  db.get(`SELECT id, name, email, phone, avatar FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

const bcrypt = require('bcrypt');
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  const { name, email, phone, avatar, password } = req.body;
  try {
    let query = `UPDATE users SET name = ?, email = ?, phone = ?, avatar = ?`;
    let params = [name, email, phone, avatar];
    
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      query += `, password_hash = ?`;
      params.push(passwordHash);
    }
    
    query += ` WHERE id = ?`;
    params.push(req.user.id);
    
    db.run(query, params, function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Email already in use' });
        }
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true, user: { id: req.user.id, name, email, phone, avatar } });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Protected routes
app.get('/api/appliances', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM appliances WHERE user_id = ?`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    // Transform boolean to match frontend expectation (1/0 to true/false)
    const appliances = rows.map(r => ({ ...r, on: !!r.on_state }));
    res.json(appliances);
  });
});

app.post('/api/appliances', authenticateToken, (req, res) => {
  const { name, brand, room, watts, on, hours, icon } = req.body;
  db.run(
    `INSERT INTO appliances (user_id, name, brand, room, watts, on_state, hours, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, name, brand, room, watts, on ? 1 : 0, hours, icon],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.put('/api/appliances/:id', authenticateToken, (req, res) => {
  const { name, brand, room, watts, on, hours } = req.body;
  const { id } = req.params;
  
  db.run(
    `UPDATE appliances SET 
      name = COALESCE(?, name),
      brand = COALESCE(?, brand),
      room = COALESCE(?, room),
      watts = COALESCE(?, watts),
      on_state = COALESCE(?, on_state),
      hours = COALESCE(?, hours)
     WHERE id = ? AND user_id = ?`,
    [name, brand, room, watts, on !== undefined ? (on ? 1 : 0) : null, hours, id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

app.delete('/api/appliances/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run(
    `DELETE FROM appliances WHERE id = ? AND user_id = ?`,
    [id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

app.get('/api/alerts', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM alerts WHERE user_id = ?`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const alerts = rows.map(r => ({ ...r, unread: !!r.unread }));
    res.json(alerts);
  });
});

app.put('/api/alerts/:id/read', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run(
    `UPDATE alerts SET unread = 0 WHERE id = ? AND user_id = ?`,
    [id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

app.put('/api/alerts/read-all', authenticateToken, (req, res) => {
  db.run(
    `UPDATE alerts SET unread = 0 WHERE user_id = ?`,
    [req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
