const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');
const validation = require('./validation');
const router = express.Router();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => crypto.randomBytes(32).toString('hex');
const cookieName = process.env.NODE_ENV === 'production' ? '__Host-ceb_session' : 'ceb_session';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
};
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  created_at: user.created_at,
  has_recovery: !!user.recovery_hash,
});

async function limit(key, max = 15, window = 15 * 60 * 1000) {
  const now = Date.now();
  await db.transaction(async () => {
    await db.run('DELETE FROM rate_limits WHERE expires < ?', [now]);
    const record = await db.get('SELECT * FROM rate_limits WHERE key=?', [key]);
    if (record && record.count >= max)
      validation.bad('Too many attempts. Try again in 15 minutes.', 429);
    await db.run(
      'INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
      [key, now + window]
    );
  });
}

async function createSession(req, res, user) {
  const token = secret(),
    csrf = secret(),
    now = Date.now();
  await db.run('DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?', [
    now,
    now - 30 * 60 * 1000,
  ]);
  await db.run(
    'INSERT INTO sessions (id,user_id,csrf,created_at,last_seen,expires_at,agent) VALUES (?,?,?,?,?,?,?)',
    [
      hash(token),
      user.id,
      csrf,
      now,
      now,
      now + 12 * 60 * 60 * 1000,
      String(req.headers['user-agent'] || 'Unknown browser').slice(0, 180),
    ]
  );
  await db.run(
    'DELETE FROM sessions WHERE user_id=? AND id NOT IN (SELECT id FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 10)',
    [user.id, user.id]
  );
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: 12 * 60 * 60 * 1000 });
  return { user: publicUser(user), csrf };
}

async function authenticate(req, res, next) {
  try {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) validation.bad('Please sign in to continue.', 401);
    const session = await db.get('SELECT * FROM sessions WHERE id=?', [hash(token)]);
    if (
      !session ||
      session.expires_at < Date.now() ||
      session.last_seen < Date.now() - 30 * 60 * 1000
    ) {
      res.clearCookie(cookieName, cookieOptions);
      validation.bad('Your session has expired. Please sign in again.', 401);
    }
    const user = await db.get('SELECT * FROM users WHERE id=?', [session.user_id]);
    if (!user) validation.bad('Please sign in again.', 401);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.headers['x-csrf-token'];
      if (
        typeof csrf !== 'string' ||
        !/^[a-f0-9]{64}$/.test(csrf) ||
        !crypto.timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))
      )
        validation.bad('Security check failed. Refresh the page and try again.', 403);
    }
    await db.run('UPDATE sessions SET last_seen=? WHERE id=?', [Date.now(), session.id]);
    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    next(error);
  }
}

async function checkPassword(user, value) {
  await limit('sensitive:' + user.id, 10);
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) > 72 ||
    !(await bcrypt.compare(value, user.password_hash))
  )
    validation.bad('The current password is incorrect.', 403);
}
router.use(async (req, res, next) => {
  try {
    if (req.method === 'POST') await limit('auth-ip:' + req.ip, 30);
    next();
  } catch (e) {
    next(e);
  }
});
router.post('/signup', async (req, res) => {
  const name = validation.text(req.body.name, 'Name', 100),
    email = validation.email(req.body.email),
    password = validation.password(req.body.password);
  const passwordHash = await bcrypt.hash(password, 12),
    recovery = secret();
  const user = await db.transaction(async () => {
    if (await db.get('SELECT id FROM users WHERE lower(email)=?', [email]))
      validation.bad(
        'Unable to create this account. Try signing in or using a different email.',
        409
      );
    const result = await db.run(
      'INSERT INTO users (name,email,password_hash,recovery_hash) VALUES (?,?,?,?)',
      [name, email, passwordHash, hash(recovery)]
    );

    return db.get('SELECT * FROM users WHERE id=?', [result.id]);
  });
  res.status(201).json({ ...(await createSession(req, res, user)), recovery });
});
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
router.post('/login', async (req, res) => {
  const email = validation.email(req.body.email);
  await limit('login-email:' + hash(email));
  const password =
    typeof req.body.password === 'string' && Buffer.byteLength(req.body.password) <= 72
      ? req.body.password
      : '';
  const user = await db.get('SELECT * FROM users WHERE lower(email)=?', [email]);
  const valid = await bcrypt.compare(password, user?.password_hash || dummyHash);
  if (!user || !valid) validation.bad('Email or password is incorrect.', 401);

  res.json(await createSession(req, res, user));
});
router.post('/recover', async (req, res) => {
  const email = validation.email(req.body.email),
    password = validation.password(req.body.password);
  const code = validation.text(req.body.recovery, 'Recovery code', 64);
  await limit('recover:' + hash(email), 5);
  const passwordHash = await bcrypt.hash(password, 12),
    recovery = secret();
  await db.transaction(async () => {
    const user = await db.get('SELECT * FROM users WHERE lower(email)=?', [email]);
    if (
      !user?.recovery_hash ||
      !crypto.timingSafeEqual(Buffer.from(hash(code)), Buffer.from(user.recovery_hash))
    )
      validation.bad('Email or recovery code is incorrect.', 401);
    await db.run('UPDATE users SET password_hash=?, recovery_hash=? WHERE id=?', [
      passwordHash,
      hash(recovery),
      user.id,
    ]);
    await db.run('DELETE FROM sessions WHERE user_id=?', [user.id]);
  });
  res.clearCookie(cookieName, cookieOptions).json({ recovery });
});
router.get('/session', authenticate, (req, res) =>
  res.json({ user: publicUser(req.user), csrf: req.session.csrf })
);
router.post('/logout', authenticate, async (req, res) => {
  await db.run('DELETE FROM sessions WHERE id=?', [req.session.id]);
  res.clearCookie(cookieName, cookieOptions).json({ success: true });
});
module.exports = {
  router,
  authenticate,
  publicUser,
  checkPassword,
  createSession,
  cookieName,
  cookieOptions,
  hash,
  secret,
  limit,
};
