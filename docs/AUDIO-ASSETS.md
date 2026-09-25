# Audio assets

## Site soundtrack policy

The site-wide soundtrack accepts **ToonSpectrum original productions only**. The previous Pixabay reference tracks were removed on 2026-09-18, and the player never substitutes licensed demo songs or browser-procedural placeholder music for a missing master.

## Repository release-ready original OST

The original production plan defines nine primary compositions, and all nine approved masters are now present in this repository (32:05). The Prism Awakening expansion adds six masters (19:45), producing a fifteen-master repository catalogue (51:50). This describes repository artifacts, not a confirmed live deployment. A recurring four-note creation motif is a production intention rather than a verified transcription of every generated output.

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

Vocal titles still declare instrumental variants in the production config so focused-work derivatives can be generated later without changing the album identity.

## Prism Awakening expansion

The six new compositions and full original Korean lyrics are documented in `docs/ost/prism-awakening/README.md` and its adjacent track files. Four tracks use vocal generation and two are strictly instrumental requests. The sonic brief emphasizes symphonic anime-opening rock, awakening and finale themes, an intimate orchestral ending, fantasy exploration and final-battle scoring; no named artist, franchise or source recording was supplied.

The new delivery format is 48 kHz stereo MP3 at 320 kbps. The original FLACs are retained outside Git in the operator's music archive. New masters use measured two-pass loudness normalization, targeting -14 LUFS and -1.5 dBTP while requesting linear normalization and an 11 LU loudness-range target. Sidecars record the actual normalization mode, first-pass measurements and post-encode QC. This does not assert that a 320 kbps encoding, loudness test or release flag certifies subjective musical quality.

`python3 scripts/generate-site-original-ost-acestep.py --track spectrum-breaker --keep-source` keeps an archival FLAC; the raw directory is configured through `ACESTEP_RAW_DIR`. No paid provider is called by this local generator. Production deployment still requires the separate approval specified in `AGENTS.md`.

## ACE-Step 1.5 production record

The existing masters were generated locally with the official ACE-Step 1.5 repository at Git revision `ca1e85fe9430179831e6bc6be790c332190a3866`, model `acestep-v15-turbo`, native MLX DiT and MLX VAE on Apple Silicon. ACE-Step's checked-out software license is MIT. No source audio, commercial recording, artist reference, franchise reference or celebrity voice reference was supplied; prompts explicitly require original melody/harmony and prohibit imitation.

Pinned model artifacts used for this release:

- DiT SHA-256: `3f6e0797fad420a39bd33979eb6e840e30989e34a3794e843d23b60ec6e422d7`
- VAE SHA-256: `da17edb604c40deaf09e9b24974e590d1ca83a374070e5d0884cfa4bed9a99b0`
- Qwen3 embedding SHA-256: `0437e45c94563b09e13cb7a64478fc406947a93cb34a7e05870fc8dcd48e23fd`

Generation uses deterministic per-track seeds. ACE-Step produces a 48 kHz FLAC intermediate, and the FLAC is not committed; its SHA-256 is retained in the adjacent JSON sidecar. The six legacy core masters use the original 192 kbps/single-pass `loudnorm=I=-14:TP=-1:LRA=7` path. `midnight-storyboard`, `neon-scroll`, and `publish-the-sky` use 192 kbps/two-pass mastering targeting -14 LUFS, -1.5 dBTP and 11 LU LRA. The Prism Awakening expansion uses the 320 kbps/two-pass settings above. Each public MP3 must pass automated checks for codec, sample rate, stereo layout, expected duration, delivery bitrate, integrated loudness, true peak and final SHA-256.

ACE-Step does not provide the Eleven Music C2PA request contract. The runtime therefore treats its provenance separately: an ACE-Step entry is accepted only with `provenance: "local-generation-recorded"`, a pinned 40-character generator revision, a valid SHA-256 and `status: "published"`. Eleven Music entries continue to require `provenance: "c2pa-requested"` plus `c2paRequested: true`; this gate was not weakened.

For reproduction, start the local ACE-Step API on `127.0.0.1:8001`, then run `python3 scripts/generate-site-original-ost-acestep.py --all`; future sidecars remain unpublished by default. `--approve-generated` is intentionally explicit, and `node scripts/generate-site-original-ost.mjs --track draw-your-world --dry-run --publish` performs the provider-aware manifest rebuild after review.

The assistant can verify objective audio/integrity properties but does not claim human auditory perception. Sidecars therefore record `subjectiveListeningReview: "not-performed-by-assistant"`; publication in this release follows the repository owner's explicit request plus automated QC and recorded non-imitation creative direction.

ACE-Step source: https://github.com/ace-step/ACE-Step-1.5

## Eleven Music production path

`scripts/generate-site-original-ost.mjs` remains available as the paid-provider path. Dry-run is the default. `--generate` requires `ELEVENLABS_API_KEY`; batch generation requires `--confirm-batch`; existing audio requires `--force` to overwrite. Eleven-generated sidecars record SHA-256, provider song ID when available, model, generation time, config hash, C2PA request state and review flags.

The same script's `--publish` phase is provider-aware: it verifies media hashes and accepts only either a valid Eleven/C2PA record or a valid ACE-Step/local-generation record with automated QC. Unapproved sidecars are skipped.

## Manifest contract

`apps/web/public/audio/playlist.json` contains same-origin `/audio/original/*` entries only. Required metadata includes role, vocal mode, adaptive profiles/intensity, duration/BPM, `origin: "original"`, final SHA-256, generation timestamp, provider/model, matching provenance mode and `status: "published"`. The web parser rejects legacy `licensed-reference` entries, external audio URLs, missing integrity metadata, unsupported provider/model/provenance combinations, drafts and files outside `/audio/original/`.

## Runtime behavior

Route roles select opening, creator, story, action, romance or ending tracks. Listeners may keep automatic routing or choose `Animation`, `Webtoon`, `Lo-fi`, `Cinematic`, `Fantasy`, or `City Pop`, plus `Chill` / `Normal` / `Epic` and `Auto` / `Vocal` / `Instrumental`. Creator, learning and story workspaces prefer instrumental tracks in Auto mode. Existing crossfades and browser autoplay handling remain in the core audio engine.

Audio creation, animatic, live-call, game, message, admin, login/account and other audio-conflicting routes suspend the global soundtrack without clearing listener preferences.

## Rights and release boundary

All production prompts prohibit named-artist, franchise, copyrighted-melody and celebrity-voice imitation. Software/model provenance and automated signal QC do not substitute for legal review where a particular downstream distribution, advertising campaign, broadcaster, platform or jurisdiction imposes additional requirements. Keep the sidecars with the released masters and re-check applicable terms before repurposing the audio outside the ToonSpectrum site.
