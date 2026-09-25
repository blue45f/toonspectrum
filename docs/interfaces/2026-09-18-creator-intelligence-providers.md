# Creator Intelligence provider contract

Date: 2026-09-18

Creator Intelligence is a project-scoped bridge over Studio capabilities that already exist locally. It does not replace the canvas, CRDT review, character bible, lettering engine, Lift3D, preflight, timeline, or animatic implementation.

## Capability map

| Capability | Authority | External bridge |
| --- | --- | --- |
| Pose Director | MediaPipe pose/hand tracking already in Studio | none required |
| Reference Vault | project research store + existing reference board | Openverse, Pexels, Pixabay |
| Continuity Guardian | character/story bible + deterministic continuity rules | optional VLM remains separate |
| Smart Lettering | bubble fit, kinsoku, tails, vertical text, vetted fonts | none required |
| Localization Studio | glossary, translation memory, QA, balloon fitting | DeepL or configured LibreTranslate |
| Realtime Review | Yjs/CRDT + comments/mentions/approval workflows | none required |
| 2D → 3D Reference | on-device Lift3D/GLB pipeline | optional Meshy image-to-3D |
| Scene Reference | project scene cards | contracted geocoder + Open-Meteo archive endpoint |
| Sound FX | project SFX metadata | gated Freesound + gated ElevenLabs SFX |
| Publish Preflight | local publication checks | optional Google Vision SafeSearch |
| Story Timeline | existing project timeline/continuity engine | none required |
| World Wiki & Relations | story graph and relation views | none required |
| Motion Comic | existing animatic + motion export | none required |
| AniList Explorer | metadata-only project references | gated AniList GraphQL |

## Security and privacy rules

1. Provider secrets are server-only environment variables. They are never returned by `/api/creator-intelligence/status` and are never stored in project localStorage.
2. Browser requests go only to ToonSpectrum's own `/api/creator-intelligence/*` routes. Production CSP does not need new external `connect-src` origins.
3. External moderation is opt-in per file. SafeSearch accepts only PNG/JPEG/WebP data URLs up to 2 MB and returns a human-review flag; it never auto-blocks publication.
4. Meshy only accepts a public HTTPS image URL. Local/private images should use on-device Lift3D instead of silently uploading bytes.
5. Project research persistence stores normalized metadata/provenance only. Generated audio base64 and API credentials are not persisted.
6. Every operator-funded POST requires an authenticated session and an idempotency key. Production dispatch is disabled unless `CREATOR_INTELLIGENCE_PAID_EXECUTION_ENABLED=true` and distributed Upstash coordination is available.
7. Meshy result URLs are resolved through the shared SSRF policy, pinned to a validated public DNS address, revalidated on every redirect, copied into private object storage, and replaced with account-bound short-lived artifact links.

## Rights and cost gates

- **Openverse** is discovery-only. Search results are marked `importable: false` and `rightsStatus: verify-source`; the original source must be checked before reuse.
- **Pexels/Pixabay** require server keys. Returned records preserve provider-license metadata but still do not make third-party trademark/model/property rights disappear.
- **AniList** remains disabled until `CREATOR_INTELLIGENCE_ANILIST_ENABLED=true` after operator review of commercial/API terms. Only metadata is stored.
- **Freesound** requires both an enable flag and API key. Each sound keeps its individual license and remains `verify-item-license` before project inclusion.
- **Open-Meteo/geocoding** has no public production fallback. Configure a contracted/self-hosted geocoder and commercial weather endpoint explicitly.
- **ElevenLabs SFX** and **Meshy** are paid-provider calls and require explicit provider flags, API keys, and the global paid-execution switch.
- Per-user and service-wide daily limits are reserved before dispatch. An uncertain network/provider outcome retains the original idempotency receipt so browser retries cannot create a second charge.
- Production Meshy dispatch additionally requires configured private object storage; temporary provider URLs are never returned as durable project assets.
- **Google Vision SafeSearch** is optional and disabled by default because selected image bytes leave the ToonSpectrum environment.

## Project persistence

The browser store schema is `toonspectrum.creator-intelligence.project.v1`. Keys are namespaced by project id and retain bounded collections for references, scene cards, AniList metadata, Freesound metadata, and Meshy job records. Reference Vault entries also keep an explicit `project` / `episode` / `scene` target so the same source can belong to different moodboards without losing provenance. Existing Studio project data remains authoritative for story, canvas, review, export, and local media workflows.

## Runtime readiness

`GET /api/creator-intelligence/status` exposes only non-secret readiness metadata: paid-execution enablement, distributed coordination availability, and private mesh-artifact storage readiness. Operations stay unavailable rather than degrading to unmetered paid calls when any required control plane is missing.
