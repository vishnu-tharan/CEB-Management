# Folder review and completed improvements

Reviewed the original Express/SQLite backend, authentication, database initialisation, both HTML pages, frontend scripts, stylesheet, dependency manifest/lockfile and run documentation.

| Original issue | Implemented change |
| --- | --- |
| Separate frontend/server setup and hardcoded localhost API URL | One server serves both; relative API URLs; Windows start launcher |
| Predictable fallback JWT secret; browser-stored bearer tokens | Random, hashed, revocable cookie sessions; removed JWT dependency |
| Password could be changed without knowing the current password | Reauthentication, password rules and session revocation |
| Profile changes accepted unvalidated values | Validated email, phone, address, district and account reference; protected email changes |
| HTML interpolation and unsafe avatar URLs | Escaped household text, initials avatar and strict script policy |
| Open cross-origin access and no abuse controls | Origin/Host checks, CSRF tokens, persistent rate limits and body-size limits |
| Database migration races and weak error handling | Awaited migrations, foreign keys, transactions and consistent API errors |
| Mutations reported success even when records did not exist | Ownership-aware updates/deletes, not-found responses and checked frontend requests |
| Hardcoded historical charts, goals, savings and peak figures | Recorded meter intervals, honest estimates and real stored goals |
| Appliance hours of zero were replaced with defaults | Zero is preserved through creation, edits, reloads and calculations |
| Schedules and settings only displayed success toasts | Persisted weekly/overnight plans, preferences and derived reminders |
| Outdated tariff described as latest | Explicit dated PUCSL tariff, itemised calculations and boundary tests |
| Flat EV rates and assumed off-peak discounts | Incremental domestic bill impact with charging efficiency and tariff scope |
| No actual consumption or bill entry | Meter readings, bill records, comparisons and exports |
| Demo reset only cleared browser storage | Explicit account deletion with password and typed confirmation |
| Dense prototype interface and incomplete mobile states | Consistent burgundy/gold/green design, mobile navigation, empty states and dark mode |
| No automated tests | API/security, calculation, migration/restart and desktop/mobile browser suites |

## Validation completed

- 14 passing automated tests, including transaction-safe one-time recovery and cross-user access checks.
- Browser workflows cover all 17 pages at desktop/mobile sizes, saved CRUD workflows, profile/settings, calculations, password change, exports and login/logout.
- Stored HTML injection displayed as harmless text; no browser runtime or CSP errors.
- Legacy schema migrated twice without losing existing records; saved settings verified after reopening the database in a new process.
- Updated dependency lockfile audit reported zero vulnerabilities.
- Desktop/mobile screenshots rendered and visually inspected; small-screen heading and currency layouts adjusted.

## Deliberate boundaries

The local app is usable without a paid service or API key. It does not pretend to have official utility access, smart-meter readings, remote device control, delivered email/push notifications or payment processing. Those require real service agreements, adapters and operational testing. Email is a login identifier, not a verified contact channel. Sinhala/Tamil UI translation and time-of-use/variable-period tariffs remain future extensions. The tariff is explicitly dated rather than silently claimed to remain current.

Existing household data is preserved. Tests create isolated databases and synthetic users; test examples are not inserted into the user's real household database. See README for startup, backup, deployment settings and security limitations.
