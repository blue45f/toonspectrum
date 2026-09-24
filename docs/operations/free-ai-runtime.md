# Cloud-only free-first AI runtime

ToonSpectrum can provide text AI without requiring every user to paste a key. The runtime combines a billing-disabled shared free pool with user-configured cloud API routes and fails closed when no permitted cloud route is available. Local LLMs, localhost gateways, private-network endpoints, browser model downloads, and self-hosted GPU inference are not supported AI execution paths.

## Default shared free pool

The default quality order is:

1. Gemini free tier;
2. Qwen China (Beijing) Free Quota Only;
3. Groq free tier;
4. SambaNova Free Tier;
5. Z.AI free Flash;
6. Mistral Free mode;
7. Cloudflare Workers AI on Workers Free;
8. OpenRouter free router;
9. SiliconFlow free text model.

`STUDIO_AI_FREE_PROVIDER_ORDER` defines the deployment default. An authenticated request may send a validated, duplicate-free subset/order from the unified settings UI. The user order is applied before the deployment default and missing entries are appended, so the pool remains complete.

A shared provider is eligible only when:

- `STUDIO_AI_FREE_POOL_ENABLED=true`;
- its server-side key exists;
- its `STUDIO_AI_FREE_*_CONFIRMED=true` approval exists;
- its endpoint and model satisfy the hardcoded free-only policy.

Shared keys never appear in `VITE_` variables, browser responses, logs, or artwork files.

## Personal cloud routing

One connection can store multiple key profiles and multiple model profiles. Each connection, key, and model has an enabled flag and numeric priority. Models are assigned to `text`, `image`, `inference`, or `three-d`.

Three modes are available:

- **Automatic:** shared free pool first, then policy-validated personal free routes in quality order.
- **Priority:** numeric connection/model/key priority is used; the shared free pool has its own priority value.
- **Manual:** one exact connection/key/model route is selected for each capability.

Paid `user-funded-byok` routes are excluded from automatic and priority fallback until the user explicitly enables paid fallback. Manual selection is treated as explicit consent to use that route.

## Cloud-only endpoint policy

Personal endpoints must be public HTTPS URLs. The validator rejects URL credentials, query strings, fragments, redirects, site-self origins, localhost, loopback, `.local`/`.lan`/`.internal`, RFC1918, carrier-grade NAT, link-local, and private IPv6 ranges.

Supported connection policies:

| Policy | Enforcement |
| --- | --- |
| `openrouter-free` | Exact OpenRouter API base URL and `openrouter/free` or a `:free` model; text only. |
| `provider-free-tier` | Exact reviewed cloud endpoint and a reviewed free text model. The user confirms provider billing/fallback is disabled. |
| `user-funded-byok` | Any validated public HTTPS cloud API. Charges may be applied by the user’s provider account. |
| `unverified` | Blocked until the migrated or modified connection is reviewed. |

## Safe fallback

The runtime advances only after a definitive pre-inference rejection:

- `401`/`403` for a personal key, allowing the next configured key;
- `402`/`429` for payment/free-quota/request-quota rejection;
- Qwen `403/AllocationQuota.FreeTierOnly` and Cloudflare `403/5035` in the shared pool;
- the app’s own per-route browser safety-budget exhaustion.

Network errors, timeouts, `5xx`, malformed success responses, and parse failures are surfaced immediately. The same request is not sent to another provider because the first provider may already have accepted it.

## Browser safety budget

`provider-free-tier` and `openrouter-free` routes use conservative per-route browser limits:

- 25 network attempts per UTC day;
- 64,000 conservatively reserved input/output tokens per UTC day;
- 1,024 output tokens per request;
- 256 KiB maximum JSON request body and 2 MiB maximum response body;
- `n = 1`, `best_of = 1`, no log-probability expansion, no streaming;
- only `GET /models` and `POST /chat/completions`.

The budget key includes connection, model, and key profile IDs. It stores counters and timestamps only, never prompts, outputs, or secrets.

## Managed cloud media inference

Image/video/2D↔3D server media jobs use:

```text
STUDIO_MEDIA_CLOUD_API_URL=https://managed-runtime.example.com
STUDIO_MEDIA_CLOUD_API_TOKEN=server-side-secret
```

Only a public HTTPS origin is accepted. HTTP, loopback, private networks, URL credentials, paths, query strings, and fragments are rejected. The API remains user-funded/fail-closed and does not substitute an operator-paid provider.

## Unified settings and secret storage

`/settings/ai` is the single canonical credential and routing surface. Studio, integration and inference screens render only a secret-free status card that links to this route instead of mounting duplicate editors. The default experience is progressive:

1. **시작하기** — provider choice, one API key, conditional model/endpoint fields, automatic verification and a plain-language paid-fallback choice;
2. **AI 사용 순서** — automatic, user-ordered and exact-manual modes with accessible up/down controls;
3. **고급 설정** — the existing full connection editor, multiple keys/models, exact paths, runtime tokens and encrypted vault.

The canonical owner still controls:

- shared free-pool status and order;
- automatic/priority/manual routing mode;
- multiple keys and models per cloud connection;
- exact capability route assignments;
- paid-fallback consent;
- Hyper3D/Rodin and managed Creator Runtime tokens;
- optional encrypted browser vault.

Personal keys remain in memory by default. The encrypted vault stores the normalized configuration but never stores the vault password. Embedded entry cards never render secrets, endpoints or model IDs. Browser requests omit cookies, reject redirects, and do not automatically retry ambiguous failures.

## Review checklist

- [ ] Every shared account has billing disabled or a provider-side hard free-only boundary.
- [ ] Every enabled shared provider has `CONFIRMED=true`.
- [ ] No preset or environment variable points to localhost/private AI infrastructure.
- [ ] Paid BYOK fallback is disabled by default.
- [ ] Multiple key/model route order is deterministic.
- [ ] `401`/`403`/`402`/`429` are the only personal-route automatic advance conditions.
- [ ] Network, timeout, `5xx`, parse, and malformed-success failures do not replay.
- [ ] No secret, prompt, or response is stored in quota ledgers or application logs.
