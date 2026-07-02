# Audio assets

## ToonSpectrum anime vocal opening

- App path: `/audio/toonspectrum-anime-vocal-opening.mp3`
- Source title: `anime`
- Creator: `PuyoPuyoMegaFan1234`
- Source: https://pixabay.com/music/upbeat-anime-239882/
- License: Pixabay Content License — https://pixabay.com/service/license-summary/
- Source metadata: AI-generated, J-pop/anime, female vocal, 3:40
- Downloaded: 2026-06-29
- SHA-256: `5910ba032e27c4d93e3e2e64c41e65d7beaaf9fe9d05b17207c1c2dc34f6a181`

The track is embedded as part of ToonSpectrum's interactive product experience. It is not
offered as a standalone audio product. Attribution is not required by the license, but source
and provenance are retained here for maintenance and release review.

The Toss build no longer bundles a copy of the audio files — the WebView loads them from
the deployed web origin (see "Playlist manifest" below), which keeps the `.ait` bundle slim.
The procedural Web Audio soundtrack remains the runtime fallback.

## Boom! Goes My Heart (Kpop Version)

- App path: `/audio/boom-goes-my-heart-kpop.mp3`
- Source title: `Boom! Goes My Heart (Kpop Version)`
- Creator: `Sekuora`
- Source: https://pixabay.com/music/pop-boom-goes-my-heart-kpop-version-242507/
- License: Pixabay Content License — https://pixabay.com/service/license-summary/
- Source metadata: K-pop, vocal
- Downloaded: 2026-07-02
- SHA-256: `8b7f645bd3d40260d0e569cdae02adf04c4fd903e79618f509d826d387c885dd`

## 설레나요

- App path: `/audio/seollenayo.mp3`
- Source title: `설레나요`
- Creator: `옴택`
- Source: https://pixabay.com/music/pop-설레나요-227248/
- License: Pixabay Content License — https://pixabay.com/service/license-summary/
- Source metadata: K-pop/Korean pop, vocal
- Downloaded: 2026-07-02
- SHA-256: `fcf7edd5692eba95820b662234d465a9276df3be9d385d600191e9dedfbaf15c`

## Playlist manifest

Tracks are registered at boot from `public/audio/playlist.json`
(schema `{ tracks: [{ src, title, artist, license, creditUrl }] }`) by the shared
`AppShell`. The Toss WebView (cross-origin) loads both the manifest and the mp3 files
from the deployed web origin via `resolveAssetUrl` (`/audio/*` serves CORS headers —
see `vercel.json`). If the manifest fails to load, a built-in fallback registers the
vocal opening; if a track fails to play, the procedural Web Audio soundtrack remains
the final fallback.
