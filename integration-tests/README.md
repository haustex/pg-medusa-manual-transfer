# Integration tests

End-to-end checks of the plugin in a real Medusa app (`app/`), over HTTP, against Postgres and Redis. Everything
the runs produce (seed ids, logs, e-mails) goes to `integration-tests/.state/` (git-ignored).

| Path | |
| --- | --- |
| `app/` | the test app: `medusa-config.ts` loads the plugin from this repository, the email-preview notification provider, `src/scripts/seed.ts`, `src/scripts/run-mt-job.ts` |
| `setup.mjs` | links `app/node_modules`, (re)creates the database, migrates, seeds, creates the admin user; `--admin` builds the Admin |
| `e2e/run.mjs` | the suite: `shared`, `split` (server 9400 + worker 9401) or `no-credit` (`showCredit: false`) |
| `e2e/phase*.mjs` | checks per phase, sharing `e2e/context.mjs` |
| `ui.mjs` | Admin checks in Chromium: credit footer present / absent, `--shots <prefix>` screenshots, `--emails` e-mail screenshots |
| `storefront.mjs` | the example storefront: the Medusa Next.js Starter at a pinned commit in `.state/nextjs-starter`, reset, set up with `examples/nextjs-starter/install.mjs`, built and served on 9410; guest checkout → instructions → proof upload → admin confirms in the Admin → "paid" page and e-mail, plus the e-mail link, a logged-in customer, the invoice PDF (accented name, read back with pdf.js) and the Admin's e-mail recipients with and without `adminEmails`. `--reuse` keeps the last starter build |
| `browser/` | the scripts that run inside the Playwright container |
| `browser-run.mjs`, `env.mjs`, `processes.mjs` | the Playwright container; paths, ports, environment; starting and stopping medusa |

Every medusa process is started **detached, in its own process group**, and stopped by killing the group:
`scripts/guard.mjs` and its medusa child go together, and a job run through `medusa exec` (its own group, like a
separate worker host) never receives a signal meant for the test server.

## Running

```bash
npm run build                          # the app loads the plugin from .medusa/server
node integration-tests/setup.mjs --fresh   # once, or to start over
npm run test:e2e                       # shared, split and no-credit
node integration-tests/setup.mjs --admin   # after Admin changes, for ui.mjs
node integration-tests/ui.mjs --shots phase4- --emails
node integration-tests/storefront.mjs      # after setup.mjs --admin; screenshots in ~/shots/manual-transfer/storefront
```

The storefront runs at `http://localhost:9410` (not 127.0.0.1: the starter's middleware redirects to the host name
Next.js reports, and the cart cookie follows it). The test app's `notifications.paymentUrl` points there
(`MT_PAYMENT_URL` overrides it); `MT_NO_ADMIN_EMAILS=1` starts it without `adminEmails`. The run tops the test
product's stock up, since every order awaiting payment keeps its reservation.

E-mails sent during a run land in `.state/emails` (set `MT_EMAIL_DIR` to put them elsewhere): one `.html`, `.txt`
and `.json` per e-mail, plus the attachments. `npm run email:preview -- <dir>` renders every template and the
invoice with a made-up order, without the app.

## On the Haus Kayu host

The same machine runs the production store. Every medusa command goes through `scripts/guard.mjs`, which only
allows Postgres `127.0.0.1:55433` and Redis `127.0.0.1:56380` (the `mt-spike-*` containers) and HTTP ports 9400+.
The defaults in `env.mjs` match: database `mt_e2e` in `mt-spike-pg`. Screenshots run in a throwaway
`mt-spike-browser` container from `mcr.microsoft.com/playwright:v1.48.2-jammy` (the host Chromium lacks `libnss3`)
and are written to `~/shots/manual-transfer` (`MT_SHOTS_DIR`).

`MT_E2E_DATABASE_URL`, `MT_E2E_REDIS_URL` and `MT_PG_CONTAINER` (the container `psql` runs in) point the suite at
other services, but `scripts/guard.mjs` still only accepts the ports above: CI (phase 6) needs its own setup.
