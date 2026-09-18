# ToonSpectrum operating-cost supporter center

## Purpose

`/support-us` exists so people can voluntarily help the developer keep ToonSpectrum free.
It is intentionally separated from the existing customer-support route (`/support`) and from creator settlement or business sponsorship.

The public page has three clear boundaries:

1. **Operating-cost support** — optional one-time support for the developer and site infrastructure.
2. **Business sponsorship** — routed to `/business?type=sponsorship` when a company expects advertising, deliverables, joint projects, or other consideration.
3. **Tax-deductible/public-interest donation** — not offered. The site must not promise a statutory donation receipt or tax deduction through this flow.

Supporting ToonSpectrum does not unlock features, change an account tier, provide preferential exposure, create equity/revenue rights, or purchase a membership.
Core service access remains independent of support.

## Payment architecture

The checkout uses Toss Payments SDK v2 in the browser and Toss Core API on the server.

1. The browser fetches `/api/supporter-payments/config`.
2. The server exposes only the matching Toss **client key** when checkout is explicitly enabled.
3. The browser sends the amount/privacy choices to `/api/supporter-payments/orders`.
4. The server validates the amount and writes the order ledger before checkout is rendered.
5. Toss Payments authenticates the payment method.
6. The success redirect returns `paymentKey`, `orderId`, and `amount`.
7. `/api/supporter-payments/confirm` loads the stored order and confirms using the **stored amount**.
8. The server calls `POST /v1/payments/confirm` with the secret key and an idempotency key.
9. Webhooks never become trusted payment state by themselves. The server retrieves the payment from Toss and reconciles the verified response.
10. Operators can explicitly re-sync a ledger row with Toss before refund or incident handling.

The browser never receives the secret key. ToonSpectrum never stores card numbers, bank authentication credentials, or virtual-account refund account data.

## Privacy and public supporter wall

The default is anonymous. A supporter can explicitly choose to publish a display name.
Even after choosing a public name, the amount and message each require a separate opt-in.

The public supporter-wall endpoint never returns `paymentKey`, `orderId`, receipt URLs, internal row IDs, cancel reasons, or operator metadata.

The monthly operating-cost progress is aggregate data only. Administrators can change the monthly goal or disable the public wall without disabling payment processing.

## Database and runtime permissions

Migration `0071_supporter_payments.sql` creates:

- `supporter_payment` — payment lifecycle, privacy choices, receipt URL, and idempotency metadata;
- `supporter_funding_setting` — monthly goal and public-wall switch.

`PUBLIC` receives no table privileges. The managed API runtime role receives:

- `supporter_payment`: `SELECT`, `INSERT`, `UPDATE`;
- `supporter_funding_setting`: `SELECT`, `UPDATE`.

The runtime role does not receive `DELETE`, `TRUNCATE`, `REFERENCES`, or `TRIGGER` privileges for these tables.

## Safe configuration

Start with matching Toss test keys:

```dotenv
SUPPORTER_PAYMENTS_ENABLED=false
TOSS_PAYMENTS_CLIENT_KEY=
TOSS_PAYMENTS_SECRET_KEY=
TOSS_PAYMENTS_API_BASE_URL=https://api.tosspayments.com
PRODUCTION_INTEGRATION_COST_POLICY=zero-cost-only
PRODUCTION_TOSS_ALLOW_LIVE=false
```

Test keys must both be test-mode keys. Test payments do not create real charges.

Live checkout is fail-closed. It requires matching live keys, the supporter enable switch, explicit-cost policy, and the live-payment allow switch.

## Production activation checklist

Before enabling live payments:

- apply managed migration `0069` and runtime ACLs;
- finish the Toss Payments merchant/PG onboarding required for live keys and settlement;
- register the Toss webhook URL as `/api/supporter-payments/webhooks/toss`;
- verify the public merchant/operator disclosures required for the actual business;
- review refund, cancellation, receipt, tax/accounting, and settlement handling with the final merchant setup;
- run a test-key end-to-end payment, webhook, re-sync, receipt, and cancellation exercise;
- deploy the code with live payment switches still disabled;
- enable live payment only as a separate explicit production change.

## Refund behavior

The admin ledger supports full cancellation for payment states that Toss can cancel without collecting additional sensitive data. Cancellation requests include an idempotency key.

An already-deposited virtual-account payment is intentionally not auto-refunded from ToonSpectrum because Toss requires refund-account handling. Operators are directed to the Toss payment manager for that case, so the application does not collect or store bank refund credentials.

## Tax and terminology boundary

Product copy uses **operating-cost support / 후원** as the primary term.
It does not describe this flow as a tax-deductible statutory donation and does not promise donation receipts.
Any tax, accounting, cash-receipt, or business-registration obligations for real receipts still depend on the actual operator/merchant setup and should be reviewed before live activation.

## Deliberately excluded

- recurring billing or supporter subscriptions;
- feature-gated supporter tiers;
- internal wallet/stored value;
- securities/equity or promised returns;
- creator-to-creator payout and settlement;
- statutory donation receipts or charitable fundraising claims;
- collection of card numbers, bank-authentication credentials, or virtual-account refund credentials.

## Creator support program

`/support-creators` is a separate support path for students, amateurs, and emerging creators.
It supports more than money: approved projects can request mentoring, equipment, software licenses,
portfolio feedback, collaboration, work/contest opportunities, and business sponsorship.

Applications are private until an operator approves them. Public project responses intentionally
exclude applicant email, phone, settlement account, guardian contact, and payout credentials.
Support offers are private messages delivered only to the creator/operator workflow.

For minors, the application contract is fail-closed:
- ages 14–18 require guardian confirmation before submission;
- under-14 creators must be submitted by a guardian with guardian confirmation;
- public monetary support must remain disabled until guardian/KYC and payout readiness are reviewed.

Migration `0072_creator_support_program.sql` creates private application and support-offer ledgers.
The API runtime role receives bounded SELECT/INSERT/UPDATE privileges and no destructive table
permissions.

### Creator monetary payout boundary

This PR does not implement a platform wallet or silently re-distribute supporter money.
Creator monetary support is only a readiness flag. The server refuses to enable it unless
`CREATOR_SUPPORT_PAYOUTS_ENABLED=true`, an eligible Toss payment secret is configured,
a 64-hex payout security key is present, and the explicit-cost policy is enabled.

Before a real creator payout button is added, complete the separate Toss Payouts contract,
seller registration/KYC, guardian handling for minors, JWE encryption, payout webhooks,
accounting/tax review, dispute/refund policy, and end-to-end payout reconciliation.
