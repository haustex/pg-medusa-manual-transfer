# Changelog

All notable changes to `medusa-payment-manual-transfer`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-27

First public release. Works with Medusa `^2.19.0`, tested on 2.19.0 and 2.22.1.

### Payment provider

- Manual bank transfer provider (`pp_manual-transfer_manual-transfer`): placing the order authorizes the payment,
  Medusa creates the order and reserves stock; the payment waits for the buyer's transfer.
- Several bank accounts managed in the Admin (bank, holder, number, SWIFT/BIC, bank address, currency, regions,
  active, order), read from the database on every checkout, so a separate worker sees changes at once.
- Account details copied into each order; re-checked when the order is placed.
- Unique payment reference per order (Crockford base32 with a check character, unique index in the database).
- Payment deadline in business days (default 3) in the store's time zone, skipping holidays.
- Capture only through admin confirmation; Medusa's own Capture is refused.
- Payment data rebuilt from known keys at every step: data a storefront sends is ignored.

### Payment proofs

- JPG / PNG / PDF up to 5 MB, type checked from the file's bytes, stored privately in the database, opened by
  admins through 5-minute signed links.
- Logged-in customers upload from their order; guests with an HMAC upload token (from the e-mail, or traded for the
  cart id right after checkout).
- Rate limits per IP and per order (database-counted). Behind a storefront, the buyer's IP comes from
  `x-mt-client-ip`, trusted only with the shared `trustedProxySecret` in `x-mt-proxy-secret`; otherwise the
  connection's IP counts (X-Forwarded-For is never read).
- Upload again after a rejection or an underpayment; files already sent for another order are flagged.
- Optional retention: proof files deleted N days after the order was paid or canceled.

### Admin

- Verification queue with tabs per status, counts, search and a "Late" badge.
- Order widget: Confirm paid (amount, date, bank reference, shortfall warning), Underpaid (records a partial transfer
  and what is left), Reject (reason required), full history with admin, time and note.
- Settings: bank accounts, store details for e-mails and invoice, e-mail recipients, previews.
- Small plugin credit under the plugin's own pages, off with `showCredit: false`.

### Jobs

- Reminder before the deadline, auto-cancel at the deadline (stock released through Medusa's cancel workflow).
- Admin digest for proofs and underpayments waiting too long.

### E-mails and invoice

- E-mails to the buyer and the admins for every status change, through Medusa's Notification Module; English and
  Indonesian templates, replaceable.
- Pro-forma invoice PDF with embedded Noto Sans (Latin), replaceable layout and font.
- Buyer-facing e-mails, invoice and storefront pages carry the store's identity only.

### Storefront

- Starter-independent core (`src/storefront`: React components, Fetch API helpers, EN/ID labels) and two thin
  examples with an installer each: `examples/nextjs-starter` (Medusa Next.js Starter) and `examples/dtc-starter`
  (Medusa DTC Starter). Payment page with copy buttons, exact amount, reference, countdown, "fees: OUR" note, invoice
  download, proof upload and status.

[0.1.0]: https://github.com/haustex/pg-medusa-manual-transfer/releases/tag/v0.1.0
