/**
 * Brush preset → icon key map (PicsArt/Ibis-style recognition).
 * Pure strings only — Lucide resolution lives in StudioBrushPresetIcon.tsx.
 */
import type { StudioBrushPackCatalogId } from "./studio-brush-pack-id";

export type StudioBrushIconId =
  | "pen"
  | "pen-line"
  | "pen-tool"
  | "eraser"
  | "pencil"
  | "highlighter"
  | "brush"
  | "paintbrush"
  | "paint-roller"
  | "spray-can"
  | "droplets"
  | "blend"
  | "cloud"
  | "cloud-fog"
  | "sparkles"
  | "star"
  | "sun"
  | "circle"
  | "circle-dashed"
  | "circle-ellipsis"
  | "circle-dot"
  | "square"
  | "square-dashed"
  | "rectangle-horizontal"
  | "rectangle-vertical"
  | "waves"
  | "flame"
  | "wind"
  | "grid-3x3"
  | "grid-2x2"
  | "grip"
  | "rows"
  | "align-justify"
  | "fence"
  | "gem"
  | "layers"
  | "spline"
  | "feather"
  | "leaf"
  | "trees"
  | "wheat"
  | "flower"
  | "stamp"
  | "footprints"
  | "heart"
  | "asterisk"
  | "direction"
  | "a-large-small"
  | "default";

/**
 * Procedural catalogue icons describe the expected mark, not the three shared render engines.
 * Keeping this as an exhaustive record makes a newly-added catalogue brush fail type-checking
 * until it receives a deliberate, user-recognisable icon.
 */
