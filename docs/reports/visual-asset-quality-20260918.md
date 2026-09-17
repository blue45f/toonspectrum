# ToonSpectrum visual asset quality audit — 2026-09-18

## Scope

This pass treats visual quality as a product-system concern instead of blindly replacing every image or SVG. Repository-wide tracked visual files, inline SVG usage, OS-emoji catalogue rendering, production 3D thumbnails, Creator Essentials pose previews, and legacy Studio background replacement paths were reviewed together.

- tracked visual assets: **2,429** (`1,495 PNG`, `401 JPG`, `444 WebP`, `87 SVG`, `2 ICO`)
- exact duplicates: **43 groups / 90 files**; duplicates remain when paths are intentional compatibility aliases
- inline SVG: **271 occurrences / 154 files**
- SVGs missing `viewBox`: **0**
- SVGs embedding raster images: **0**
- active VRM production thumbnails at least 768px: **88 / 88**
- deep file audit: **0 unexpected extension/MIME mismatches**

## Production fixes

### 3D character and avatar catalogue

The preceding visual-quality PR re-rendered **83** previously low-resolution active VRM thumbnails from the actual source models at **768×768**, moved production references to `refined-v2`, and fixed Avatar Forge hair preview regressions including indistinguishable short/pixie and long/hime silhouettes plus residual bangs for `hair:none`.

This completion pass extends the same quality rule to the remaining catalogue surfaces:

- expression preset cards now use deterministic product-owned SVG previews derived from their actual blendshape weights instead of OS emoji;
- scene-prop cards now use product-owned vector previews rather than platform-dependent emoji glyphs;
- scene props with catalogue metadata but no matching 3D renderer are no longer shown as selectable promises;
- the audit gate fails if expression or scene-prop catalogue UI regresses to direct OS-emoji rendering.

### Character Shaper and Creator Essentials

- Character Shaper now follows the same hairless contract as Avatar Forge: `style:none` cannot retain a selected bang preset.
- All **8 Creator Essentials pose families** use a dedicated rounded vector pose renderer instead of raw low-poly triangle projection.
- Pose previews provide clearer limb hierarchy, joints, facing cues, floor contact, soft shadow, and stable card framing across 2D and 3D variants.

## GPT Image 2.5 replacement path

The repository's production image-generation catalogue targets `gpt-image-2.5-sunburst`, `quality: max`, and 2K-class output sizes. The **20 legacy Studio backgrounds** marked for replacement now have an explicit validated target mapping:

- 19 map to the existing 512-recipe background catalogue;
- 1 city-bedroom gap is supplied by `studio-2d-legacy-gpt25-extra-recipes-v1.json`;
- all 20 enforce no characters, no readable text/logos/watermarks, crop safety, and production output paths;
- `scripts/studio-2d-legacy-gpt25-replacements.test.mjs` validates the complete mapping contract.

The actual 20 generated background binaries are **not** committed in this pass: the repository generator is BYOK and no provider API key is configured in the working environment. Generation is deliberately not faked. Production 3D thumbnails also intentionally use source-of-truth WebGL renders instead of generated character art because the card must match the model the user receives.

## Intentionally retained visuals

Simple vector primitives such as speech balloons, panel frames, speed-line/effect glyphs, brand marks, and editor geometry remain SVG. Their low primitive count is intentional; replacing them with decorative raster art would reduce clarity, scalability, editability, or result fidelity.

Small 384×216 CC0 background thumbnails are retained where they are only used as compact browser cards. At roughly 2× their intended CSS display height, they are not primary-image resolution failures.

## Automated gates

`pnpm audit:visual-assets` now combines:

1. production-UI checks for active VRM thumbnail resolution and direct OS-emoji catalogue regressions;
2. full file-format checks for dimensions, duplicates, format aliases, and unexpected extension/MIME mismatches.

The audit also reports inline SVG and emoji metadata so future visual debt stays visible without treating every intentional symbol as a failure.

## Validation

- repository visual audit: **pass**
- deep asset audit: **2,427 non-ICO visual files**, **0 unexpected MIME mismatches**
- active VRM thumbnails: **88 / 88 >= 768px**
- refined-v2 VRM thumbnails: **83 × 768×768**
- GPT Image 2.5 legacy replacement mapping: **20 / 20 validated**
- focused regression suite: **4 files / 21 tests passed**
- ESLint on changed TypeScript/JavaScript files: **pass**
- Creator Essentials regeneration: **48 assets / 32 SVG / 16 GLB**
- full repository TypeScript check (`tsc -p tsconfig.json --noEmit`): **pass**
- `git diff --check`: **pass**
