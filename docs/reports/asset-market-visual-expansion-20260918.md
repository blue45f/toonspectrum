# Asset workspace & marketplace visual expansion — 2026-09-18

## Goal

Raise the visual quality floor of Studio asset discovery and Marketplace without replacing source-of-truth previews with decorative mock art.

## Studio asset workspace

- Restored the missing real `fantasy_tavern` scene-template entry, so the 3D insert catalog now covers every shipped BG scene template.
- Replaced the editable speech-bubble tool's generated fallback poster with a product-owned SVG preview.
- Rich 3D previews remain WebGL/source-truth previews: GLB, procedural geometry and real scene templates are not replaced by fake generated thumbnails.
- The focused unified-preview audit now reaches 100% visual coverage in the tool/template contract instead of counting a generated poster fallback.

## Marketplace source expansion

The strict reviewed CC0 Marketplace fallback catalogue now grows from **100 to 338 market-ready source assets** selected from the 1,427-entry visually reviewed CC0 manifest:

- **39** high-resolution backgrounds;
- **71** transparent 2D prop renders;
- **50** detailed PBR GLB models that pass both browser-render and Studio-runtime verification;
- **82** production surface textures;
- **96** transparent effect masks.

Marketplace admission is no longer a fixed hand-picked ID list. It is derived from visual-review evidence, finished-asset role, runtime verification and per-kind quality floors, while quarantined/assembly-only assets remain excluded. The generated fallback catalogue is deterministic and preserves real provider/source metadata.

## Marketplace card quality

- Brushes render multiple strokes from the actual brush preview data rather than a generic placeholder stroke.
- Filters use a real high-resolution ToonSpectrum scene in a before/after split with the actual filter values.
- Templates render layout-aware 4-cut, vertical-scroll or panel-grid previews.
- Procedural 3D recipes use differentiated technical illustrations and are explicitly labeled as recipes.
- 3D scene presets use real in-repository environment reference thumbnails and are explicitly labeled as scene references.
- Verified CC0 records continue to overlay the actual pinned source preview, which always wins over decorative fallbacks.

## GPT Image 2.5 legacy background batch

The 20 legacy portrait backgrounds that previously used 627×940 JPEGs now have reviewed 1152×2048 PNG replacements. The original stable IDs are preserved, while each ID resolves to its new generated binary in the active Studio catalog.

Each replacement has a deterministic source manifest with prompt hash, output SHA-256 and byte size. The 20 assets are marked `full-image / usable / recommended`, contain no characters or readable text, and the old small-panel-only metadata is removed from the active quality registry. Only four unrelated legacy compatibility backgrounds remain outside the default picker.

The replacement contract now verifies all 20 output files are real PNGs, exactly 1152×2048, and match the recorded byte count and SHA-256. Existing documents that reference the preserved legacy IDs therefore receive the upgraded background without an ID migration.

## Final curation completion — 2026-09-18

The repository-wide completion pass keeps small assets when their role requires them instead of treating pixel size alone as a quality defect. The strict visual audit reports 86 sub-256px rasters, all accounted for by compact CC0 thumbnails, Android density-specific launcher/splash assets, PWA/brand icons, or test golden images.

The 20 obsolete 627×940 legacy Studio backgrounds had both JPG and PNG compatibility binaries tracked. Their 40 binaries (**3.96 MiB**) are now removed because the same stable scene IDs resolve to reviewed 1152×2048 GPT Image 2.5 replacements. Runtime source search found no live source reference to the deleted binaries, and the 20/20 replacement contract still verifies generated output dimensions, byte counts and SHA-256.

All **53/53 scene templates** now expose at least two reviewed high-quality background recommendations. Unified asset search carries the relationship in both directions: templates surface recommended backgrounds, and backgrounds expose linked templates.

Validation for this completion pass:

- focused Studio asset regression: **5 files / 511 tests passed**;
- tracked visual audit: **2,485 visual files**, **0 visual gate violations**;
- deep format audit: **2,483 raster/SVG files**, **0 unexpected extension/MIME mismatches**;
- active VRM thumbnails: **88/88 >= 768px**;
- Studio legacy image manifest audit: **9 originals / 0 errors / 0 small originals**;
- curated CC0 background manifest audit: **28 assets / 0 errors**;
- Studio asset workspace: **456 real visual assets / 100% non-tool preview coverage**;
- Marketplace CC0 catalogue regeneration: deterministic, **338** market-ready sources;
- pre-commit ESLint + secret scan: pass.

The repository-wide TypeScript and Vite bundle gates remain blocked by unrelated failures already present on the current `main`. A clean TypeScript replay reports no diagnostics in any TS/TSX/MTS file changed by this branch; the bundle reaches duplicate declaration/import failures in unrelated legal/i18n and Studio-shell sources. Those files are unchanged by this curation branch, while the asset-specific tests and audits above pass.


## Post-curation hardening — 2026-09-18

The follow-up pass converts the remaining cleanup work into repeatable quality gates instead of one-off manual decisions.

- Creator Essentials pose entries now share one source-of-truth hero preview between matching 2D turnaround and 3D mannequin records. Eight duplicate SVG aliases were removed without changing the public manifest IDs or pose content.
- The repository-wide visual audit now classifies exact duplicate groups. On the current main-derived tree it reports **2,451 tracked visual assets**, **28 exact-duplicate groups / 68 files**, and **0 unexpected duplicate groups**. The remaining duplicates are explicit Android/iOS splash contracts, install/brand aliases, legacy background URL compatibility, or one reviewed assembly-model preview collision.
- Four legacy Studio backgrounds (`webtoon-cafe`, `webtoon-classroom`, `webtoon-corridor`, `webtoon-street`) remain outside the default picker because their provenance is still unverified and their content contains people and/or text. Their compatibility paths are retained for previously saved documents instead of deleting a live legacy contract.
- All **1,427** reviewed CC0 records are now classified: **334 Marketplace-ready**, **4 Studio-only finished assets**, **291 Studio assembly components**, and **798 runtime-pending 3D models**. There are no unclassified or review-pending records.
- Marketplace similarity auditing evaluates the **338** policy-qualified candidates in a real Chromium image decoder using dHash, aHash and a 16×16 luminance/alpha signature. Five near-duplicate relationships collapse four effect-mask aliases (`star-02`, `trace-02`, `trace-02-rotated`, `trace-03`) onto retained canonical siblings. The final **334** Marketplace records contain no unresolved near-duplicate pairs at the committed thresholds, and every exclusion is anchored to a retained canonical asset.
- CC0 parsing now binds the known provider name to its official hostname and validates the canonical CC0 license URL plus optional review date shape, preventing a trusted provider label from being paired with another host.
- The generated Marketplace CC0 catalogue is isolated into its own named bundle chunk and excluded from entry-document modulepreload so unrelated routes do not eagerly prioritize the ~300 KiB source data leaf.

These gates are available through `pnpm run verify:asset-postcuration` and are backed by the focused Studio/Marketplace regression suite.
