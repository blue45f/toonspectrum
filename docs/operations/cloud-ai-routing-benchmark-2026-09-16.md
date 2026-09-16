# Cloud AI routing benchmark and product decisions

Date: 2026-09-16

The phrase “에이다 브라우저” in the product request is treated as **Dia Browser**, based on the product name and the requested browser-AI routing context. This document compares only publicly documented behavior and records ToonSpectrum decisions; it is not a claim that the products expose identical APIs.

## Benchmarked products

| Product | Documented pattern | ToonSpectrum decision |
| --- | --- | --- |
| Dia Browser | Dia’s changelog documents switching chat to backup AI models when the primary model fails. Dia also exposes profile/context and privacy controls around browser AI. | Keep fallback invisible in automatic mode, but show the selected route and preserve a strict no-duplicate rule for ambiguous failures. |
| Browser Use Cloud | Hosted browser agents support many model providers, BYOK for major providers, and automatic model matching in the hosted product. | Use one cloud settings surface for provider keys/models and let users add more than one key and model per provider. No local browser runner is required. |
| Vercel AI Gateway | Provider ordering, model fallback, request-scoped BYOK, observability, budgets, and provider filtering are first-class gateway concepts. | Make order explicit, separate shared free pool order from personal connection/model/key priority, and keep paid BYOK disabled until the user opts in. |
| OpenRouter | One API exposes a large multi-provider model catalog and a free model router. | Offer `openrouter/free` as a preset while still allowing direct provider keys, so one aggregator is not a single point of dependency. |

Official references:

- Dia changelog: https://www.diabrowser.com/changelog
- Dia security and privacy: https://www.diabrowser.com/security
- Browser Use supported models: https://docs.browser-use.com/customize/supported-models
- Browser Use Cloud quickstart: https://docs.browser-use.com/cloud/quickstart
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway
- Vercel provider options: https://vercel.com/docs/ai-gateway/models-and-providers/provider-options
- Vercel model fallbacks: https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks
- Vercel BYOK: https://vercel.com/docs/ai-gateway/byok
- OpenRouter model routing: https://openrouter.ai/docs/overview/models

## Resulting product model

### 1. Zero local inference dependency

AI connections must use a public HTTPS cloud endpoint. The settings validator rejects:

- `localhost`, loopback, `.local`, `.lan`, and `.internal` hosts;
- RFC1918/private IPv4, carrier-grade NAT, link-local, private IPv6, and site-self origins;
- URL credentials, query strings, fragments, redirects, and non-HTTPS schemes.

Image, video, and 2D↔3D media inference use `STUDIO_MEDIA_CLOUD_API_URL` and `STUDIO_MEDIA_CLOUD_API_TOKEN`. The former local ComfyUI environment variables are no longer read.

### 2. Three routing modes

| Mode | Behavior |
| --- | --- |
| Automatic | Shared free pool first. Personal free routes are quality-ranked. Paid BYOK is excluded unless explicitly enabled. |
| Priority | The user’s numeric priorities determine personal provider/model/key order. The shared pool has its own numeric priority so users can put a personal free route before or after it. |
| Manual | One exact connection + key + model is selected per capability. No implicit alternate is selected. |

Capabilities are managed independently for text, image, media inference, and 2D↔3D.

### 3. Multiple keys and models

Each cloud connection can contain:

- up to 12 API-key profiles;
- up to 32 model profiles;
- enabled/disabled state and priority for the connection, every key, and every model;
- a capability assigned to each model;
- an exact manual route assignment per capability.

The runtime expands enabled model/key combinations into deterministic routes. Priority is connection → model → key. A route identifier includes all three IDs so browser quota guards and cooldowns do not incorrectly merge separate keys.

### 4. Safe fallback boundary

Automatic replay is allowed only when the first route has clearly rejected the request before useful inference:

- `401`/`403`: invalid or unavailable personal key, allowing the next configured key;
- `402`/`429`: billing/free quota or request quota rejection;
- provider-specific, machine-verifiable free-quota codes in the shared server pool.

Network failures, timeouts, `5xx`, invalid success payloads, and parse failures are not replayed. Those outcomes may be ambiguous and could create duplicate generations or charges.

### 5. Cost safety

- Shared free providers require server-side confirmation flags and free-model allowlists.
- Personal paid BYOK is excluded from automatic routing by default.
- Enabling paid fallback is an explicit setting.
- Managed free browser routes keep per-route request/token reservations, response-size caps, and circuit breakers.
- The app never auto-enables provider billing or upgrades a plan.

### 6. Secret and data boundaries

- Shared credentials remain server-side.
- Personal keys live in memory by default; optional persistence uses the encrypted browser vault.
- The vault password is never stored.
- Prompts, outputs, and secrets are not written to the quota ledger.
- Browser requests omit cookies, reject redirects, and use `no-store`/`no-referrer` behavior.
- Public demo endpoints should not receive private artwork unless their retention and training policies are acceptable.

## Acceptance criteria

- [x] No AI preset points to localhost or a private network.
- [x] Cloud URL validation rejects local/private origins.
- [x] Shared free mode remains automatic and keyless for the user.
- [x] A connection supports multiple API keys and multiple models.
- [x] Automatic, user-priority, and exact-manual modes are available.
- [x] Server free-provider order can be supplied per request and is schema-validated.
- [x] Paid BYOK remains disabled from automatic routing by default.
- [x] Ambiguous failures are not replayed to another provider.
- [x] Media inference uses a managed-cloud HTTPS origin only.
