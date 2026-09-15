# Free-only AI runtime

ToonSpectrum may provide text AI without requiring every user to paste a key, but the service must never create a silent paid-AI path. The runtime therefore combines a billing-disabled shared free pool with policy-validated personal free connections and fails closed when all free capacity is unavailable.

## End-to-end routing

For text requests the default order is:

1. shared Gemini free tier;
2. shared Groq free tier;
3. shared SambaNova Free Tier;
4. shared Cloudflare Workers AI on the Workers Free daily allocation;
5. shared Mistral Free mode;
6. shared OpenRouter free router;
7. the user's explicitly selected personal free connection;
8. remaining valid personal free connections in quality order: Gemini, Groq, SambaNova, Cloudflare Workers AI, Mistral, OpenRouter, then local/self-hosted connections.

A route advances only after a definitive pre-inference free-capacity or request-limit rejection (`402` or `429`) or the application's own local free-budget exhaustion. Network errors, timeouts, `5xx` responses, malformed responses, and authentication errors are surfaced immediately and are not sent to another provider. This avoids duplicate inference after an ambiguous failure.

When every free route is exhausted or currently rate-limited, the UI explains that the user may add a personal free API key or local AI, retry after the provider limit clears, or leave the feature unavailable. The runtime never substitutes a paid model or silently enables billing.

## Shared free pool invariants

1. `STUDIO_AI_FREE_POOL_ENABLED=true` is required.
2. Every provider needs a server-side key and a matching `STUDIO_AI_FREE_*_CONFIRMED=true` operational approval.
3. Approval means the account was checked to have billing disabled or an enforced free-only boundary.
4. SambaNova approval additionally means no payment method is linked to the Free Tier account.
5. Cloudflare approval additionally means the account is on Workers Free, no AI Gateway unified billing or prepaid credits are used for this route, the Account ID is a 32-character hexadecimal value, and the selected `@cf/` model is not in the application's reviewed paid-only blocklist.
6. Mistral approval additionally means Studio remains in cardless Free mode.
7. OpenRouter is limited to `openrouter/free` or a model ending in `:free`.
8. Shared credentials are never exposed through `VITE_` variables or API responses.
9. Existing user-level and service-wide UTC daily request/token admissions remain authoritative and fail closed when their storage is unavailable.
10. Shared providers are text-only. Image, video, and 3D generation remain local/self-hosted or use an explicitly configured personal integration.

The application cannot independently inspect every provider's billing configuration. The `CONFIRMED` flags are therefore deliberate deployment approvals, not automatic billing guarantees. Use accounts with no payment method or provider-side hard spending limits wherever possible.

## Personal connection policies

| Policy | Enforcement |
| --- | --- |
| `local-zero-cost` | Only `localhost`, `127.0.0.1`, or `::1`; API key optional. |
| `self-hosted-zero-cost` | Authenticated HTTPS endpoint explicitly operated by the user. Known public AI provider hosts are rejected. |
| `openrouter-free` | Exact OpenRouter API base URL and `openrouter/free` or a model ending in `:free`; text only. |
| `provider-free-tier` | Exact reviewed Gemini, Groq, SambaNova, Cloudflare Workers AI, or Mistral OpenAI-compatible endpoint with the user's key; text only. Cloudflare also requires a valid Account ID and a non-paid-only `@cf/` model. The user confirms the provider-specific free-only boundary. |
| `unverified` | Always blocked until the user reviews the migrated or changed connection. |

Personal API keys stay in memory by default. Optional persistence uses the existing encrypted local vault. Browser requests omit cookies, reject redirects, and do not automatically retry.

## Unified settings surface

`/settings/ai`, the Studio settings page, Studio popovers, and account settings all render the same `UnifiedAiSettings` owner. It contains:

- shared free-pool status and provider order;
- personal free API keys and local/self-hosted AI connections;
- per-connection local request/token budget and blocker state;
- capability assignments used after the shared pool is exhausted or currently limited;
- Hyper3D/Rodin personal key;
- personal Creator Runtime URL, token, and owner ID;
- optional encrypted local persistence.

No other Studio component owns an independent token-entry form.

## Managed personal free safety budget

The browser applies a conservative application cap to `provider-free-tier` and `openrouter-free` connections. These are local safety limits, not claims about current provider quotas:

- 25 network attempts per connection and UTC day;
- 64,000 conservatively reserved input/output tokens per connection and UTC day;
- 1,024 output tokens per managed request;
- 256 KiB maximum JSON request body and 2 MiB maximum response body;
- one completion only (`n = 1`, `best_of = 1`) with log-probability expansion disabled;
- no managed-provider streaming;
- only `GET /models` and `POST /chat/completions`.

The runtime overwrites a managed request's model with the reviewed connection model before network I/O. Its budget ledger stores only counters, timestamps, connection ID, and provider host; prompts, responses, keys, and model output are never stored.

The ledger is serialized in `localStorage` so separate tabs share the daily cap. Browsers supporting Web Locks serialize reservations across tabs. If persistent storage is unavailable, the runtime keeps a fail-safe in-memory ledger for the current document.

Provider responses operate a local circuit breaker:

- `429`: at least 15 minutes of cooldown; a second quota failure on the same UTC day blocks until the next UTC day;
- `401` or `403`: 10-minute authentication cooldown and no fallback;
- `402`: locked until the connection is explicitly removed/reviewed and its local budget is reset;
- successful responses clear transient rate/authentication breaker state.

Requests are reserved before network I/O and are not refunded after a timeout or network failure because the provider may already have accepted them.

Provider billing must remain disabled and no payment method should be attached when the provider permits that setup. Browser-local limits can be cleared by the browser owner and provider terms can change, so these guards are an additional safety boundary—not a provider-side billing guarantee.

## Local Apple Silicon setup

The local preset points to `http://localhost:8082/v1`, matching an OpenAI-compatible proxy such as LiteLLM:

```text
ToonSpectrum browser
  -> http://localhost:8082/v1
  -> LiteLLM (loopback only)
  -> MLX-LM or Rapid-MLX
```

Example:

```bash
python3 -m mlx_lm server \
  --model mlx-community/Qwen3.6-35B-A3B-4bit \
  --port 8080

litellm --config ~/litellm_config.yaml --port 8082
```

The local gateway must permit the ToonSpectrum origin through CORS and should listen on loopback unless the user deliberately secures a remote endpoint. Ollama users can select the `http://localhost:11434/v1` preset and enter an installed model name.

## Review checklist

- [ ] Shared accounts have billing disabled or an equivalent hard free-only boundary.
- [ ] SambaNova has no payment method and Mistral remains in cardless Free mode.
- [ ] Cloudflare uses Workers Free, no AI Gateway unified billing/prepaid credits, a valid Account ID, and a non-paid-only `@cf/` model.
- [ ] Every enabled provider has a matching explicit `CONFIRMED=true` flag.
- [ ] Shared and personal managed providers remain text-only.
- [ ] OpenRouter non-free model IDs remain rejected.
- [ ] `402`/`429` are the only remote conditions that advance the free chain.
- [ ] Network, timeout, `5xx`, authentication, and parse failures do not resend a prompt.
- [ ] All-free exhaustion or request limiting returns the personal-key/local-AI/feature-unavailable message.
- [ ] Legacy connections remain `unverified` until explicitly reviewed.
- [ ] Browser requests omit cookies, redirects, and retries.
- [ ] No secret, prompt, or response is stored in quota ledgers or logs.
- [ ] All token-entry surfaces render the shared unified settings owner.
