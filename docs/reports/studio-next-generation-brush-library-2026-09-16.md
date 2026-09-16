# Studio next-generation brush library — 2026-09-16

## Production incident

The complete production brush picker exposed the classic safe catalogue, but Brush Studio V6 kept
its 58 executable material recipes inside the separate recipe shelf. Artists could create and save
those brushes, yet the built-in full library, search, favorites, recents, and quick shelf had no
shared V6 catalogue identity. The engine existed; product discovery did not.

## Corrected product inventory

| Surface | Count | Contract |
| --- | ---: | --- |
| Classic selectable catalogue | 227 | Quality-first safe core and procedural identities |
| V6 material recipes | 58 | Exact no-fallback material programs |
| Artist-facing total | 285 | Classic catalogue plus every V6 recipe |
| Paint brushes | 283 | 225 classic paint brushes plus 58 V6 recipes |
| Erasers | 2 | Existing operation-separated eraser tools |

## Product behavior

- The full library has an early `차세대` lane and keeps `전체` near favorites and recent history.
- Global search discovers V6 recipes by Korean name, purpose, recipe group, runtime node, and engine
  provider terms such as WebGPU, Hokusai, libmypaint, Krita, and Mixbox.
- V6 favorites and recent selections resolve through the same deferred catalogue as procedural
  favorites, including the compact quick shelf.
- Selecting a V6 row produces a versioned material-program receipt with `fallbackPolicy: none`.
  Apply, brush slots, saved brushes, default restore, and Brush Lab preserve that exact receipt.
- Visible V6 tiles render the actual material recipe instead of a generic decorative SVG.

## Performance discipline

- Catalogue metadata remains static and lightweight; engine construction is dynamically imported.
- Selection payloads are cached by catalogue id, so repeated favorite/recent selection reuses the
  exact immutable object.
- Real material previews load only when a tile approaches the viewport through IntersectionObserver.
- The picker retains 48-row progressive batches and `content-visibility` containment.
- Search filtering and favorite membership are memoized on the library surface.

## Verification

- V6 material quality verification: 58/58 recipes rendered, 0 failures.
- Brush and Brush Studio regression suite: 281 test files, 3,005 tests passed.
- Focused product integration suite: 7 test files, 90 tests passed.
- TypeScript project check passed with no diagnostics.
- Changed-file ESLint passed with zero warnings.
- Architecture validation and `git diff --check` passed.
- Production Vite bundle and post-build verification passed.

These receipts prove product reachability, exact no-fallback execution, persistence, real-preview
wiring, and regression coverage. They do not constitute an independent absolute-quality win over
another drawing product without a fixed device, stylus, canvas, brush set, and blind comparison.