export const STUDIO_PROCEDURAL_BRUSH_ICON_BY_ID = {
  // Ink, soft and sketch tips
  "core-round": "circle",
  "crisp-ink": "pen-line",
  "flex-ink": "pen-tool",
  "cloud-soft": "cloud",
  "mist-soft": "cloud-fog",
  "powder-sketch": "circle-dashed",
  "round-sketch": "pencil",
  "fiber-sketch": "feather",
  "precision-pencil": "pencil",
  "comfort-pencil": "pencil",
  "needle-graphite": "pen-line",
  "round-shading": "circle-dot",
  "oval-shading": "circle-ellipsis",

  // Chalk and organic linework
  "chalk-powder": "circle-dashed",
  "chalk-rough": "grip",
  "chalk-compressed": "square-dashed",
  "vine-stroke": "spline",
  "willow-fiber": "feather",
  "velvet-charcoal": "blend",

  // Flat and marker tips
  "line-block": "layers",
  "angular-square": "square",
  "horizontal-blade": "rectangle-horizontal",
  "vertical-blade": "rectangle-vertical",
  "clean-flat": "rectangle-horizontal",
  "scattered-flat": "square-dashed",
  "rhythm-flat": "rows",
  "directional-flat": "direction",
  "classic-marker": "highlighter",
  "fiber-marker": "feather",
  "clean-flat-marker": "rectangle-horizontal",
  "transparent-flat": "blend",
  "hard-oval": "circle-ellipsis",

  // Surface and paint media
  "fabric-texture": "grid-3x3",
  "rough-grain": "circle-dashed",
  "strong-rough-grain": "asterisk",
  "heavy-rough-grain": "square-dashed",
  "bleeding-stain": "blend",
  "sand-texture": "grip",
  "plaster-texture": "layers",
  "rock-texture": "gem",
  "cotton-fiber": "cloud",
  "bumpy-grain": "circle-dot",
  "round-paint": "paintbrush",
  "paint-ink": "brush",
  "paint-roller": "paint-roller",
  "particle-scatter": "spray-can",
  "rough-ink": "pen-tool",

  // Parallel fibres and vegetation
  "fine-rake": "rows",
  "wide-rake": "align-justify",
  "dry-rake": "fence",
  "foliage-texture": "trees",
  "loose-grass": "wheat",
  "dense-grass": "trees",
  "fresh-leaf": "leaf",
  "long-leaf": "feather",
  "round-leaf": "leaf",
  "leaf-cluster": "flower",

  // Pattern and stamp tips
  "free-stamp": "stamp",
  "scattered-oval": "circle-ellipsis",
  "smooth-oval": "circle",
  "layered-oval": "layers",
  "checker-grid": "grid-2x2",
  "hair-fiber": "feather",
  "even-stripe": "rows",
  "rough-stripe": "fence",
  "footstep-stamp": "footprints",
  "heart-stamp": "heart",

  // Extended production media and assistants
  "technical-needle-ink": "pen-line",
  "broken-nib-ink": "pen-tool",
  "side-graphite-shade": "pencil",
  "compressed-charcoal-edge": "square-dashed",
  "watercolor-detail-round": "droplets",
  "watercolor-flat-wash": "blend",
  "opaque-gouache": "paintbrush",
  "oil-filbert": "paintbrush",
  "alcohol-chisel-marker": "highlighter",
  "taper-brush-marker": "feather",
  "pixel-square": "square",
  "pixel-dither": "grid-2x2",
  "cross-hatch": "grid-3x3",
  "speed-hatch": "rows",
  "dense-halftone": "circle-dot",
  "bokeh-scatter": "sparkles",
  "canvas-weave": "grid-3x3",
  "fine-hair-strands": "feather",
  "cloth-fold-rake": "waves",
  "pine-needle-cluster": "trees",

  // 2026-07 expansion wave
  "pencil-4b-rough": "pencil",
  "pencil-hb-mechanical": "pencil",
  "pencil-colored-soft": "pencil",
  "pencil-charcoal-stick": "circle-dashed",
  "pencil-tilt-shading": "feather",
  "g-pen-flex": "pen-tool",
  "maru-pen-fine": "pen-line",
  "spoon-pen-round": "pen",
  "brush-pen-ink": "brush",
  "calligraphy-tilt-nib": "a-large-small",
  "milli-pen-uniform": "pen-line",
  "watercolor-wet-bleed": "droplets",
  "watercolor-edge-stain": "blend",
  "oil-impasto-heavy": "paintbrush",
  "oil-dry-scumble": "paintbrush",
  "pastel-paper-soft": "blend",
  "crayon-wax-bold": "grip",
  "airbrush-grand-soft": "wind",
  "sponge-stipple-dab": "circle-dot",
  "marker-colorless-blender": "blend",
  "marker-wide-chisel": "highlighter",
  "spray-noise-fine": "spray-can",
  "stardust-star-scatter": "star",
  "leaf-fall-flurry": "leaf",
  "cloud-billow-soft": "cloud",
  "rope-twist-stamp": "spline",
  "halftone-sparse-dot": "circle-dot",
  "rain-streak-diagonal": "cloud-fog",
  "sparkle-glint-cross": "sparkles",
  "snow-flurry-flake": "asterisk",
  "ink-splatter-burst": "asterisk",
  "fur-soft-clumps": "feather",
  "wood-grain-flow": "waves",

  // 2026-07 original material/effect wave
  "bristle-round-loaded": "paintbrush",
  "bristle-fan-dry": "fence",
  "bristle-flat-streak": "paintbrush",
  "palette-knife-edge": "paintbrush",
  "watercolor-dry-granule": "droplets",
  "watercolor-salt-bloom": "droplets",
  "watercolor-backrun-ring": "blend",
  "watercolor-wet-wash": "droplets",
  "gouache-grain-flat": "paintbrush",
  "acrylic-stiff-flat": "paintbrush",
  "oil-linen-filbert": "paintbrush",
  "sumi-wash-fray": "brush",
  "ribbon-satin-fold": "spline",
  "rope-double-cord": "spline",
  "chain-link-alternate": "spline",
  "lace-scallop-trim": "rows",
  "stitch-running-thread": "rows",
  "stitch-cross-seam": "grid-2x2",
  "fabric-knit-loop": "grid-3x3",
  "metal-scratch-brush": "asterisk",
  "smoke-wisp-layered": "cloud-fog",
  "flame-tongue-spark": "flame",
  "rain-mist-combo": "cloud-fog",
  "snow-powder-drift": "asterisk",
  "dust-mote-depth": "spray-can",
  "stage-safe-splatter": "asterisk",
  "bokeh-ring-glow": "sparkles",
  "cloud-cirrus-stream": "cloud",
  "foliage-broad-canopy": "trees",
  "tree-bark-crack": "waves",
  "flower-petal-scatter": "flower",
  "rock-shard-texture": "gem",
  "brick-mortar-pattern": "grid-2x2",
  "wood-knot-rake": "waves",
  "fur-undercoat-soft": "feather",
  "hair-curl-ribbon": "feather",
  "food-sesame-sprinkle": "stamp",
  "halftone-gradient-dot": "circle-dot",
  "hatching-contour-rake": "rows",
  "focus-ray-streak": "sparkles",
} as const satisfies Readonly<
  Record<StudioBrushPackCatalogId, StudioBrushIconId>
