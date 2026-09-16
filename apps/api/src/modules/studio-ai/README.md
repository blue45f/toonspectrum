# Studio AI usage ledger and distributed quota

The server-backed Studio AI path is fail-closed and uses PostgreSQL as the
cross-instance quota authority.

## Automatic free provider routing

Production text AI is free-first and fail-closed. The default automatic external pool order is:

1. Gemini free tier;
2. Qwen China (Beijing) with Free Quota Only;
3. Groq free tier;
4. SambaNova Free Tier;
5. Z.AI free Flash;
6. Mistral Free mode;
7. Cloudflare Workers AI on Workers Free;
8. OpenRouter free router;
9. SiliconFlow free text model.

`STUDIO_AI_FREE_PROVIDER_ORDER` may reorder only those reviewed external providers. A
provider is eligible only when the shared pool is enabled, its server-side key
is present, and its matching `STUDIO_AI_FREE_*_CONFIRMED=true` approval is present.
Qwen is additionally locked to a Beijing workspace, a reviewed free-quota model,
and an operator-confirmed Free Quota Only setting. Z.AI and SiliconFlow accept
only exact free-model allowlists. Cloudflare accepts only reviewed Workers Free
models, and OpenRouter accepts only `openrouter/free` or `:free` models. SambaNova
approval asserts that no payment method is linked; Mistral approval asserts
cardless Free mode with Pay-as-you-go disabled. Local LLM, self-hosted runtimes,
and batch APIs are intentionally excluded from automatic routing.

The confirmation flag is a deployment assertion that billing is disabled or a
provider-side hard free-only boundary exists. It is not an automatic billing
inspection. Credentials remain server-side and must never use a `VITE_`
variable.

The server advances to the next shared provider only when `402`, `429`, Qwen
`403/AllocationQuota.FreeTierOnly`, or Cloudflare `403/5035` definitively rejects
the request before inference because the current free route cannot accept more work. Network errors, timeouts, `5xx`, malformed
success responses, authentication errors, and post-acceptance failures are not
replayed elsewhere. This avoids duplicate inference after an ambiguous outcome.

When every shared route is unavailable because of a free-capacity or request
limit, the browser tries only the user's policy-validated external personal free
connections in deterministic quality order. Local LLM, self-hosted and batch
connections are not selected automatically. If no external free route can run,
the client directs the user to `/settings/ai` to add a reviewed personal free key
and otherwise leaves the feature unavailable. It never selects a paid model or
silently enables billing.

Shared providers are text-only. Image, video, and 3D generation remain local,
self-hosted, or explicitly configured personal integrations.

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

1. Before an external request, one short PostgreSQL transaction reserves the
   request and a conservative token upper bound in both the global UTC-day row
   and the `(user, UTC day)` row. The global row is always locked first, making
   service-wide and per-user admission atomic across all API instances.
2. No database transaction remains open during an external provider HTTP request.
3. A short transaction releases both reservations, charges returned token
   usage to both quota rows, and inserts the terminal ledger event together.
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

### Legacy billing-only provider failover

The following compatibility behavior applies only to the retired paid-provider
regression path used by tests and older deployments. Production free-pool mode
ignores those legacy credentials.

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

Defaults are 200 requests and 1,000,000 reserved/consumed tokens per user, with
a service-wide ceiling of 500 requests and 2,000,000 tokens per UTC day.
Override them with `STUDIO_AI_DAILY_REQUEST_LIMIT`,
`STUDIO_AI_DAILY_TOKEN_LIMIT`, `STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT`, and
`STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT`.

Apply the production migration manifest through
`apps/api/src/db/migrations/0060_studio_ai_free_provider_expansion.sql` before
deploying this API build. Migration `0056` establishes the original three-provider free-pool contract;
migration `0059` expands the external-only pool to nine attempts and admits Qwen,
SambaNova, Z.AI free Flash, Mistral, Cloudflare Workers AI, and SiliconFlow ledger
values. Local LLM, self-hosted and batch execution are not automatic routes. The schema preflight
rejects an incomplete contract, and quota/admission storage failures return a
sanitized error before provider use.
