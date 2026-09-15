# Free-only AI runtime

ToonSpectrum must not create AI costs for the service operator. The production API already rejects operator-funded AI execution; the browser runtime adds a second, independent guard for every user AI request.

## Runtime invariants

1. No operator API key is used in production or development.
2. Browser AI requests go directly to the selected connection with cookies omitted.
3. Requests are never automatically retried and never fall back to a paid model.
4. A connection must declare and satisfy one of the accepted zero-cost policies before any request is sent.
5. Legacy or ambiguous connections are imported as `unverified` and remain blocked until the user reviews them.
6. API keys stay in memory by default. Optional persistence uses the existing encrypted local vault.
7. Managed free providers pass through a local request/token budget and circuit breaker before network I/O.

## Accepted connection policies

| Policy | Enforcement |
| --- | --- |
| `local-zero-cost` | Only `localhost`, `127.0.0.1`, or `::1`; API key optional. |
| `self-hosted-zero-cost` | Authenticated HTTPS endpoint explicitly operated by the user. Known public AI provider hosts are rejected. |
| `openrouter-free` | Exact OpenRouter API base URL and `openrouter/free` or a model ending in `:free`; text only. |
| `provider-free-tier` | Exact official Groq, Gemini, or Mistral OpenAI-compatible endpoint with the user's key; text only. The user must confirm billing is disabled on that provider account. |
| `unverified` | Always blocked. Used for legacy or changed settings until reviewed. |

The application cannot inspect a third-party account's billing configuration. For Groq, Gemini, and Mistral, the user confirmation is therefore mandatory and the safest setup is an account with no payment method. Local inference and OpenRouter's free model route provide stronger application-side guarantees. Managed provider endpoints are exact-match allowlisted, while known public paid API hosts cannot be re-labelled as self-hosted.

## Local M2 / Apple Silicon setup

The default local preset points to `http://localhost:8082/v1`, matching a local OpenAI-compatible proxy such as LiteLLM. A typical local chain is:

```text
ToonSpectrum browser
  -> http://localhost:8082/v1
  -> LiteLLM (local only)
  -> MLX-LM or Rapid-MLX on the same Mac
```

Example commands already compatible with the project owner's workstation setup:

```bash
python3 -m mlx_lm server \
  --model mlx-community/Qwen3.6-35B-A3B-4bit \
  --port 8080

litellm --config ~/litellm_config.yaml --port 8082
```

The local gateway must allow the ToonSpectrum web origin through CORS. It should listen on loopback only unless the user deliberately secures a remote endpoint.

Ollama users can select the `http://localhost:11434/v1` preset and enter the exact installed model name.

## Provider presets

The UI includes presets for:

- local OpenAI-compatible server;
- Ollama;
- OpenRouter free model router;
- Groq free plan;
- Gemini free tier;
- Mistral free mode.

Provider model catalogs and free limits can change. Presets intentionally avoid pinning most remote model IDs. The user checks `/models`, chooses a currently available free model, and keeps billing disabled in the provider console.

## Managed-free safety budget

The browser applies its own conservative safety cap to `provider-free-tier` and `openrouter-free` connections. These values are application limits, not claims about a provider's current quota:

- 25 network attempts per connection and UTC day;
- 64,000 conservatively reserved input/output tokens per connection and UTC day;
- 1,024 output tokens per managed request;
- 256 KiB maximum JSON request body and 2 MiB maximum response body;
- one completion only (`n = 1`, `best_of = 1`) with log-probability expansion disabled;
- no managed-provider streaming;
- only `GET /models` and `POST /chat/completions`.

Before a managed request is sent, the runtime overwrites the request model with the reviewed connection model. This prevents a feature from bypassing the free-only configuration by supplying a different model in its request body. The budget ledger stores only counters, timestamps, connection ID, and provider host; prompts, responses, API keys, and model output are never stored in it.

The ledger is serialized in `localStorage` so separate tabs share the daily cap. Browsers supporting Web Locks serialize reservations across tabs. If persistent storage is unavailable, the runtime keeps a fail-safe in-memory ledger for the current document.

Provider responses also operate a circuit breaker:

- `429`: at least 15 minutes of cooldown; a second quota failure on the same UTC day blocks until the next UTC day;
- `401` or `403`: 10-minute authentication cooldown;
- `402`: connection remains locked until it is explicitly removed/reviewed and its local budget is reset;
- successful responses clear transient rate/authentication breaker state.

Requests are reserved before network I/O and are not refunded after timeout or network failure because the provider may already have accepted them. This intentionally over-counts rather than risking unexpected use.

Provider billing must remain disabled and no payment method should be attached when the provider permits that setup. This browser-local guard can be cleared by the browser owner and provider quotas, model routing, and billing terms can change without notice, so it is an additional safety boundary—not a guarantee against provider-side charges.

## Failure behavior

Quota exhaustion, rate limiting, CORS errors, timeouts, and unavailable models are surfaced to the user. The runtime does not retry, switch providers, use an operator proxy, or select a paid model. This is deliberate: degraded availability is preferable to an unexpected charge.

## Review checklist

- [ ] Production and development still reject operator-funded AI.
- [ ] New connections default to localhost rather than a paid API.
- [ ] Keyless remote endpoints remain rejected.
- [ ] Known public AI APIs cannot be labelled self-hosted.
- [ ] Managed free-tier connections remain text-only and exact-path allowlisted.
- [ ] Managed free requests pass through the daily request/token budget before `fetch`.
- [ ] Managed request bodies cannot select a model different from the reviewed connection.
- [ ] `402` and repeated `429` responses open a fail-closed circuit breaker.
- [ ] OpenRouter non-free model IDs remain rejected.
- [ ] Legacy connections remain `unverified` until explicitly reviewed.
- [ ] Browser requests omit cookies, redirects, and retries.
- [ ] No secret, prompt, or model response is stored in the budget ledger or logs.
