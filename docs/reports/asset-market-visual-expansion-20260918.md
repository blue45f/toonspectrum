# Asset workspace & marketplace visual expansion — 2026-09-18

## Goal

Raise the visual quality floor of Studio asset discovery and Marketplace without replacing source-of-truth previews with decorative mock art.

## Studio asset workspace

- Restored the missing real `fantasy_tavern` scene-template entry, so the 3D insert catalog now covers every shipped BG scene template.
- Replaced the editable speech-bubble tool's generated fallback poster with a product-owned SVG preview.
- Rich 3D previews remain WebGL/source-truth previews: GLB, procedural geometry and real scene templates are not replaced by fake generated thumbnails.
- The focused unified-preview audit now reaches 100% visual coverage in the tool/template contract instead of counting a generated poster fallback.

## Marketplace source expansion

The reviewed CC0 Marketplace registry grows from **14 to 100 distinct source assets**:

- 28 high-resolution backgrounds, generally 2048×1152;
- 24 transparent 2D prop renders, 1536×1536;
- 24 actual PBR GLB models with integrity and mobile-budget validation;
- 12 production surface textures, typically 2K;
- 12 transparent effect masks for fire, smoke, magic, sparks and action accents.
The fallback catalogue is intentionally round-robin ordered across background, 2D prop, 3D PBR, material and effect sources, so an empty/offline Marketplace shows useful variety on its first page instead of one homogeneous asset class.

Marketplace records now retain the real provider (`Poly Haven` or `Kenney`) and describe each source accurately. Surface textures and effect masks are no longer mislabeled as transparent 2D prop renders.

## Marketplace card quality

- Brushes render multiple strokes from the actual brush preview data rather than a generic placeholder stroke.
- Filters use a real high-resolution ToonSpectrum scene in a before/after split with the actual filter values.
- Templates render layout-aware 4-cut, vertical-scroll or panel-grid previews.
- Procedural 3D recipes use differentiated technical illustrations and are explicitly labeled as recipes.
- 3D scene presets use real in-repository environment reference thumbnails and are explicitly labeled as scene references.
- Verified CC0 records continue to overlay the actual pinned source preview, which always wins over decorative fallbacks.

## GPT Image 2.5 legacy background batch

The remaining 20 legacy portrait backgrounds are 627×940 JPEGs, with `.png` aliases that contain the same JPEG bytes. Their target recipes are already pinned to `gpt-image-2.5-sunburst`, `quality: max`, 1152×2048 PNG output, text/logo-free constraints and deterministic source manifests.

The generator and runtime migration are prepared, but generated binaries must not be faked. The batch is only complete after a secure provider key is available in the execution environment, all 20 PNGs pass dimension/format review, and the compatibility IDs are redirected to the new binaries so old documents also receive the quality upgrade.
