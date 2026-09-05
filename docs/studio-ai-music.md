# ToonStudio AI 음악 제작

## Delivered surface

`/music` is a lazy-loaded creator route. Ten webtoon mood presets, five use cases (scene BGM, emotional OST, opening, ending, trailer), 15/30/45/60-second requests, tempo, 1–4 instruments, instrumental or original-lyric vocals, repeat-friendly composition requests, prompt inspection, explicit rights/data-transfer consent, cancel, native audio preview, MP3 and metadata download, settings reuse, search and an account-partitioned IndexedDB library (20 tracks per account on this browser).

This is a real Eleven Music adapter, not a re-labelled oscillator or a fabricated generated track. No output is displayed without a successful bounded MP3 response. Existing procedural BGM remains unchanged. No additional runtime dependency is required.

The work ID is library organization metadata, not a public attachment. Audio is not automatically uploaded to object storage, published to readers, mixed into motion export, or synced between devices. To use an output in existing WorkFx custom-URL playback, download it and host it at a durable HTTPS audio URL subject to the applicable rights. Do not put temporary `blob:` URLs in published work documents. Preview starts only after an explicit user gesture. Exact BPM, duration, perfect looping and lyric fidelity require listening/QC and are not guaranteed.

## Operator configuration (server-side only)

```dotenv
# Default is disabled; leave disabled until plan/use-case rights have been reviewed.
STUDIO_MUSIC_ENABLED=false
STUDIO_MUSIC_LICENSE_ACKNOWLEDGED=false
ELEVENLABS_API_KEY=
UPSTASH_REDIS_REST_URL=https://YOUR_EXISTING_DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=
# Budgets are requested audio seconds, not a price quotation.
STUDIO_MUSIC_USER_DAILY_SECONDS=180
STUDIO_MUSIC_GLOBAL_DAILY_SECONDS=1200
```

Configure these in the existing API deployment; never use `VITE_` prefixes for secrets. Enablement and license acknowledgement must both be `true`; missing provider or distributed admission configuration fails closed. No provider key was created, no subscription purchased, and no commercial-terms consent was accepted automatically by this change. Status indicates configuration, not live billing balance. The Redis hostname must be an HTTPS Upstash endpoint; redirects are rejected.

User budget supports 15–3600 requested seconds/day; global budget 15–86400/day. Defaults intentionally limit exposure. UTC date buckets reset at 00:00 UTC / 09:00 Asia/Seoul. Count reservations conservatively even if the provider rejects, times out, or the caller disconnects: the delivery/billing outcome may be unknown. This is not an invoice ledger or a promise of free retries.

## API and security

- `GET /api/studio-music/status`: no-store, sanitized availability.
- `POST /api/studio-music/generate`: existing verified HttpOnly session and CSRF boundary, UUID `Idempotency-Key`, strict shared brief validation, explicit consent.
- One atomic Redis `EVAL` checks scoped request receipt and both daily budgets before dispatch. Hash-tagged keys share a cluster slot. A replay/conflict returns 409 without another paid call. Receipts last 48 hours. This is duplicate suppression, not durable result replay.
- No in-memory fail-open limiter. Redis failure returns 503 before the provider call.
- Fixed upstream POST `https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128`; `music_v1`, prompt, `music_length_ms`, `force_instrumental`, `store_for_inpainting:false`. No unsupported seed/composition-plan combination, no arbitrary URL proxy, no automatic retries or provider failover.
- End-to-end upstream deadline 48 seconds fits the existing 60-second API function. Redis deadline 4 seconds, client 55 seconds. Longer background jobs and recoverable provider output receipts are not implemented in this version.
- Response stream capped at 1,500,000 audio bytes, MIME and MP3 signature checked, encoded as bounded JSON under the existing function response budget. Provider failures never echo raw bodies, keys or lyrics. No request payload logging is added.
- Native audio controls; object URLs released on unmount. Account-partitioned IndexedDB stores Blob + metadata, not base64 in localStorage. Private browsing, quota, blocked databases and write failures are surfaced. Device storage is not encrypted cloud storage; download backups before clearing browser data.

## Validation

Run the contract and provider-boundary suites:

```sh
pnpm exec vitest run lib/studio-music.test.ts lib/server/studio-music-core.test.ts
pnpm run typecheck
pnpm run lint:strict
pnpm run build
```

Provider tests use test-only credentials and mocked HTTP, not paid generations. Verify a real approved provider account separately before enabling production: instrumental, Korean vocals, timeout/credit exhaustion, listen for clipping and lyric fidelity, download/reload/delete, and desktop/mobile keyboard navigation. Configuration-only and mocked checks must not be reported as real audio quality approval.

## Primary references (checked 2026-09-06)

- ElevenLabs compose API: https://elevenlabs.io/docs/api-reference/music/compose
- Music model-specific terms: https://elevenlabs.io/eleven-music-model-specific-terms
- Music terms: https://elevenlabs.io/music-terms
- Upstash Redis REST and atomic scripting: https://upstash.com/docs/redis/features/restapi and https://upstash.com/docs/redis/commands/scripting/eval

Commercial use depends on subscription and intended use. Do not assert universal royalty-free resale, copyright ownership, artist-voice imitation rights or unrestricted distribution. Operator review is a launch requirement, not a legal conclusion embedded in UI.
