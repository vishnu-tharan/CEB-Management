const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const db = require('../db');
const { app } = require('../server');
const Energy = require('../../frontend/energy');
let server, base;
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db.close();
});

function client() {
  return {
    cookie: '',
    csrf: '',
    async request(path, method = 'GET', body, extraHeaders = {}) {
      const headers = { 'X-Requested-With': 'CEBEnergySaver', Cookie: this.cookie };
      if (method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        headers['X-CSRF-Token'] = this.csrf;
      }
      const response = await fetch(base + path, {
        method,
        headers: { ...headers, ...extraHeaders },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      });
      const cookie = response.headers.get('set-cookie');
      if (cookie) this.cookie = cookie.split(';')[0];
      const data = await response.json();
      if (data.csrf) this.csrf = data.csrf;
      return { status: response.status, data, headers: response.headers };
    },
  };
}

test('tariff boundaries, fixed charges and fractional use', () => {
  for (const [units, total] of [
    [0, 80],
    [30, 230],
    [31, 369],
    [60, 630],
    [61, 1260],
    [90, 1840],
    [91, 2468],
    [120, 3280],
    [121, 3824],
    [180, 6420],
    [181, 8450],
    [200, 10350],
  ])
    assert.equal(Energy.bill(units).total, total, `${units} kWh`);
  assert.equal(Energy.bill(30.5).total, 364.5);
  for (const invalid of [-1, NaN, Infinity]) assert.throws(() => Energy.bill(invalid));
});

test('meter estimates weight intervals by days and appliances preserve zero hours', () => {
  const readings = [
    { date: '2026-01-01', value: 100 },
    { date: '2026-01-03', value: 110 },
    { date: '2026-01-10', value: 180 },
  ];
  assert.equal(Energy.forecast(readings, []).daily, 80 / 9);
  assert.equal(Energy.intervals(readings).length, 2);
  assert.deepEqual(Energy.intervals([{ date: '2026-01-01', value: 100 }]), []);
  assert.equal(Energy.daily([{ watts: 1000, hours: 0 }]), 0);
  assert.equal(Energy.forecast([], [{ watts: 100, hours: 5 }]).monthly, 15);
  assert.equal(Energy.forecast([], []).monthly, 0);
});

