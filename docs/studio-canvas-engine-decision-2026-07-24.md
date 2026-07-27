# Studio canvas engine decision — 2026-07-24

> **Superseded for the long-term target:** See
> `studio-browser-native-engine-vnext-2026-07-27.md`. Konva remains the shipping recovery
> authority during the staged migration, but it is no longer the final engine authority.

## Question

Should ToonSpectrum Studio replace the Konva/react-konva editor body with a ready-made whiteboard (Excalidraw, tldraw) or another canvas stack (Fabric, p5, Pixi)?

## Short answer

**No.** Keep Konva as the durable scene + interaction authority. Do not swap the product body for a whiteboard shell.

## Library map (product fit)

| Library | Rendering | Best fit | Studio body? |
| --- | --- | --- | --- |
| Excalidraw | Canvas / SVG | Collaboration whiteboard, idea sketch | No — hand-drawn chrome, not plate/layer CSP |
| tldraw | Canvas / SVG | Infinite-canvas design app from scratch | No — full product engine replace, months of rework |
| Fabric.js | HTML5 Canvas | Photo/goods editors, object pick/transform | No — duplicates Konva without CRDT/mask/stack gains |
| **Konva.js** | HTML5 Canvas | High-perf layers, mobile touch, React binding | **Yes — current + keep** |
| p5.js | HTML5 Canvas | Interactive art, teaching loops | Optional FX only |
| PixiJS | WebGL 2D | Mass particle/brush performance | Optional GPU brush path only |

## Hybrid policy (already aligned with architecture docs)

1. **Konva** — committed elements, transformers, layer navigator, masks, export capture fallback.
2. **Canvas2D live ink residual** — low-latency freehand while drawing.
3. **Optional WebGPU pin** — verified live/raster presentation; never sole authority without Konva fallback.
4. **Whiteboard kits** — only as a future isolated annotation/sketch surface if product asks; never the document model.

## Residual implication

Finite CSP residual work continues on pure modules + StudioPage/Inspector glue (e.g. layer solo on `localHidden`). Engine replacement is multi-year deferred, not a next finite slice.
