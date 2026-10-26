require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
const express = require('express');
const helmet = require('helmet');
const path = require('node:path');
const bcrypt = require('bcrypt');
const db = require('./db');
const auth = require('./auth');
const validation = require('./validation');
const app = express();
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.APP_ORIGIN || !process.env.APP_ORIGIN.startsWith('https://'))
)
  throw new Error('Production requires an HTTPS APP_ORIGIN.');

// Request security and API middleware
app.disable('x-powered-by');
// Reject unexpected Host headers, including DNS-rebinding requests to the local server.
app.use((req, res, next) => {
  const allowed = process.env.APP_ORIGIN
    ? [new URL(process.env.APP_ORIGIN).hostname]
    : ['localhost', '127.0.0.1', '[::1]', '::1'];
  if (!allowed.includes(req.hostname))
    return res.status(421).json({ error: 'Host is not configured for this app.' });
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
  })
);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) {
    const origin = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if (
      req.get('sec-fetch-site') === 'cross-site' ||
      (req.get('origin') && req.get('origin') !== origin) ||
      req.get('x-requested-with') !== 'CEBEnergySaver'
    )
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'Send JSON data.' });
  }
  next();
});

app.use(express.json({ limit: '32kb', strict: true }));
app.use('/api', (req, res, next) => {
  if (
    !['GET', 'HEAD'].includes(req.method) &&
    (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
  )
    return res.status(400).json({ error: 'Expected a JSON object.' });
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', auth.router);
app.use('/api', auth.authenticate);
app.use('/api', async (req, res, next) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) await auth.limit('write:' + req.user.id, 300);
    next();
  } catch (e) {
    next(e);
  }
});

// Collect the signed-in household data used by the dashboard.
async function household(user) {
  const [appliances, readings, bills] = await Promise.all([
    db.all('SELECT id,name,room,watts,hours FROM appliances WHERE user_id=? ORDER BY id DESC', [
      user.id,
    ]),
    db.all('SELECT id,date,value,note FROM readings WHERE user_id=? ORDER BY date', [user.id]),
    db.all('SELECT id,month,units,amount FROM bills WHERE user_id=? ORDER BY month DESC', [
      user.id,
    ]),
  ]);
  return { user: auth.publicUser(user), appliances, readings, bills };
}

app.get('/api/household', async (req, res) => res.json(await household(req.user)));

// Profile and account security
app.get('/api/users/profile', (req, res) => res.json(auth.publicUser(req.user)));
app.put('/api/users/profile', async (req, res) => {
  const name = validation.text(req.body.name, 'Name', 100);
  const email = validation.email(req.body.email);
  const emailChanged = email !== req.user.email.toLowerCase();
  if (emailChanged) await auth.checkPassword(req.user, req.body.current_password);
  await db.transaction(async () => {
    if (await db.get('SELECT id FROM users WHERE lower(email)=? AND id<>?', [email, req.user.id]))
      validation.bad('This email cannot be used. Choose another email.', 409);
    await db.run('UPDATE users SET name=?,email=? WHERE id=?', [name, email, req.user.id]);
    if (emailChanged)
      await db.run('DELETE FROM sessions WHERE user_id=? AND id<>?', [req.user.id, req.session.id]);
  });
  res.json(auth.publicUser(await db.get('SELECT * FROM users WHERE id=?', [req.user.id])));
});

