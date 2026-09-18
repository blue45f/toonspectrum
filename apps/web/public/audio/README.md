# ToonSpectrum Original OST assets

This directory contains reviewed **ToonSpectrum original** soundtrack releases.

- `playlist.json` contains only provenance-backed, approved originals.
- Final masters live under `original/` as 48 kHz stereo / 192 kbps MP3 files with JSON provenance sidecars.
- The previous licensed reference demos were removed on 2026-09-18.
- The global player does not fall back to references or browser-synthesized placeholder music.
- Production briefs and original Korean lyrics live in `config/site-original-ost.production.json`.

The initial nine public masters were generated locally from those original briefs with **ACE-Step 1.5 / `acestep-v15-turbo`** on Apple Silicon, using no source audio or existing-song reference. Each sidecar records the deterministic seed, generator Git revision and model-weight hashes, source-FLAC hash, final MP3 hash, mastering target, and measured loudness/true-peak QC.

The reproducible local path is `scripts/generate-site-original-ost-acestep.py`; generated sidecars are unapproved unless `--approve-generated` is explicit. The repository also retains the Eleven Music v2.5 production path in `scripts/generate-site-original-ost.mjs`. Its C2PA-requested provenance remains distinct from ACE-Step's local-generation record; the runtime accepts either only when the matching integrity gate is satisfied.

See `docs/AUDIO-ASSETS.md` for release policy and provenance details.
