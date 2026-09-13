# ToonStudio — Ink Panel icons

The original ToonStudio mark combines a persimmon comic panel/speech balloon with a paper-coloured pen nib on warm ink. The large silhouette, generous slit and three flat colours are intentional: no lettering, glow, thin panel grids, embedded raster images, fonts, external assets or animation at favicon sizes. This is a hand-authored vector, not a third-party icon dependency.

`apps/web/public/favicon.svg` is the source of truth. The static icon palette uses sRGB fallbacks to the warm-ink/persimmon design direction for image renderer compatibility; site theme tokens are unchanged. The rounded background gives the mark a visible boundary on light browser chrome while the persimmon panel remains visible on dark chrome.

## Outputs and integration

- SVG plus 32/96 px PNG and a 16/32/48 px ICO for tabs, bookmarks and high-density surfaces.
- Opaque 192/512 px PNGs for PWA installation and an opaque 180 px Apple touch icon. Regular and maskable entries deliberately share the same safe artwork; the browser chooses their placement through separate purpose declarations.
- Monochrome Safari pinned-tab silhouette with a negative-space nib, not a solid background square.

Maskable artwork is scaled to 76% around the centre. Every non-background pixel is tested against the central circle of radius 40% of the full image width. The opaque background reaches the image edges; the operating system applies the final mask. `purpose: any` and `purpose: maskable` remain separate.

All icon references and the manifest link use `?v=ink-panel-v1`. Future visual revisions must update the revision in both the HTML/manifest and the verifier. The PWA `id`, start URL, shortcuts, screenshots, SEO, Open Graph, fonts, bootstrap scripts and Studio runtime remain unchanged. Existing root icon URLs still resolve to the new artwork.

## Regenerate and verify

Developer-only dependencies: Python 3.10+, CairoSVG 2.8.2, Pillow 12.3.0 and system Cairo. They are not added to the web app, CI installation or production build. Run the generator in a development environment that already has these tools; commit its generated files.

```sh
python scripts/generate-brand-icons.py
python scripts/generate-brand-icons.py --check
node scripts/verify-brand-icons.mjs
pnpm exec vitest run scripts/verify-brand-icons.test.mjs
```

The dependency-free Node verifier also runs through the existing Vitest collection. It checks all PNG signatures/chunk CRCs/palettes/decoded dimensions, artwork colour coverage, 16/32/48 ICO frames, opaque install icons, circular safe zones, vector size and self-containment, HTML link precedence, and manifest roles/revisions. It intentionally accepts only the generator's 8-bit indexed PNG encoding, so a future encoding change must update the decoder too.

Before merging, visually review the mark at 16, 24, 32, 48, 64 and 128 pixels on both light and dark backgrounds, and review circular and squircle installation crops. These checks validate assets and declarations; they do not claim that every browser or an existing installed PWA has refreshed its cached icon. Main-branch merge and production deployment are separate verification steps.
