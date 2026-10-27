# Contributing

Thank you for helping! Bug reports, fixes and translations are welcome. For larger changes please open an issue
first, so we can agree on the approach.

## Setup

Node.js 20.19+ or 22.12+, Docker (for Postgres, Redis and the browser checks).

```bash
npm ci
npm run build
```

## Checks

Every pull request runs these in CI, against Medusa 2.19.0 and 2.22.1:

```bash
npm run lint
npm run typecheck        # the plugin and the storefront core (src/storefront)
npm run test:unit
npm run build
npm run pack:check       # npm pack --dry-run must stay clean
```

To try another Medusa release locally: `node scripts/use-medusa.mjs 2.22.1` (not saved; `npm ci` goes back).

## End-to-end tests

The E2E suite runs the plugin in a real Medusa app (`integration-tests/app`). It expects Postgres on
`127.0.0.1:55433` and Redis on `127.0.0.1:56380`, in containers named `mt-spike-pg` and `mt-spike-redis`:

```bash
docker run -d --name mt-spike-pg -e POSTGRES_PASSWORD=spike -p 127.0.0.1:55433:5432 postgres:17-alpine
docker run -d --name mt-spike-redis -p 127.0.0.1:56380:6379 redis:7-alpine

node integration-tests/setup.mjs --fresh
npm run test:e2e                              # shared, split (server + worker), no-credit
node integration-tests/setup.mjs --admin      # Admin build, for the browser checks
node integration-tests/ui.mjs                 # Admin pages in Chromium (Playwright container)
node integration-tests/storefront.mjs all     # both example storefronts, checkout to "paid"
```

Every medusa command goes through `scripts/guard.mjs`, which refuses any other database, Redis or a port below 9400.
That is deliberate: the maintainers' machine also runs a production store. More in
[integration-tests/README.md](integration-tests/README.md).

## Guidelines

- Keep buyer-facing output (storefront pages, e-mails, invoice) free of any plugin or Haus Kayu branding: it shows
  the store's identity only. `npm run pack:check` checks this.
- No tracking, no requests to third-party services from the plugin.
- Never commit secrets, `.env` files or real bank account numbers; use made-up data in tests.
- Workflow and step ids start with `manual-transfer-`.
- Texts come in English and Indonesian (`src/admin/i18n`, `src/lib/notifications/templates.ts`,
  `src/storefront/labels.ts`).
- Add a line to `CHANGELOG.md` under "Unreleased".

By contributing you agree that your contribution is licensed under the MIT License.
