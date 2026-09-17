# ToonSpectrum supporter center

## Product boundary

`/support-us` separates three activities that must not be presented as the same thing:

1. **Individual supporter payment** — paid support for the ToonSpectrum service/creator environment.
2. **Business sponsorship** — routed to the existing private `/business?type=sponsorship` intake.
3. **Public-interest donation** — not collected by this implementation. Tax-deductible donation or public fundraising requires a separate legal/accounting/receipt path before it can be enabled.

The existing `/support` route remains the customer support center and is intentionally not reused for payments.

## Checkout safety model

The browser never receives a payment secret and ToonSpectrum does not render card-number, bank-authentication, or wallet-balance fields. The public page can only navigate to a provider-hosted checkout after both build variables are explicitly configured:

```dotenv
VITE_SUPPORTER_HOSTED_CHECKOUT_ENABLED=true
VITE_SUPPORTER_HOSTED_CHECKOUT_URL=https://<provider-hosted-checkout>
```

The resolver fails closed when the enable flag is absent, the URL is absent or malformed, the scheme is not HTTPS, or URL userinfo is present. `VITE_*` values are public build configuration and must never contain API secrets.

## Production activation checklist

Before changing the enable flag to `true`:

- create the real supporter product in the selected payment provider;
- ensure the hosted checkout shows the merchant/seller information required for the operating business;
- finalize price, benefits, billing interval (if recurring), cancellation, and refund terms;
- verify the success/cancel experience and provider receipts;
- confirm the payment provider account and settlement destination are production-ready;
- review the Terms/Privacy disclosures for the final product behavior;
- perform an explicit production-payment approval separate from code merge or deployment approval.

No production deployment or payment activation is implied by the feature PR.

## Deliberately excluded

- securities/equity subscription or investment checkout;
- promised returns or investment amount collection;
- tax-deductible donation receipts;
- public charitable fundraising collection;
- ToonSpectrum-held user wallet balances;
- creator payout/settlement routing.

Creator-to-creator support can reuse the provider-adapter principle later, but should get its own payout, settlement, tax, moderation, and refund design rather than being grafted onto this service-support page.
