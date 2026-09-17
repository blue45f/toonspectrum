# Site OST assets

The global player is now designed around a **ToonSpectrum original anime OST** experience:
opening, ending, creator, story, action, and character-song roles. The default listener source
is `original-ost`; the procedural Web Audio engine remains available as `focus-instrumental`.

`playlist.json` contains role-aware metadata (`id`, `src`, `title`, `artist`, `role`, `origin`,
`vocalMode`, `language`, `summary`, `license`, `creditUrl`). Runtime selection always prefers an
`origin: "original"` track for the current page role before using a licensed reference fallback.

The three audio files currently checked into this directory are **licensed reference demos**, not
ToonSpectrum-authored songs. The UI labels them `REFERENCE DEMO` and preserves their actual artist,
license, and source. Do not rename or present them as ToonSpectrum originals.

A generated or commissioned ToonSpectrum song should be published with `origin: "original"` only
after its creation provenance and commercial-use rights have been reviewed. See
`docs/AUDIO-ASSETS.md` for provenance and release notes.
