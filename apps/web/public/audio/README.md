# ToonSpectrum Original OST assets

This directory is reserved for reviewed **ToonSpectrum original** soundtrack releases.

- `playlist.json` contains only provenance-backed, approved originals.
- Generated masters live under `original/` and are not published merely because generation succeeded.
- The previous licensed reference demos were removed on 2026-09-18.
- The global player does not fall back to those references or to browser-synthesized placeholder music.
- Until a reviewed original exists, the site intentionally remains silent.

Production briefs and original lyrics live in `config/site-original-ost.production.json`.
Use `scripts/generate-site-original-ost.mjs` to dry-run, generate, review and publish Eleven Music v2.5 assets.
See `docs/AUDIO-ASSETS.md` for the release gate, provenance schema and adaptive playback policy.
