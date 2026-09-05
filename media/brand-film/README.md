# ToonStudio Remotion brand film

A deterministic, silent 24-second brand film using original repository artwork and four six-second chapters. This is an illustrative introduction, not a recording of the live editor.

## Reproduce

Use Node 24 and install Korean system fonts (`fonts-noto-cjk` on Ubuntu). Run `npm --prefix media/brand-film ci`, then `npm --prefix media/brand-film run typecheck` and `npm --prefix media/brand-film run render -- all`. The first render may download Chrome Headless Shell through Remotion. `landscape`, `portrait` or `square` may be selected instead of `all`.

Outputs live in `public/brand`: three H.264 MP4s (1280×720, 720×1280, 1080×1080), poster JPG, 1200×630 sharing PNG, KO/EN VTT, and SHA-256 manifest. A selected-format run replaces that rendition and refreshes poster/sharing artwork; untouched rendition entries continue to describe the previously generated files.

`npm --prefix media/brand-film run studio` opens the Remotion editing preview. The website does not import this package or Remotion runtime. System fonts are build dependencies and are not shared as font files.

## Rights and review

Remotion has separate licensing conditions for individuals, small teams and larger companies. Review https://www.remotion.dev/docs/licensing for the organization operating this pipeline; this repository does not assert a paid license or universal free commercial use. Scene SVG is original authored illustrative artwork. No stock-photo, music or external user-artwork licenses are implied.

Inspect each rendition for legible Korean text and layout before release. The canonical CI checks duration, dimensions, codec, hashes, playback and responsive homepage behavior; visual review remains useful in addition to automated checks.
