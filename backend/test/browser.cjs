// Optional end-to-end check. Supply Playwright through PLAYWRIGHT_MODULE_PATH or a local install.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const { app } = require('../server');
const db = require('../db');
const output = path.resolve(
  __dirname,
  process.env.UPDATE_SCREENSHOTS === '1' ? '../../docs/screenshots' : '../../artifacts'
);
const password = 'Example-household-passphrase-2026';

(async () => {
  await db.migrate();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('requestfailed', (request) =>
      console.error('Request failed:', request.url(), request.failure()?.errorText)
    );
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error('Browser error:', error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('dialog', (dialog) => dialog.accept());
    fs.mkdirSync(output, { recursive: true });
    async function capture(name) {
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#toast').evaluate((element) => element.classList.remove('show'));
      await page.screenshot({
        path: path.join(output, name + '.jpg'),
        fullPage: false,
        animations: 'disabled',
      });
    }
    async function go(id) {
      await page.goto(base + '/#' + id);
      await page.locator('#content h1').waitFor();
      assert.equal(await page.locator('#content h1').count(), 1);
    }
    await page.goto(base + '/login.html');
    await capture('sign-in-desktop');
    await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Example Household');
    await page.getByLabel('Email address', { exact: true }).fill('household@example.com');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account →', exact: true }).click();
    await page.getByRole('button', { name: 'I have saved my code', exact: true }).waitFor();
    assert.equal((await page.locator('#recoveryCode').textContent()).length, 64);
    await page.getByRole('button', { name: 'I have saved my code', exact: true }).click();
    await page.getByRole('heading', { name: 'Your home, in balance.', exact: true }).waitFor();
    assert.match(await page.locator('#content').innerText(), /Example Household/);
    await go('appliances');
    for (const [name, room, watts, hours] of [
      ['Refrigerator', 'Kitchen', 150, 8],
      ['Ceiling fan', 'Living room', 75, 8],
      ['Air conditioner', 'Bedroom', 1200, 3],
      ['Washing machine', 'Laundry', 500, 0.8],
      ['Laptop', 'Study', 65, 6],
      ['LED lighting', 'Living room', 45, 5],
    ]) {
      await page.getByRole('button', { name: '+ Add appliance', exact: true }).click();
      await page.getByLabel('Appliance name', { exact: true }).fill(name);
      await page.getByLabel('Room', { exact: true }).fill(room);
      await page.getByLabel('Rated power (watts)', { exact: true }).fill(String(watts));
      await page.getByLabel('Effective daily use (hours)', { exact: true }).fill(String(hours));
      await page.getByRole('button', { name: 'Add appliance', exact: true }).click();
      await page.getByRole('heading', { name, exact: true }).waitFor();
    }
    await page.getByLabel('Search appliances').fill('refrigerator');
    assert.equal(await page.locator('.appliance-card').count(), 1);
    await page.getByLabel('Search appliances').fill('');
    const fan = page
      .locator('.appliance-card')
      .filter({ has: page.getByRole('heading', { name: 'Ceiling fan', exact: true }) });
    await fan.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Effective daily use (hours)').fill('0');
    await page.getByRole('button', { name: 'Save appliance', exact: true }).click();
    await page.locator('#modal').waitFor({ state: 'hidden' });
    await page.reload();
    await page.getByRole('heading', { name: 'Ceiling fan', exact: true }).waitFor();
    assert.match(await fan.innerText(), /0 h/);
    await capture('appliances-desktop');
    await go('readings');
    for (let i = 0; i < 8; i++) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - 16 + i * 2);
      const value = date.toISOString().slice(0, 10);
      await page.getByLabel('Reading date', { exact: true }).fill(value);
      await page
        .getByLabel('Cumulative meter value (kWh)', { exact: true })
        .fill(String(12500 + [0, 12, 23, 36, 47, 59, 70, 81][i]));
      await page.getByRole('button', { name: 'Save reading', exact: true }).click();
      await page.getByRole('cell', { name: value, exact: true }).waitFor();
    }
    await page.locator('#toast').evaluate((element) => element.classList.remove('show'));
    await capture('meter-readings-desktop');
    await go('bills');
    await page.getByLabel('Billing month', { exact: true }).fill('2026-01');
    await page.getByLabel('Billed consumption (kWh)', { exact: true }).fill('180');
    await page.getByLabel('Actual bill amount (LKR)', { exact: true }).fill('6420');
    await page.getByRole('button', { name: 'Save bill', exact: true }).click();
    await page.getByRole('cell', { name: '2026-01', exact: true }).waitFor();
    await go('bill');
    await page.getByLabel('Expected 30-day consumption (kWh)', { exact: true }).fill('180');
    await page.getByRole('button', { name: 'Calculate estimate', exact: true }).click();
    assert.match(await page.locator('#billOutput').innerText(), /6,420/);
    await capture('bill-estimator-desktop');
    // A stored HTML string must appear as text, never as an executable image element.
    await go('appliances');
    await page.getByRole('button', { name: '+ Add appliance', exact: true }).click();
    await page.getByLabel('Appliance name', { exact: true }).fill('<img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'Add appliance', exact: true }).click();
    const payload = page.locator('.appliance-card').filter({
      has: page.getByRole('heading', { name: '<img src=x onerror=alert(1)>', exact: true }),
    });
    await payload.waitFor();
    assert.equal(await payload.locator('img').count(), 0);
    await payload.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Delete appliance', exact: true }).click();
    await payload.waitFor({ state: 'detached' });
    const pages = [
      'dashboard',
      'appliances',
      'readings',
      'usage',
      'bill',
      'bills',
      'profile',
      'security',
    ];
    for (const id of pages) await go(id);
    await go('dashboard');
    assert.equal(await page.locator('#nav a').count(), 8);
    await capture('dashboard-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of pages) {
      await go(id);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Mobile overflow: ' + id
      );
    }
    await go('dashboard');
    await capture('dashboard-mobile');
    await page.getByRole('button', { name: 'Switch colour theme', exact: true }).click();
    await capture('dashboard-mobile-dark');
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('link', { name: 'My profile', exact: true }).click();
    await page.getByLabel('Full name', { exact: true }).waitFor();
    assert.equal(await page.locator('#scrim').isVisible(), false);
    await page.getByLabel('Full name', { exact: true }).fill('Updated Household');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.reload();
    await page.getByLabel('Full name', { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Full name', { exact: true }).inputValue(),
      'Updated Household'
    );
    await go('security');
    const passwordForm = page.locator('form[data-form=password]');
    await passwordForm.getByLabel('Current password', { exact: true }).fill(password);
    await passwordForm.getByLabel('New password', { exact: true }).fill(password + '-new');
    await passwordForm.getByLabel('Confirm new password', { exact: true }).fill(password + '-new');
    await passwordForm.getByRole('button', { name: 'Update password', exact: true }).click();
    await page.locator('#toast.show').waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill('household@example.com');
    await page.getByLabel('Password', { exact: true }).fill(password + '-new');
    await page.getByRole('button', { name: 'Sign in →', exact: true }).click();
    await page.getByRole('heading', { name: 'Your home, in balance.', exact: true }).waitFor();
    assert.match(await page.locator('#content').innerText(), /Updated Household/);
    assert.deepEqual(errors, [], 'Browser, resource and CSP errors');
    console.log(
      'PASS: registration, login/logout, appliance CRUD/XSS, readings, bill history, bill estimate, profile, password change, eight desktop/mobile pages, dark mode and seven screenshots.'
    );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