>;

/** Per-preset icon (commercial brush pickers). Unknown ids → default pen. */
export const STUDIO_BRUSH_ICON_BY_ID: Readonly<Record<string, StudioBrushIconId>> = {
  // Line
  pen: "pen",
  fineliner: "pen-line",
  ballpoint: "pen",
  "gel-pen": "pen-line",
  "glass-pen": "gem",
  "ruling-pen": "direction",
  "technical-pen": "pen-line",
  gpen: "pen-line",
  "school-pen": "pen-tool",
  "maru-pen": "circle-dot",
  "mapping-pen": "pen-tool",
  kaburapen: "pen",
  liner: "pen-line",
  "ink-brush": "paintbrush",
  calligraphy: "a-large-small",
  "fountain-pen": "feather",
  "parallel-pen": "align-justify",
  "brush-pen": "brush",
  "perfect-ink": "pen-line",
  "perfect-marker": "highlighter",
  "standard-eraser": "eraser",
  "kneaded-eraser": "eraser",
  pencil: "pencil",
  "erodible-pencil": "pencil",
  "pencil-2b": "pencil",
  "pencil-6b": "pencil",
  "soft-pencil": "pencil",
  "pencil-grain": "pencil",
  "colored-pencil": "pencil",
  // Marker
  marker: "highlighter",
  "felt-tip": "highlighter",
  "marker-bold": "highlighter",
  "alcohol-marker": "highlighter",
  highlighter: "highlighter",
  "chisel-highlighter": "highlighter",
  "pastel-highlighter": "highlighter",
  neon: "sun",
  // FX
  glow: "sparkles",
  "soft-glow": "sparkles",
  glitter: "star",
  "star-dust": "star",
  "sparkle-star": "star",
  // Paint
  brush: "brush",
  "flat-brush": "paintbrush",
  watercolor: "droplets",
  "ink-wash": "droplets",
  "inkwash-pen": "pen-line",
  "inkwash-water-brush": "droplets",
  "inkwash-bleed-wash": "droplets",
  "inkwash-white-ink": "droplets",
  gouache: "paintbrush",
  oil: "paintbrush",
  acrylic: "paintbrush",
  "paint-tube": "paintbrush",
  airbrush: "wind",
  "hard-airbrush": "wind",
  "airbrush-fine": "wind",
  "wash-brush": "droplets",
  "soft-brush": "brush",
  spray: "spray-can",
  splatter: "spray-can",
  // Texture
  "dry-media": "pencil",
  crayon: "flame",
  chalk: "circle-dot",
  charcoal: "circle-dot",
  pastel: "waves",
  "oil-pastel": "waves",
  "ink-particle": "gem",
  "tangent-normal-brush": "direction",
  "sketchpad-tile": "grid-3x3",
  "sketchpad-mirror": "layers",
  "sketchpad-soft-marker": "highlighter",
  "web-multi-agent": "sparkles",
  "web-rough-ink": "pen-tool",
  "web-gravity-drip": "droplets",
  "web-soft-cloud": "cloud",
  "web-calligraphy-ribbon": "rectangle-horizontal",
  "web-dash-stitch": "grip",
  "web-scatter-stamp": "stamp",
  "web-rainbow-flow": "sun",
  "web-lazy-ink": "spline",
  "web-hatch-color": "fence",
  "web-cel-flat": "square",
  "web-blend-softener": "blend",
  "web-dot-tone": "circle-dot",
  "web-kaleido-ink": "sparkles",
  "web-fur-strand": "wheat",
  "web-contour-double": "rows",
  "web-radial-burst": "asterisk",
  "web-mirror-ink": "layers",
  "web-grid-ink": "grid-2x2",
  "web-spiro-orbit": "sparkles",
  "web-zigzag-edge": "waves",
  "web-neon-tube": "sun",
  "web-pressure-flat": "pen-line",
  "web-smudge-trail": "cloud-fog",
  "web-cross-hatch-pen": "fence",
  screentone: "grid-3x3",
  crosshatch: "grid-3x3",
  ...STUDIO_PROCEDURAL_BRUSH_ICON_BY_ID,
};

export function studioBrushIconId(brushId: unknown): StudioBrushIconId {
  if (typeof brushId !== "string" || !brushId) return "default";
  return STUDIO_BRUSH_ICON_BY_ID[brushId] ?? "default";
}
