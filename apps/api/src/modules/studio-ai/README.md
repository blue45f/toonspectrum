# Studio AI cloud routing, usage ledger, and distributed quota

The server-backed Studio AI path is cloud-only, free-first, and fail-closed. PostgreSQL is the cross-instance quota authority. Local LLMs, localhost/private-network runtimes, browser model downloads, and self-hosted GPU inference are not supported AI execution paths.

## Shared automatic free pool

The deployment default order is:

1. Gemini free tier
2. Qwen China (Beijing) Free Quota Only
3. Groq free tier
4. SambaNova Free Tier
5. Z.AI free Flash
6. Mistral Free mode
7. Cloudflare Workers AI on Workers Free
8. OpenRouter free router
9. SiliconFlow free text model

`STUDIO_AI_FREE_PROVIDER_ORDER` defines the deployment order. A request may provide `providerOrder`, a schema-validated, duplicate-free list of reviewed free providers. The request order is applied first and the deployment/default order fills missing entries.

A provider is eligible only when the shared pool is enabled, its server-side key is present, and its matching `STUDIO_AI_FREE_*_CONFIRMED=true` approval exists. Qwen is locked to a Beijing workspace and reviewed free models. Z.AI, Cloudflare, OpenRouter, and SiliconFlow use exact free-model allowlists. SambaNova approval means no payment method is linked; Mistral approval means cardless Free mode with Pay-as-you-go disabled.

Confirmation flags are deployment approvals, not automatic billing inspection. Shared credentials remain server-side and must never use a `VITE_` variable.

## Safe provider advance

The server advances only after a machine-verifiable, pre-inference rejection:

- HTTP `402` or `429`;
- Qwen `403/AllocationQuota.FreeTierOnly`;
- Cloudflare `403/5035`;
- allowlisted provider business codes that represent free/billing quota exhaustion.

Network errors, timeouts, `5xx`, malformed success responses, authentication errors, and post-acceptance failures are not replayed. This avoids duplicate inference and duplicate charges after an ambiguous outcome.

## Personal cloud routes

The browser-owned unified settings can define multiple keys and multiple models per cloud connection, with connection/model/key priorities and exact manual assignments. The server shared pool remains keyless to the end user. Personal paid BYOK is disabled from automatic fallback by default and requires explicit user consent.

All personal endpoints must be public HTTPS endpoints. Localhost, private networks, URL credentials, query strings, fragments, and the application’s own origin are rejected by the browser policy.

## Managed cloud media inference

Server media jobs use:

```text
STUDIO_MEDIA_CLOUD_API_URL=https://managed-runtime.example.com
STUDIO_MEDIA_CLOUD_API_TOKEN=server-side-secret
```

`STUDIO_MEDIA_CLOUD_API_URL` must be a public HTTPS origin with no path, query, fragment, or URL credentials. Loopback/private hosts are rejected. The previous `STUDIO_COMFYUI_URL` and `STUDIO_COMFYUI_TOKEN` variables are no longer read.

The media runtime is still user-funded/fail-closed: missing configuration, database unavailability, model readiness failure, or invalid output prevents success. No operator-paid provider is silently substituted.

## Privacy contract

`studio_ai_usage_ledger` stores only:

- authenticated user ID;
- allowlisted task and actual server-selected model;
- terminal status;
- provider-returned token counts, when present;
- start, finish, and insertion timestamps.

It never stores prompt or response text, API keys, authorization headers, provider error bodies, client IPs, or provider-facing pseudonymous user IDs.

## Atomic quota flow

1. A short PostgreSQL transaction reserves a request and conservative token upper bound in global and user UTC-day rows.
2. No database transaction remains open during the external provider request.
3. A short settlement transaction releases reservations, charges returned usage, and inserts the terminal ledger event.
4. The PostgreSQL clock defines the UTC day.

Storage/admission failure returns sanitized `503` before provider use. Quota denial returns `429` before provider use. Finalization failure does not return generated content.

Default limits are 200 requests and 1,000,000 tokens per user, and 500 requests and 2,000,000 tokens service-wide per UTC day. Configure `STUDIO_AI_DAILY_REQUEST_LIMIT`, `STUDIO_AI_DAILY_TOKEN_LIMIT`, `STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT`, and `STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT`.

Apply the production migration manifest through `apps/api/src/db/migrations/0060_studio_ai_free_provider_expansion.sql` before deploying. The schema preflight rejects an incomplete contract.