app.post('/api/security/password', async (req, res) => {
  validation.password(req.body.password);
  await auth.checkPassword(req.user, req.body.current_password);
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  await db.transaction(async () => {
    await db.run('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, req.user.id]);
    await db.run('DELETE FROM sessions WHERE user_id=?', [req.user.id]);
  });
  res.json(await auth.createSession(req, res, req.user));
});

app.post('/api/security/recovery', async (req, res) => {
  await auth.checkPassword(req.user, req.body.current_password);
  const recovery = auth.secret();
  await db.run('UPDATE users SET recovery_hash=? WHERE id=?', [auth.hash(recovery), req.user.id]);

  res.json({ recovery });
});

// Household records

function validateAppliance(input) {
  return [
    validation.text(input.name, 'Appliance name', 80),
    validation.text(input.room, 'Room', 50),
    validation.number(input.watts, 'Rated power', 1, 50000),
    validation.number(input.hours, 'Daily hours', 0, 24),
  ];
}

app.post('/api/appliances', async (req, res) => {
  const values = validateAppliance(req.body);
  if ((await db.get('SELECT count(*) n FROM appliances WHERE user_id=?', [req.user.id])).n >= 200)
    validation.bad('You can save up to 200 appliances.');
  const result = await db.run(
    'INSERT INTO appliances (name,room,watts,hours,user_id) VALUES (?,?,?,?,?)',
    [...values, req.user.id]
  );
  res.status(201).json(result);
});

app.put('/api/appliances/:id', async (req, res) => {
  const id = validation.id(req.params.id),
    old = await db.get('SELECT * FROM appliances WHERE id=? AND user_id=?', [id, req.user.id]);
  if (!old) validation.bad('Appliance not found.', 404);
  const b = { ...old, ...req.body };
  const result = await db.run(
    'UPDATE appliances SET name=?,room=?,watts=?,hours=? WHERE id=? AND user_id=?',
    [...validateAppliance(b), id, req.user.id]
  );
  res.json(result);
});

app.post('/api/readings', async (req, res) => {
  const date = validation.date(req.body.date),
    value = validation.number(req.body.value, 'Meter reading', 0, 999999999),
    note = validation.text(req.body.note || '', 'Note', 250, false);
  const result = await db.transaction(async () => {
    const prev = await db.get(
      'SELECT value FROM readings WHERE user_id=? AND date<? ORDER BY date DESC LIMIT 1',
      [req.user.id, date]
    );
    const next = await db.get(
      'SELECT value FROM readings WHERE user_id=? AND date>? ORDER BY date LIMIT 1',
      [req.user.id, date]
    );
    if ((prev && value < prev.value) || (next && value > next.value))
      validation.bad('Cumulative readings must increase with time. Check the date and reading.');
    return db.run('INSERT INTO readings (user_id,date,value,note) VALUES (?,?,?,?)', [
      req.user.id,
      date,
      value,
      note,
    ]);
  });
  res.status(201).json(result);
});

app.post('/api/bills', async (req, res) => {
  const month = validation.text(req.body.month, 'Billing month', 7);
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    month < '2000-01' ||
    month > validation.today().slice(0, 7)
  )
    validation.bad('Choose a valid current or past billing month.');
  const result = await db.run('INSERT INTO bills (user_id,month,units,amount) VALUES (?,?,?,?)', [
    req.user.id,
    month,
    validation.number(req.body.units, 'Units', 0, 1000000),
    validation.number(req.body.amount, 'Bill amount', 0, 100000000),
  ]);
  res.status(201).json(result);
});

for (const table of ['appliances', 'readings', 'bills'])
  app.delete(`/api/${table}/:id`, async (req, res) => {
    const result = await db.run(`DELETE FROM ${table} WHERE id=? AND user_id=?`, [
      validation.id(req.params.id),
      req.user.id,
    ]);
    if (!result.changes) validation.bad('Record not found.', 404);
    res.json({ success: true });
  });

// Static pages and centralized error handling
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(__dirname, '../frontend'), { dotfiles: 'deny', etag: true }));
app.use((req, res) => res.status(404).type('text').send('Page not found.'));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  let status = error.status || 500,
    message = error.message;
  if (error.code === 'SQLITE_CONSTRAINT') {
    status = 409;
    message = 'This record already exists or conflicts with saved data.';
  }
  if (error.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON data.';
  }
  if (status >= 500) {
    console.error('Request failed:', error.code || error.name);
    message = 'Something went wrong. Your changes could not be saved. Please try again.';
  }
  if (status === 429) res.set('Retry-After', '900');
  res.status(status).json({ error: message });
});

// Migrate the database before accepting requests.
async function start() {
  await db.migrate();
  return app.listen(Number(process.env.PORT) || 3000, process.env.HOST || '127.0.0.1', () =>
    console.log(
      `Energy Saver is ready at ${process.env.APP_ORIGIN || 'http://localhost:' + (process.env.PORT || 3000)}`
    )
  );
}
if (require.main === module)
  start()
    .then((server) => {
      for (const signal of ['SIGINT', 'SIGTERM'])
        process.once(signal, () => server.close(() => db.close().then(() => process.exit(0))));
    })
    .catch((error) => {
      console.error('Startup failed:', error.message);
      process.exit(1);
    });
module.exports = { app, start };
