# Studio AI usage ledger and distributed quota

The server-backed Studio AI path is fail-closed and uses PostgreSQL as the
cross-instance quota authority.

## Privacy contract

`studio_ai_usage_ledger` stores only:

- authenticated user ID;
- allowlisted task and the server-selected model;
- one terminal status (`success`, `client_aborted`, `timeout`,
  `provider_rate_limited`, `provider_error`, `network_error`, or
  `content_filtered`);
- provider-returned prompt/completion/total token counts, when present; and
- start, finish, and insertion timestamps.

It never stores prompt or response text, API keys, authorization headers,
provider error bodies, client IPs, or the provider-facing pseudonymous user ID.

## Atomic quota flow

1. Before an external request, one conditional PostgreSQL
   `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE ... RETURNING` reserves the
   request and a conservative token upper bound in the `(user, UTC day)` row.
   PostgreSQL row locking makes this atomic across all API instances.
2. No database transaction remains open during a Z.ai or DeepSeek HTTP request.
3. A short transaction releases the reservation, charges returned token usage,
   and inserts the terminal ledger event together.
4. The UTC day comes from the PostgreSQL clock, not an API instance clock. A
   request that crosses midnight settles against the day on which it reserved.

The reservation uses prompt UTF-8 bytes, maximum task completion tokens, and a
fixed chat-envelope allowance. If total usage is absent, complete
prompt+completion counts are used for quota accounting. If usage is absent or
partial, the full reservation is charged while all unreturned ledger token
columns remain `NULL`; estimated values are never presented as provider facts.

## Failure behavior

- Admission query failure: return sanitized `503`; do not call any AI provider.
- Conditional quota denial: return `429`; do not call any AI provider.
- Finalization or ledger insert failure: roll back, return sanitized `503`, and
  do not return the generated response.
- Process loss after admission: the request and reservation remain charged for
  that UTC day. This intentionally favors budget safety over availability and
  automatically stops affecting admission after the next UTC boundary.

### Billing-only provider failover

The service may send the prompt to the next configured provider only when the
first provider gives a documented, machine-verifiable rejection that happens
before inference because the server account cannot pay for the request:

- [DeepSeek HTTP `402`](https://api-docs.deepseek.com/quick_start/error_codes)
  (`Insufficient Balance`); or
- [Z.ai HTTP `429`](https://docs.z.ai/api-reference/api-code) with business
  code `1113`, `1304`, `1308`, `1309`, or `1310`
  (account balance or purchased package quota exhausted/expired).

This applies to both `provider: "auto"` and an explicitly preferred configured
provider. A successful fallback keeps top-level `provider` and `model` set to
the provider that actually generated the answer and adds only this sanitized
metadata:

```json
{
  "failover": {
    "attemptedProvider": "zai",
    "attemptedModel": "glm-5.1",
    "actualProvider": "deepseek",
    "actualModel": "deepseek-v4-flash",
    "reason": "billing_quota_exhausted"
  }
}
```

Generic HTTP `429` rate/concurrency limits, Z.ai codes `1302`, `1303`, `1305`
and `1312`, authentication failures, `5xx`, network failures, timeouts, invalid
responses, and post-`200` generation failures are never replayed to another
provider. Those cases may be ambiguous or may already have incurred cost, so a
retry could duplicate billing. Provider error bodies and business messages are
used transiently for the allowlist check and are never returned, logged, or
written to the usage ledger.

Defaults are 200 requests and 1,000,000 reserved/consumed tokens per user per
UTC day. Override them with `STUDIO_AI_DAILY_REQUEST_LIMIT` and
`STUDIO_AI_DAILY_TOKEN_LIMIT`.

Apply `lib/db/migrations/0001_studio_ai_usage_ledger.sql` (or the equivalent
`drizzle-kit push`) before deploying the quota-enforcing API build. If the
tables are missing, Studio AI safely returns `503`.