test('household API, ownership and authentication', async (t) => {
  await db.migrate();
  await db.migrate();
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = 'http://127.0.0.1:' + server.address().port;
  const owner = client(),
    neighbour = client(),
    secondSession = client(),
    guest = client();
  const password = 'Unique-household-passphrase-47';
  let recovery, applianceId, readingId, billId;
  await t.test('registration, cookies, host/origin checks and JSON validation', async () => {
    assert.equal((await guest.request('/api/household')).status, 401);
    const invalidHostStatus = await new Promise((resolve, reject) => {
      require('node:http')
        .get(base + '/api/health', { headers: { Host: 'attacker.example' } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(invalidHostStatus, 421);
    assert.equal(
      (
        await fetch(base + '/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CEBEnergySaver' },
          body: '{',
        })
      ).status,
      400
    );
    assert.equal(
      (
        await guest.request('/api/auth/signup', 'POST', {
          name: 'Household',
          email: 'home@example.com',
          password: 'short',
        })
      ).status,
      400
    );
    assert.equal(
      (
        await guest.request(
          '/api/auth/signup',
          'POST',
          { name: 'Household', email: 'home@example.com', password },
          { Origin: 'https://attacker.example' }
        )
      ).status,
      403
    );
    const result = await owner.request('/api/auth/signup', 'POST', {
      name: 'Primary household',
      email: 'HOME@example.com',
      password,
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.user.email, 'home@example.com');
    assert.match(result.headers.get('set-cookie'), /HttpOnly/);
    assert.match(result.headers.get('set-cookie'), /SameSite=Strict/);
    assert.match(result.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(result.headers.get('access-control-allow-origin'), null);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.data.user.password_hash, undefined);
    recovery = result.data.recovery;
    assert.equal(recovery.length, 64);
    assert.equal(
      (
        await neighbour.request('/api/auth/signup', 'POST', {
          name: 'Other household',
          email: 'other@example.com',
          password,
        })
      ).status,
      201
    );
    assert.equal(
      (
        await guest.request('/api/auth/signup', 'POST', {
          name: 'Duplicate',
          email: 'home@example.com',
          password,
        })
      ).status,
      409
    );
    assert.equal(
      (
        await secondSession.request('/api/auth/login', 'POST', {
          email: 'home@example.com',
          password,
        })
      ).status,
      200
    );
    assert.deepEqual((await owner.request('/api/household')).data.appliances, []);
  });
  await t.test('appliance validation, CRUD and isolation', async () => {
    const appliance = {
      name: 'Fan <img src=x onerror=alert(1)>',
      room: 'Living room',
      watts: 75,
      hours: 0,
    };
    assert.equal(
      (await owner.request('/api/appliances', 'POST', appliance, { 'X-CSRF-Token': '' })).status,
      403
    );
    for (const hours of [-1, 25, '4', null])
      assert.equal(
        (await owner.request('/api/appliances', 'POST', { ...appliance, hours })).status,
        400
      );
    assert.equal(
      (await owner.request('/api/appliances', 'POST', { ...appliance, watts: Infinity })).status,
      400
    );
    const created = await owner.request('/api/appliances', 'POST', appliance);
    assert.equal(created.status, 201);
    applianceId = created.data.id;
    assert.equal(
      (await neighbour.request('/api/appliances/' + applianceId, 'PUT', { hours: 2 })).status,
      404
    );
    assert.equal((await neighbour.request('/api/appliances/' + applianceId, 'DELETE')).status, 404);
    assert.equal(
      (await owner.request('/api/appliances/' + applianceId, 'PUT', { hours: 4 })).status,
      200
    );
    assert.equal((await owner.request('/api/household')).data.appliances[0].hours, 4);
    assert.deepEqual((await neighbour.request('/api/household')).data.appliances, []);
    assert.equal((await owner.request('/api/appliances/1 OR 1=1', 'DELETE')).status, 400);
  });
  await t.test('meter chronology, duplicate protection and ownership', async () => {
    const first = await owner.request('/api/readings', 'POST', {
      date: '2026-01-01',
      value: 100,
      note: 'Baseline',
    });
    assert.equal(first.status, 201);
    readingId = first.data.id;
    assert.equal(
      (await owner.request('/api/readings', 'POST', { date: '2026-01-03', value: 110 })).status,
      201
    );
    assert.equal(
      (await owner.request('/api/readings', 'POST', { date: '2026-01-02', value: 111 })).status,
      400
    );
    assert.equal(
      (await owner.request('/api/readings', 'POST', { date: '2026-01-02', value: 99 })).status,
      400
    );
    assert.equal(
      (await owner.request('/api/readings', 'POST', { date: '2026-01-01', value: 100 })).status,
      409
    );
    for (const date of ['2099-01-01', '2026-02-30', '1999-01-01'])
      assert.equal(
        (await owner.request('/api/readings', 'POST', { date, value: 120 })).status,
        400
      );
    assert.equal((await neighbour.request('/api/readings/' + readingId, 'DELETE')).status, 404);
    assert.equal((await owner.request('/api/household')).data.readings.length, 2);
  });
  await t.test('bill history validation, persistence and ownership', async () => {
    const bill = { month: '2026-01', units: 180, amount: 6420 };
    const created = await owner.request('/api/bills', 'POST', bill);
    assert.equal(created.status, 201);
    billId = created.data.id;
    assert.equal((await owner.request('/api/bills', 'POST', bill)).status, 409);
    for (const month of ['2026-13', '2099-01', '1999-01'])
      assert.equal((await owner.request('/api/bills', 'POST', { ...bill, month })).status, 400);
    assert.equal(
      (await owner.request('/api/bills', 'POST', { ...bill, month: '2026-02', amount: -1 })).status,
      400
    );
    assert.equal((await neighbour.request('/api/bills/' + billId, 'DELETE')).status, 404);
    assert.equal((await owner.request('/api/household')).data.bills[0].amount, 6420);
  });
  await t.test('profile changes require reauthentication and revoke other sessions', async () => {
    assert.equal(
      (
        await owner.request('/api/users/profile', 'PUT', {
          name: 'My household',
          email: 'new@example.com',
        })
      ).status,
      403
    );
    assert.equal(
      (
        await owner.request('/api/users/profile', 'PUT', {
          name: 'My household',
          email: 'other@example.com',
          current_password: password,
        })
      ).status,
      409
    );
    assert.equal(
      (
        await owner.request('/api/users/profile', 'PUT', {
          name: 'My household',
          email: 'new@example.com',
          current_password: password,
        })
      ).status,
      200
    );
    assert.equal((await secondSession.request('/api/household')).status, 401);
    assert.equal((await owner.request('/api/household')).data.user.name, 'My household');
  });
  await t.test('password changes revoke other sessions and reject old credentials', async () => {
    assert.equal(
      (
        await secondSession.request('/api/auth/login', 'POST', {
          email: 'new@example.com',
          password,
        })
      ).status,
      200
    );
    assert.equal(
      (
        await owner.request('/api/security/password', 'POST', {
          current_password: 'wrong',
          password: password + '-new',
        })
      ).status,
      403
    );
    assert.equal(
      (
        await owner.request('/api/security/password', 'POST', {
          current_password: password,
          password: password + '-new',
        })
      ).status,
      200
    );
    assert.equal((await secondSession.request('/api/household')).status, 401);
    assert.equal(
      (await guest.request('/api/auth/login', 'POST', { email: 'new@example.com', password }))
        .status,
      401
    );
  });
  await t.test('one-time recovery is atomic and revokes existing sessions', async () => {
    const results = await Promise.all([
      guest.request('/api/auth/recover', 'POST', {
        email: 'new@example.com',
        recovery,
        password: password + '-reset',
      }),
      secondSession.request('/api/auth/recover', 'POST', {
        email: 'new@example.com',
        recovery,
        password: password + '-reset',
      }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 401]);
    assert.equal((await owner.request('/api/household')).status, 401);
    assert.equal(
      (
        await owner.request('/api/auth/login', 'POST', {
          email: 'new@example.com',
          password: password + '-reset',
        })
      ).status,
      200
    );
    const rotated = await owner.request('/api/security/recovery', 'POST', {
      current_password: password + '-reset',
    });
    assert.equal(rotated.status, 200);
    assert.equal(rotated.data.recovery.length, 64);
  });
  await t.test(
    'record deletion affects only the authenticated household and logout revokes access',
    async () => {
      assert.equal((await owner.request('/api/appliances/' + applianceId, 'DELETE')).status, 200);
      assert.equal((await owner.request('/api/readings/' + readingId, 'DELETE')).status, 200);
      assert.equal((await owner.request('/api/bills/' + billId, 'DELETE')).status, 200);
      assert.equal((await owner.request('/api/household')).data.readings.length, 1);
      assert.equal(
        (await neighbour.request('/api/household')).data.user.email,
        'other@example.com'
      );
      assert.equal((await owner.request('/api/auth/logout', 'POST')).status, 200);
      assert.equal((await owner.request('/api/household')).status, 401);
    }
  );
  await t.test('idle sessions expire and repeated bad login attempts are limited', async () => {
    await db.run('UPDATE sessions SET last_seen=?', [Date.now() - 1800001]);
    assert.equal((await neighbour.request('/api/household')).status, 401);
    for (let attempt = 0; attempt < 15; attempt++)
      assert.equal(
        (await guest.request('/api/auth/login', 'POST', { email: 'missing@example.com', password }))
          .status,
        401
      );
    assert.equal(
      (await guest.request('/api/auth/login', 'POST', { email: 'missing@example.com', password }))
        .status,
      429
    );
  });
});

test('transactions roll back and do not absorb writes from another request', async () => {
  await db.migrate();
  let release, entered;
  const inside = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const rolledBack = db.transaction(async () => {
    await db.run("INSERT INTO rate_limits VALUES ('rollback-check',1,1)");
    entered();
    await gate;
    throw new Error('Rollback this transaction');
  });
  await inside;
  const otherWrite = db.run("INSERT INTO rate_limits VALUES ('separate-write',1,1)");
  const rejection = assert.rejects(rolledBack, /Rollback this transaction/);
  release();
  await Promise.all([rejection, otherWrite]);
  assert.equal(await db.get("SELECT * FROM rate_limits WHERE key='rollback-check'"), undefined);
  assert.equal((await db.get("SELECT * FROM rate_limits WHERE key='separate-write'")).count, 1);
});
