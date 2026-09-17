# Audio assets

## Site soundtrack policy

The site-wide soundtrack accepts **ToonSpectrum original productions only**. The previous Pixabay
reference tracks were removed on 2026-09-18 and the player no longer falls back to licensed demo
songs or the browser-procedural soundtrack when an original file is unavailable.

A missing or unapproved soundtrack is intentionally silent. This is a product-quality boundary:
low-fidelity placeholders must not be mistaken for the brand's final sound.

## Original OST production pipeline

The production source of truth is `config/site-original-ost.production.json`. It defines the
ToonSpectrum sonic identity, nine launch themes, original Korean lyrics, BPM, duration, adaptive
profiles, intensity, and role metadata. `scripts/generate-site-original-ost.mjs` turns those
briefs into long-form Eleven Music v2.5 requests.

Generation is deliberately separated from publication:

1. `--dry-run` is the default and prints provider requests without spending credits.
2. `--generate` requires `ELEVENLABS_API_KEY` and writes the MP3 plus a provenance JSON sidecar.
3. Every generated file records SHA-256, provider song id when available, model, generation time,
   config hash, requested C2PA provenance, and review flags.
4. Human creative, clipping, lyric and rights review must be completed in the sidecar. Set
   `review.approvedForSite` to `true` only after those checks pass.
5. `--publish` verifies the MP3 hash and provenance metadata and rebuilds
   `apps/web/public/audio/playlist.json` using **approved** files only.

Example single-track flow:

```bash
node scripts/generate-site-original-ost.mjs --track draw-your-world --dry-run
ELEVENLABS_API_KEY=... node scripts/generate-site-original-ost.mjs --track draw-your-world --generate
# listen/review, then update review flags in the generated sidecar
node scripts/generate-site-original-ost.mjs --track draw-your-world --dry-run --publish
```

Batch paid generation has an additional `--confirm-batch` guard. Existing audio is never replaced
without `--force`.

## Launch album

The initial suite is built around one recurring four-note "creation motif" instead of unrelated
page jingles. The motif should be recognizable without copying any existing work.

| ID | Role | Primary form | Runtime | Purpose |
| --- | --- | --- | ---: | --- |
| `draw-your-world` | opening | Korean vocal | 3:30 | flagship animation-style opening |
| `after-the-last-panel` | ending | Korean vocal | 3:45 | emotional closing theme |
| `lines-become-worlds` | creator | Korean vocal | 3:25 | creator anthem |
| `ink-and-starlight` | story | instrumental | 4:00 | worldbuilding main score |
| `beyond-the-panel` | action | instrumental | 3:15 | production/action climax |
| `between-two-speech-bubbles` | romance | Korean vocal | 3:20 | character/romance song |
| `midnight-storyboard` | creator | instrumental | 5:00 | long-form drawing focus |
| `neon-scroll` | story | instrumental | 3:50 | discovery/community city-pop |
| `publish-the-sky` | ending | instrumental | 2:00 | publish/completion victory theme |

Vocal titles declare an instrumental variant so the same composition family can serve focused work
without lyrics. The production script generates only primary variants by default; `--with-variants`
is explicit because every provider request may incur cost.

## Manifest contract

`apps/web/public/audio/playlist.json` is intentionally empty until reviewed originals are present.
Published entries must point to `/audio/original/*` and include:

- role, vocal mode, adaptive profile and intensity
- duration and BPM
- `origin: "original"`
- provider `elevenlabs` and model `music_v2_5`
- SHA-256 and generation timestamp
- `c2paRequested: true`
- `status: "published"`
- HTTPS terms/provenance URL

The web parser rejects legacy `licensed-reference` entries, external audio URLs, missing integrity
metadata, unreviewed/draft status, unsupported providers/models, and files outside
`/audio/original/`.

## Runtime behavior

The global player stays silent until at least one valid published original is available. Browser
autoplay policy still applies: music requires a user gesture before the audio context resumes.

Once originals are published, route roles select opening, creator, story, action, romance, or ending
tracks. The listener can keep automatic routing or choose an adaptive style (`Animation`, `Webtoon`,
`Lo-fi`, `Cinematic`, `Fantasy`, `City Pop`), intensity (`Chill`, `Normal`, `Epic`), and vocal mode
(`Auto`, `Vocal`, `Instrumental`). Creator/learning/story workspaces prefer instrumental tracks in
Auto mode. Existing crossfades remain in the core audio engine.

Audio creation, animatic, live-call, game, message, admin, login/account and other audio-conflicting
routes suspend the global soundtrack without erasing the listener's saved preferences.

## Quality and rights release gate

The production target is a high-fidelity, cinematic animation/webtoon soundtrack, not a synthetic
browser loop. Provider prompts explicitly prohibit named-artist, franchise, copyrighted-melody and
celebrity-voice imitation.

Eleven Music availability and commercial rights vary by subscription and its current Music Terms.
Do not interpret a generated file or a successful API response as automatic clearance for every
use. Before public release, verify the ToonSpectrum subscription covers the intended web,
advertising, film/TV, offline or other distribution use at that time and retain the review record.

Provider terms: https://elevenlabs.io/eleven-music-model-specific-terms
