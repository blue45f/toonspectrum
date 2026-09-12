# Public webtoon atelier

The public site now introduces ToonStudio as a professional workspace for drawing webtoons. The journey connects references, linework and color, panels and dialogue, materials, and sharing. Studio routes and editor implementation are outside this change.

## Surfaces

- Home: professional Studio entry, optional Simple Mode, keyboard-controlled value/color comparison, pausable artwork motion, illustrated tools, process imagery, and existing search, local readiness and brand film.
- Research: shared illustrated resource layout and interactive observation lenses with real search destinations.
- Learn: drawing process study alongside existing progress, lessons and records.
- Market: illustrated material selection, existing family/genre resources and real browse filters.
- Showcase: three-panel visual storytelling introduction, existing work/series/following feeds, and links back into production.
- Discover, Community, About, Help, Contact and Support: contextual artwork, webtoon-focused guidance, existing data/forms, and connected next steps.
- Shared public header/footer: creation journey and webtoon drawing identity. New presentation is guarded away from `/studio`.
- Search/social metadata: Korean webtoon drawing positioning; JSON-LD CSP hash updated for the exact data block.

## Media

Three original images were generated with the built-in image generation tool and encoded as 1536 × 1024 WebP. Full prompts and intended usage are recorded in `apps/web/public/brand/atelier-manifest.json`.

| Asset | Purpose | Bytes |
| --- | --- | ---: |
| `atelier-world.webp` | Webtoon world and composition study | 424824 |
| `atelier-process.webp` | Sketch, ink and color process | 485366 |
| `atelier-materials.webp` | Drawing material and texture study | 485414 |

These images are labeled brand concept art. They are not represented as screenshots, exported Studio artwork, actual marketplace inventory, or community submissions. The existing 24-second film retains user-initiated loading, captions, chapter navigation, error recovery and downloads.

## Verification

- Application and API typecheck passed.
- Changed-file lint and architecture validation passed.
- Homepage, artwork interactions, navigation and continuity: 13 Vitest suites / 83 tests passed.
- Existing research, learning and market coverage: 8 suites / 45 tests passed.
- Updated flagship Playwright suite: 7 tests passed against the production bundle.
- Public page browser matrix: 13 routes × 1440/390/320px, 39 checks passed; one visible primary heading, no page overflow or uncaught errors, loaded hero art, and real drawing entry points.
- Additional Korean/English visual inspection covered homepage and six support/discovery pages; image comparison, motion pause, reduced-motion, menu Escape/focus, help search, and search query preservation passed.
- Existing purpose, fragment/history navigation, continuity and film browser scripts passed after aligning their selectors with the current page and preventing the test seed from overwriting saved state on reload.
- Source and built HTML CSP verification passed.

Screenshots and the matrix report are generated under `artifacts/public-webtoon-experience/`. Run `PUBLIC_WEBTOON_ORIGIN=http://127.0.0.1:5281 node scripts/verify-public-webtoon-experience.mjs` against a production preview to reproduce the matrix.

The page checks verify frontend behavior, including the existing failure and empty states. They do not establish availability of external providers, successful publication/payment, or durable backend writes. GitHub checks and merge state remain the release authority.
