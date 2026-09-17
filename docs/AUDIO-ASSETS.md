# Audio assets

## ToonSpectrum anime vocal opening

- Web path: `/audio/toonspectrum-anime-vocal-opening.mp3`
- Source title: `anime`
- Creator: `PuyoPuyoMegaFan1234`
- Source: https://pixabay.com/music/upbeat-anime-239882/
- License: Pixabay Content License — https://pixabay.com/service/license-summary/
- Source metadata: AI-generated, J-pop/anime, female vocal; licensed 15-second site excerpt, delivered as 256 kbps MP3
- Downloaded: 2026-06-29
- SHA-256: `2c2bf9665778d507f2cf93d1bc6d19901ef91cb0e41d2c31f3a0e593450ba2fd`

The track is embedded as part of ToonSpectrum's interactive product experience. It is not
offered as a standalone audio product. Attribution is not required by the license, but source
and provenance are retained here for maintenance and release review.

Audio files are served from the deployed web origin instead of being duplicated in JavaScript
bundles (see "Playlist manifest" below). The procedural Web Audio soundtrack remains the runtime
fallback.

## Boom! Goes My Heart (Kpop Version)

- Web path: `/audio/boom-goes-my-heart-kpop.mp3`
- Source title: `Boom! Goes My Heart (Kpop Version)`
- Creator: `Sekuora`
- Source: https://pixabay.com/music/pop-boom-goes-my-heart-kpop-version-242507/
- License: Pixabay Content License — https://pixabay.com/service/license-summary/
- Source metadata: K-pop, vocal
- Downloaded: 2026-07-02
- SHA-256: `8b7f645bd3d40260d0e569cdae02adf04c4fd903e79618f509d826d387c885dd`

## 설레나요

- Web path: `/audio/seollenayo.mp3`
- Source title: `설레나요`
- Creator: `옴택`
- Source: https://pixabay.com/music/pop-설레나요-227248/
- License: Pixabay Content License — https://pixabay.com/service/license-summary/
- Source metadata: K-pop/Korean pop, vocal
- Downloaded: 2026-07-02
- SHA-256: `fcf7edd5692eba95820b662234d465a9276df3be9d385d600191e9dedfbaf15c`

## Playlist manifest

The site-wide page soundtrack player reads `public/audio/playlist.json`
(schema `{ tracks: [{ src, title, artist, license, creditUrl }] }`) only after the listener
explicitly selects the **Vocal OST** source. The default source is the page-aware procedural
Web Audio catalog, so no large audio file is downloaded and no audio starts without consent.

Manifest entries are restricted to reviewed same-origin `/audio/*` files with HTTPS credit
links. `/audio/*` response headers are generated from `config/http-response-headers.json`.
If the manifest or a track fails, the player returns to the procedural route theme. Audio
creation, animatic, game, message, and live-call routes temporarily suspend the site soundtrack
without clearing the listener's saved opt-in.
## Site-wide soundscape runtime

The floating player is lazy-loaded from the global application shell. Music is off by default;
a listener must press play before the browser audio context is resumed. The player remembers
its source, page-following preference, expanded state, opt-in, mute state, and a BGM-only volume
that does not change notification or interface effects.

Public and project pages resolve into route themes such as creator focus, worldbuilding,
production drive, catalog discovery, city pop, creator café, asset market, study ambience,
royal fantasy, mystery, and healing. Page transitions crossfade instead of restarting the global
audio graph. A listener can disable automatic page following and choose any procedural theme.

Admin, account, login, game, message, live-call, audio creation, promo/animatic, spatial-reader,
and immersive editor routes suspend the soundtrack while preserving the opt-in. Returning to a
compatible page resumes it only when the listener had previously enabled music. Hidden tabs also
pause playback for battery and attention safety.
