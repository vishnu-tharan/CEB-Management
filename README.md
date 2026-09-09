# CEB Energy Saver

A self-hosted household electricity planner for Sri Lanka. Express serves the interface and API together; SQLite stores each household’s data. This is an independent project, not an official CEB service.

## Run

Requires Node.js 22 or newer.

```powershell
cd backend
npm ci
npm start
```

Open **http://localhost:3000**. There is no separate frontend server or build step. On this computer the dependencies are already installed: double-click `start.cmd`, or run `node backend/server.js` from the project folder. If port 3000 is occupied, stop the earlier server or set `PORT` to another free port.

The installed npm launcher on this computer points to a missing roaming installation. If `npm` reports `Cannot find module ...npm-cli.js`, use the working Node installation directly:

```powershell
node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" ci --prefix backend
node backend/server.js
```

Create an account and save the recovery code displayed during registration. Existing accounts and appliances are preserved by additive database migrations. Old browser tokens are intentionally invalidated; sign in again. Existing users can generate a recovery code in Security using their current password.

## First household setup

1. Open My profile and add a phone number, district, address and optional 10-digit electricity account reference.
2. Add your appliances, rated power and effective daily operating hours. A cycling refrigerator does not draw its rated power continuously for 24 hours.
3. Record the cumulative number shown on your meter. A second reading on another date unlocks measured consumption intervals.
4. Save your monthly energy target and budget in Saving goals.
5. Record actual bills, explore scenarios, and save weekly usage plans.

## Working features

- Account registration, login, logout, password change, one-time recovery and account deletion.
- Editable profile and email, Sri Lankan phone validation, all 25 district options and optional account reference.
- Appliance creation, editing, deletion, room/search filters and manual usage state.
- Cumulative meter history with chronological validation, duplicate protection and CSV export.
- Meter-derived charts and weighted forecasts; appliance estimates are clearly identified.
- Persistent energy targets, budgets, alert preferences and derived household suggestions.
- Itemised bill estimator, actual monthly bill history and comparison.
- What-if appliance simulator, solar-yield scenario and EV charging-loss/cost calculations.
- Persistent weekly and overnight usage plans with in-app active-window reminders.
- Session overview, recent security events, sign-out-other-sessions, JSON data export.
- Responsive mobile navigation, keyboard-accessible forms/dialogs, dark mode and local-only assets.

## Calculation scope

The bundled bill model uses the **30-day domestic block tariff effective 11 May 2026**, from [PUCSL Annex 2](https://www.pucsl.gov.lk/wp-content/uploads/2026/05/Annex-2-Approved-Tariff-Tabel_May-2026.pdf). It handles the different treatment of earlier units when consumption exceeds 60 or 180 kWh. Zero use still includes a fixed charge. Boundary examples are tested.

Rates are a dated snapshot, not an automatically updated tariff feed. Other billing lengths, tariff revisions, taxes, arrears, rebates, solar credits, dedicated EV supplies and time-of-use tariffs need separate treatment. Use the [official PUCSL calculator](https://www.pucsl.gov.lk/calculator/) for an applicable billing period. Update `frontend/energy.js` and its boundary tests when adopting a new tariff.

The forecast uses the last seven recorded meter intervals (weighted by days), or appliance watts × effective hours when there are fewer than two readings. It projects a consistent 30-day period, not a particular utility billing cycle. Historical charts contain only recorded intervals.

Solar inputs are editable scenario assumptions, not a site assessment. EV estimates add a single charging session, including chosen losses, to the base domestic consumption. Switching a plan to a different time does not automatically reduce a block-tariff bill.

## Security and operations

- Passwords are bcrypt-hashed at cost 12; new passwords require at least 12 characters and at most 72 UTF-8 bytes.
- Random session credentials are stored in HttpOnly, SameSite=Strict cookies. Only SHA-256 session digests are stored in SQLite. No bearer tokens in localStorage and no fallback signing secret.
- Sessions expire after 30 minutes of API inactivity or 12 hours total. Password changes and recovery revoke prior sessions; email changes revoke other sessions.
- State changes require a same-origin custom request header and authenticated CSRF token. Unexpected Host headers and cross-site origins are rejected. No permissive CORS.
- Login/account recovery and sensitive operations have persistent rate limits. JSON bodies are limited to 32 KB. Inputs are validated server-side, queries are parameterised, and every household query is scoped to the signed-in user.
- Strict content security policy, anti-framing headers, escaped dynamic content and no third-party frontend scripts/fonts. Profile images use initials instead of untrusted image URLs.
- Database migrations complete before requests are served; foreign keys are enabled. Multi-statement changes use serialised transactions. Recovery code consumption is atomic.
- Recovery codes are random 256-bit secrets stored only as digests and rotated after use. No email service is needed for this recovery flow.

Copy `backend/.env.example` to `backend/.env` for configuration. `HOST` defaults to loopback. For public hosting, put the app behind an HTTPS reverse proxy and set `NODE_ENV=production` and `APP_ORIGIN=https://your-domain`. Production uses Secure `__Host-` cookies and HSTS; it refuses to start without an HTTPS origin. The proxy must preserve the configured Host. Proxy forwarding headers are not blindly trusted: IP limits may be shared behind a proxy, so configure an appropriate gateway rate policy before public use.

The SQLite database is **not encrypted at rest**. Restrict access to the server account, protect its disk and backups, and use full-disk encryption as appropriate. Keep the database outside the static frontend folder. For a safe backup, stop the server, copy the database and any remaining WAL/SHM sidecars together, and restart; alternatively use SQLite’s online backup facility. Test restoration before relying on backups. Do not publish `.env`, database files or exports.

This is a tested local application, not a claim of audited production security. Real utility account verification, payments, smart-meter integrations, remote switching, email verification, email/push delivery and full Sinhala/Tamil interface translations are not connected. Schedules work as saved plans and reminders while the app is open. Legacy sample alerts are visibly labelled; no sample data is silently added to new accounts.

## Verification

```powershell
node --test backend/test/app.test.js backend/test/migration.test.js
```

The API suite uses an isolated in-memory database; migration/restart tests use a disposable temporary database. It covers tariff boundaries, invalid input, household isolation, CSRF, malicious origins/hosts, chronological readings, persisted settings/plans, password changes, concurrent recovery, deletion and session expiry.

Optional browser suite (Playwright): install Playwright in a development environment, install its Chromium browser, then run `node backend/test/browser.cjs`. It uses an isolated in-memory app and produces screenshots under `artifacts/`. `PLAYWRIGHT_MODULE_PATH` can select an existing installation and `BROWSER_CHANNEL=msedge` can use installed Edge. It exercises registration, saved workflows, calculations, XSS rendering, password changes, login/logout, all 17 screens at desktop/mobile sizes, dark mode and console/CSP errors.

Dependency audit on 9 September 2026: **0 reported vulnerabilities** in the updated lockfile. Re-run `npm audit --omit=dev` periodically; this does not replace application security review.