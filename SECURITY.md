# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately:

- through GitHub: **Security → Report a vulnerability** on
  [haustex/pg-medusa-manual-transfer](https://github.com/haustex/pg-medusa-manual-transfer/security), or
- by e-mail to [dev@hauskayu.com](mailto:dev@hauskayu.com), subject "Security: PG Medusa Transfer Manual".

Include the plugin and Medusa versions, what an attacker can do, and steps to reproduce. We will confirm that we
received the report, keep you updated while we fix it, and credit you in the release notes if you wish.

## Scope

Of particular interest:

- access to another order's payment instructions, proofs or invoice (upload tokens, customer checks);
- reading a payment proof without a valid signed link;
- marking a payment as paid or captured without an admin confirmation;
- bypassing the upload limits (file type, size, per-IP, per-order), including forged client-IP headers;
- content injection in e-mails or the invoice.

## Operating the plugin safely

- Set `MANUAL_TRANSFER_SECRET` (or the `secret` option) to a random value of its own: `openssl rand -hex 32`.
- If the storefront sends the buyer's IP, set `trustedProxySecret` to another random value and keep it on the
  storefront's server only (never in a `NEXT_PUBLIC_*` variable).
- Always check the bank statement before confirming a payment. A proof image is never proof of payment.
