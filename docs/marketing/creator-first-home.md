# ToonStudio creator-first homepage

## Product decision

The primary public identity is ToonStudio: a browser creative workspace. Ranking and discovery remain supported secondary journeys, not the homepage hero. The change is confined to the marketing route and shared shell, not a second studio or rewrite of editor internals.

Primary conversion: open `/studio`. Secondary conversion: play the introduction film, start `/studio/comic`, explore `/shaper` or `/market`. Existing creators use `/create`; readers retain `/explore` and `/ranking`. The desktop sitemap and complete mobile menu retain the old destinations.

## Information architecture

1. One H1: 아이디어를 첫 장면으로. Primary studio CTA and user-initiated film CTA.
2. Illustrative creative workspace with three selectable workflow previews.
3. Drawing → story panels → space: stage explanation and relevant entry links.
4. Four tool cards: draw, comic, 3D planning, assets.
5. Real 24-second Remotion brand film, chapter seeking, captions, transcript.
6. Creator gallery and existing reader discovery.
7. Four native expandable FAQ answers and a final creation CTA.

No invented subscriber counts, endorsements, conversion metrics, free-plan claims or guaranteed creative outcomes. Artwork and film are explicitly described as workflow illustrations, never as actual user work or a real editor capture. The examples are original in-repository SVG artwork; no competitor screenshots or scraped artwork are distributed.

## Visual system

Warm paper, dark green ink, muted sage and a restrained lime highlight. Spacious editorial typography instead of dense ranking rows. The preview uses a clear window frame, canvas, decorative tools and layers; only genuine controls look actionable. One functional primary button style. CSS is scoped under `.creator-home`, with mobile 320–767px, tablet and desktop layouts and a user-selected dark theme.

The homepage owns Korean and English text. Other selected languages explicitly fall back to English and the subtree has `lang=en`; it does not claim full translation. Shared brand/navigation keys retain dictionary parity across locales.

## Accessibility and performance

A single existing AppShell main landmark is retained; no nested main. Visible keyboard focus, native links/buttons/details, pressed states for workflow selectors, polite stage updates, descriptive media labels, KO/EN captions and readable transcript. User activation is required before mounting the video. Native play/pause/seek controls remain available. Returning to the poster unmounts/stops the video. Errors show recovery and the studio CTA is still usable. Reduced-motion removes decorative transitions. Illustrative toolbar controls are not focusable.

The marketing route is lazy-loaded. No Remotion player, renderer, studio engine or additional runtime dependency is imported into the homepage. A same-origin MP4 is loaded only after interaction. Same-origin video/illustrations avoid third-party tracking iframes and additional CSP origins. Fonts reuse existing web assets; CI font packages are not redistributed.

## Video and operations

`media/brand-film` is an isolated npm project pinned to Remotion 4.0.514. Four compositions use deterministic frame animation: landscape, portrait, square, and a sharing-image composition. Three 24-second H.264 MP4s, a poster, an OG image and a hash manifest are produced by `render.mjs`. No voice/music is asserted: this is a silent typographic/illustrative brand film with caption alternatives.

`creator-brand-film.yml` produces reviewable Actions artifacts, never automatically publishes or mutates main. The n8n export is inactive and contains no secrets. It requests the fixed renderer workflow on main through a configured GitHub credential and reports accepted, not completed. See the automation README for deployment prerequisites and permission boundaries.

## Quality gates and acceptance

Existing protected `core` remains unchanged. Additional homepage quality executes content contracts, n8n validation/security contracts, real production bundle browser tests at 320/390/820/1440px, Korean/English, light/dark, keyboard navigation, error recovery, no initial video request, and H.264 decode/play/seek/stop. ffprobe checks video duration and dimensions, SHA-256 verifies checked-in media against the manifest, and screenshots/report are CI artifacts.

CI screenshots and reports are evidence only after the corresponding run succeeds. This document is a design/acceptance specification, not a claim that all tests or deployment have completed.

## Sources

- https://www.remotion.dev/docs/brownfield-installation — separate composition entry and CLI rendering.
- https://www.remotion.dev/docs/render — rendering options and output.
- https://www.remotion.dev/docs/licensing — check organizational licensing before commercial operation.
- https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/ — authenticated HTTP integration.
- https://docs.n8n.io/integrations/builtin/credentials/github/ — GitHub credentials.

## Rollback

Revert the marketing feature PR as a unit. Old catalog HomePage remains in source. Ranking, search and studio routes were not deleted, and no database migration, secret change or studio document schema change is part of this feature.
