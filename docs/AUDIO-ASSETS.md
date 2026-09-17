# Audio assets

## Licensed anime opening reference

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

The site-wide player reads `public/audio/playlist.json` with role-aware metadata:
`id`, `src`, `title`, `artist`, `role`, `origin`, `vocalMode`, `language`, `summary`, `license`, and
`creditUrl`. New listeners enter the **Original anime OST** source by default, but playback still
requires an explicit user gesture. The route resolver chooses an opening, creator, story, action,
romance/character, or ending role and always prefers a reviewed `origin: "original"` track.

The three checked-in tracks documented above are `origin: "licensed-reference"` fallbacks. They
are intentionally presented as **REFERENCE DEMO**, never as ToonSpectrum-authored songs. Until a
reviewed original is published for a role, the player may use the matching reference track; users
can switch to the procedural **Focus instrumental** source at any time.

Manifest entries are restricted to reviewed same-origin `/audio/*` files with HTTPS credit
links. `/audio/*` response headers are generated from `config/http-response-headers.json`. If the
manifest fails, the player returns to the procedural instrumental engine. Audio creation, animatic,
game, message, and live-call routes temporarily suspend the site soundtrack without clearing the
listener's saved opt-in.
## Site-wide soundscape runtime

The floating player is lazy-loaded from the global application shell. Music is off by default;
a listener must press play before the browser audio context is resumed. The player remembers
its OST/instrumental source, role-following preference, expanded state, opt-in, mute state, and
an OST-only volume that does not change notification or interface effects. Legacy `page-theme`
preferences migrate to `focus-instrumental`; legacy `vocal-ost` preferences migrate to the new
`original-ost` experience.

Public and project pages resolve into route themes such as creator focus, worldbuilding,
production drive, catalog discovery, city pop, creator café, asset market, study ambience,
royal fantasy, mystery, and healing. Page transitions crossfade instead of restarting the global
audio graph. A listener can disable automatic page following and choose any procedural theme.

Admin, account, login, game, message, live-call, audio creation, promo/animatic, spatial-reader,
and immersive editor routes suspend the soundtrack while preserving the opt-in. Returning to a
compatible page resumes it only when the listener had previously enabled music. Hidden tabs also
pause playback for battery and attention safety.
