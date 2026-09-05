# ToonStudio AI 음악 제작

## Implemented surface

`/music` is a lazy-loaded creator route. The owner-side WorkFx panel opens it with a work ID without discarding unsaved effect settings. Ten moods, five purposes (BGM, OST, opening, ending, trailer), 15/30/45/60-second requests, tempo, 1–4 instruments, instrumental or original-lyric vocals, repeat-friendly composition requests, prompt inspection, rights/data-transfer consent, cancel, native audio preview, MP3/metadata download, settings reuse, search and an account-partitioned device-local library.

This is an Eleven Music adapter, not a re-labelled oscillator. No output appears without a successful bounded MP3 response. Existing procedural BGM is unchanged. Exact BPM, length, seamless looping, pronunciation and lyric fidelity require listening/QC and are not guaranteed.

Work ID is library organization metadata, not a public attachment. Audio is not automatically uploaded, published to readers, mixed into motion export or synced across devices. Download it for video editing; existing WorkFx custom-URL playback needs a durable HTTPS audio URL with appropriate rights. Never publish temporary blob URLs. Playback requires a user gesture.

## Local persistence

The music repository dynamically acquires the existing `acquireStudioLocalDatabase()` SQLite/OPFS Worker. It never opens another browser database and does not relax the browser-KV authority gate. No database migrations or changes to shared persistence are needed.

Namespace `studio-music-library-v1` contains exactly 20 reusable slots per account. One bounded SQLite row stores a versioned envelope containing both MP3 (base64 text) and metadata; this avoids separate audio/metadata commits and leaves no orphaned index. Original audio is capped at 1,500,000 bytes per track, and encoded rows at 2,030,000 characters. Base64 is only a codec inside the existing SQLite database, never a localStorage authority. Account-bound keys and envelope validation prevent accidental cross-account reads/deletes. Empty rows are reusable deletion tombstones.

An exclusive origin-scoped Web Lock serializes reads and mutations for each account across clients/tabs. Lock acquisition times out after 10 seconds; an in-flight write is not raced against a timeout or reported as cancelled. Missing Web Locks, unavailable OPFS, corrupt records and quota/write failures reject explicitly. The UI retains a newly generated unsaved Blob for manual download and does not falsely claim it was saved. The shared app-lifetime database is not closed by the music page. Browser data deletion removes local music; MP3 backups are required. This is device-local convenience storage, not encrypted multi-user cloud storage.

## Server configuration

```dotenv
STUDIO_MUSIC_ENABLED=false
STUDIO_MUSIC_LICENSE_ACKNOWLEDGED=false
ELEVENLABS_API_KEY=
UPSTASH_REDIS_REST_URL=https://YOUR_EXISTING_DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=
STUDIO_MUSIC_USER_DAILY_SECONDS=180
STUDIO_MUSIC_GLOBAL_DAILY_SECONDS=1200
```

Only enable after reviewing provider plan/use-case terms. These are server-only secrets, never VITE-prefixed. No key/subscription is created or paid generation performed by merging this change. Both enablement and license acknowledgement must be true; missing provider or distributed coordination configuration fails closed. Status reports configuration, not live credit balance.

## Request boundary

- GET `/api/studio-music/status`: no-store sanitized configuration status.
- POST `/api/studio-music/generate`: existing verified HttpOnly session and CSRF boundary, UUID Idempotency-Key, strict input validation and consent.
- Atomic Redis EVAL checks the request receipt and both daily requested-second budgets before dispatch. Same-slot hash-tagged keys; duplicate/conflict 409 without another paid call; receipts last 48 hours. This is duplicate suppression, not durable result replay. No memory-only limiter or fail-open behavior.
- Defaults: user 180/global 1200 requested seconds per day; configurable ranges 15–3600 and 15–86400. UTC buckets reset at 09:00 KST. Reservations remain counted after failures or unknown provider outcomes; these limits are not a price quotation or invoice ledger.
- Fixed endpoint `https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128`, model music_v1, prompt, music_length_ms, force_instrumental and store_for_inpainting:false. No arbitrary URL proxy, automatic retries, provider failover or undocumented seed parameter.
- Redis deadline 4 seconds, upstream total 48 seconds, client 55 seconds. Existing API function budget is 60 seconds. Longer jobs and recoverable provider output receipts are not implemented here.
- Bounded audio stream, MIME/MP3 signature validation, bounded base64 JSON response. Raw provider errors, keys and lyrics are not echoed or logged. Cancellation/timeout does not promise a provider refund.

## Validation

```sh
pnpm exec vitest run lib/studio-music.test.ts lib/server/studio-music-core.test.ts src/domains/creator/music/studio-music-library.test.ts src/domains/creator/studio-browser-kv-authority-boundary.test.ts
pnpm run typecheck
pnpm run lint:strict
pnpm run build
```

The library tests cover round-trip bytes, ordering, account isolation, concurrent clients, capacity, slot reuse, persistence failure, corruption and canonical authority. HTTP tests use mocked external services, not paid generations. Before activation, verify a real approved provider account: instrumental/Korean vocals, cancellation/credits, clipping and lyric fidelity, downloads, reload/delete and desktop/mobile keyboard interaction. Mocked/configuration checks are not real audio-quality approval.

## Primary references

- https://elevenlabs.io/docs/api-reference/music/compose
- https://elevenlabs.io/eleven-music-model-specific-terms
- https://elevenlabs.io/music-terms
- https://upstash.com/docs/redis/features/restapi
- https://upstash.com/docs/redis/commands/scripting/eval
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API

Commercial use depends on the provider subscription and intended use. No universal royalty-free resale, copyright ownership, voice-imitation or unrestricted-distribution guarantee is made.
