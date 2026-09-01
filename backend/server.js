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
  const { name, room, watts, on, hours, icon } = req.body;
  db.run(
    `INSERT INTO appliances (user_id, name, room, watts, on_state, hours, icon) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, name, room, watts, on ? 1 : 0, hours, icon],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.put('/api/appliances/:id', authenticateToken, (req, res) => {
  const { on, hours } = req.body;
  const { id } = req.params;
  
  // Note: Only updating what is needed for now
  db.run(
    `UPDATE appliances SET on_state = ?, hours = ? WHERE id = ? AND user_id = ?`,
    [on !== undefined ? (on ? 1 : 0) : undefined, hours, id, req.user.id],
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
