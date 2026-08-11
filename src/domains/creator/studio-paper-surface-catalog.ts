/**
 * Document paper surface catalog — UI labels/groups for {@link PaperGrainKind}.
 *
 * Physics live in `studio-paper-texture` presets; this module only describes how
 * artists pick and preview a sheet. Brush response still comes from
 * `studio-paper-brush-response` (charcoal reacts more than technical pen).
 */

import {
  DEFAULT_STUDIO_PAPER_SURFACE,
  type StudioPaperSurfaceSettings,
} from "./studio-paper-granulation-runtime";
import {
  DEFAULT_PAPER_GRAIN_KIND,
  PAPER_GRAIN_KINDS,
  PAPER_TEXTURE_PRESETS,
  type PaperGrainKind,
} from "./studio-paper-texture";

import type { StudioLivingInkMaterialControls } from "./studio-living-ink-gpu-protocol";

export type StudioPaperSurfaceGroup =
  | "watercolor"
  | "drawing"
  | "oriental"
  | "specialty";

/** Living Ink material axes driven by the document paper catalog (shared names). */
export interface StudioPaperLivingInkMaterialAxes {
  readonly paperFiber: number;
  readonly paperTooth: number;
  readonly granulation: number;
}

export interface StudioPaperSurfaceCatalogEntry {
  readonly id: PaperGrainKind;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly group: StudioPaperSurfaceGroup;
  /** Soft UI swatch tint (not baked into strokes — page `bg` still owns fill color). */
  readonly swatch: string;
  /** Relative tooth 0..1 for compact previews (from amplitude × toothBias). */
  readonly tooth: number;
  /** Suggested page background when user opts into tint-with-paper. */
  readonly tintBg: string;
  /** Living Ink paper axes — same catalog language as document paper. */
  readonly livingInk: StudioPaperLivingInkMaterialAxes;
}

const GROUP_ORDER: readonly StudioPaperSurfaceGroup[] = [
  "watercolor",
  "drawing",
  "oriental",
  "specialty",
];

export const STUDIO_PAPER_SURFACE_GROUP_LABELS: Readonly<
  Record<StudioPaperSurfaceGroup, string>
> = Object.freeze({
  watercolor: "수채·회화",
  drawing: "스케치·선화",
  oriental: "동양화·수묵",
  specialty: "특수 매체",
});

function toothScore(kind: PaperGrainKind): number {
  const params = PAPER_TEXTURE_PRESETS[kind];
  return Math.min(1, Math.max(0, params.amplitude * (0.55 + params.toothBias * 0.35)));
}

function livingInkAxes(kind: PaperGrainKind): StudioPaperLivingInkMaterialAxes {
  const params = PAPER_TEXTURE_PRESETS[kind];
  const tooth = toothScore(kind);
  // Fibre from anisotropy (clamped), granulation from amplitude×tooth — calibrated for Living Ink 0..1.
  const fiber = Math.min(1, Math.max(0, (params.fibreAnisotropy - 0.85) / 1.5));
  const gran = Math.min(1, Math.max(0, params.amplitude * 0.55 + tooth * 0.4));
  return Object.freeze({
    paperFiber: Number(fiber.toFixed(3)),
    paperTooth: Number(tooth.toFixed(3)),
    granulation: Number(gran.toFixed(3)),
  });
}

/**
 * Catalog rows in display order. Every {@link PAPER_GRAIN_KINDS} entry must appear exactly once.
 */
export const STUDIO_PAPER_SURFACE_CATALOG: readonly StudioPaperSurfaceCatalogEntry[] = Object.freeze([
  {
    id: "cold-press",
    label: "수채 중목",
    shortLabel: "중목",
    description: "표준 사생지. 안료가 골에 자연스럽게 가라앉습니다.",
    group: "watercolor",
    swatch: "#f4efe6",
    tintBg: "#f4efe6",
    tooth: toothScore("cold-press"),
    livingInk: livingInkAxes("cold-press"),
  },
  {
    id: "hot-press",
    label: "수채 세목",
    shortLabel: "세목",
    description: "매끈한 세목지. 섬세한 라인·평평한 워시에 적합합니다.",
    group: "watercolor",
    swatch: "#f7f4ef",
    tintBg: "#f7f4ef",
    tooth: toothScore("hot-press"),
    livingInk: livingInkAxes("hot-press"),
  },
  {
    id: "rough",
    label: "수채 황목",
    shortLabel: "황목",
    description: "거친 펠트 결. 과립·얼룩 표현이 가장 강합니다.",
    group: "watercolor",
    swatch: "#efe6d6",
    tintBg: "#efe6d6",
    tooth: toothScore("rough"),
    livingInk: livingInkAxes("rough"),
  },
  {
    id: "bristol",
    label: "브리스톨",
    shortLabel: "브리스톨",
    description: "매우 매끈한 일러스트·마커 용지.",
    group: "drawing",
    swatch: "#faf8f5",
    tintBg: "#faf8f5",
    tooth: toothScore("bristol"),
    livingInk: livingInkAxes("bristol"),
  },
  {
    id: "newsprint",
    label: "신문지",
    shortLabel: "신문지",
    description: "미세하고 조밀한 결. 빠른 연필 스케치용.",
    group: "drawing",
    swatch: "#ece7dc",
    tintBg: "#ece7dc",
    tooth: toothScore("newsprint"),
    livingInk: livingInkAxes("newsprint"),
  },
  {
    id: "kraft",
    label: "크라프트",
    shortLabel: "크라프트",
    description: "중간 결의 톤 스케치 종이.",
    group: "drawing",
    swatch: "#d9c4a0",
    tintBg: "#d9c4a0",
    tooth: toothScore("kraft"),
    livingInk: livingInkAxes("kraft"),
  },
  {
    id: "washi",
    label: "한지",
    shortLabel: "한지",
    description: "긴 섬유 이방성. 수묵·동양화 획에 잘 맞습니다.",
    group: "oriental",
    swatch: "#f2ebe0",
    tintBg: "#f2ebe0",
    tooth: toothScore("washi"),
    livingInk: livingInkAxes("washi"),
  },
  {
    id: "canvas",
    label: "캔버스 천",
    shortLabel: "캔버스",
    description: "씨실·날실 직조 구조. 유화·아크릴 침착에 유리합니다.",
    group: "specialty",
    swatch: "#e8dfd0",
    tintBg: "#e8dfd0",
    tooth: toothScore("canvas"),
    livingInk: livingInkAxes("canvas"),
  },
  {
    id: "charcoal",
    label: "목탄지",
    shortLabel: "목탄지",
    description: "깊은 이빨. 목탄·콩테가 골에 잘 남습니다.",
    group: "specialty",
    swatch: "#e6ddd0",
    tintBg: "#e6ddd0",
    tooth: toothScore("charcoal"),
    livingInk: livingInkAxes("charcoal"),
  },
  {
    id: "pastel-board",
    label: "파스텔지",
    shortLabel: "파스텔",
    description: "건성 매체용 이빨. 파스텔·크레용 침착에 유리합니다.",
    group: "specialty",
    swatch: "#ebe4d8",
    tintBg: "#ebe4d8",
    tooth: toothScore("pastel-board"),
    livingInk: livingInkAxes("pastel-board"),
  },
]);

/** Fail closed: catalog and physics tables must stay in lockstep. */
export function assertStudioPaperSurfaceCatalogComplete(): void {
  const ids = new Set(STUDIO_PAPER_SURFACE_CATALOG.map((entry) => entry.id));
  for (const kind of PAPER_GRAIN_KINDS) {
    if (!ids.has(kind)) {
      throw new Error(`Paper surface catalog missing kind: ${kind}`);
    }
  }
  if (ids.size !== PAPER_GRAIN_KINDS.length) {
    throw new Error("Paper surface catalog has extra or duplicate kinds");
  }
}

export function getStudioPaperSurfaceCatalogEntry(
  kind: PaperGrainKind | unknown,
): StudioPaperSurfaceCatalogEntry {
  const id = typeof kind === "string" && PAPER_GRAIN_KINDS.includes(kind as PaperGrainKind)
    ? (kind as PaperGrainKind)
    : DEFAULT_PAPER_GRAIN_KIND;
  return STUDIO_PAPER_SURFACE_CATALOG.find((entry) => entry.id === id)
    ?? STUDIO_PAPER_SURFACE_CATALOG.find((entry) => entry.id === DEFAULT_PAPER_GRAIN_KIND)!;
}

export function listStudioPaperSurfaceCatalogByGroup(): ReadonlyArray<{
  readonly group: StudioPaperSurfaceGroup;
  readonly label: string;
  readonly entries: readonly StudioPaperSurfaceCatalogEntry[];
}> {
  return GROUP_ORDER.map((group) => ({
    group,
    label: STUDIO_PAPER_SURFACE_GROUP_LABELS[group],
    entries: STUDIO_PAPER_SURFACE_CATALOG.filter((entry) => entry.group === group),
  })).filter((section) => section.entries.length > 0);
}

/** CSS background for a compact swatch (tint + procedural-looking noise via layered gradients). */
export function studioPaperSurfaceSwatchStyle(
  entry: StudioPaperSurfaceCatalogEntry,
): { backgroundColor: string; backgroundImage: string; backgroundSize: string } {
  const tooth = entry.tooth;
  const grainA = Math.round(10 + tooth * 28);
  const grainB = Math.round(6 + tooth * 18);
  const scale = Math.round(8 + (1 - tooth) * 10);
  return {
    backgroundColor: entry.swatch,
    backgroundImage: [
      `radial-gradient(circle at 20% 30%, rgba(90,70,40,${(0.04 + tooth * 0.1).toFixed(3)}) 0 1px, transparent 1.5px)`,
      `radial-gradient(circle at 70% 60%, rgba(60,45,25,${(0.03 + tooth * 0.08).toFixed(3)}) 0 1px, transparent 1.4px)`,
      `repeating-linear-gradient(${entry.id === "washi" ? 12 : entry.id === "canvas" ? 90 : 0}deg, transparent 0 ${scale}px, rgba(80,60,30,${(0.02 + tooth * 0.05).toFixed(3)}) ${scale}px ${scale + 1}px)`,
    ].join(","),
    backgroundSize: `${grainA}px ${grainB}px, ${grainB}px ${grainA}px, 100% 100%`,
  };
}

export function planStudioPaperSurfaceSelection(
  kind: PaperGrainKind,
  seed: number = DEFAULT_STUDIO_PAPER_SURFACE.seed,
): StudioPaperSurfaceSettings {
  return {
    kind,
    seed: Math.trunc(Number.isFinite(seed) ? Math.max(0, seed) : DEFAULT_STUDIO_PAPER_SURFACE.seed),
  };
}

/**
 * Map document paper → Living Ink material axes (shared catalog language).
 * Only paper-related fields change; flow/bleed etc. stay under user control.
 */
export function livingInkMaterialPatchForPaper(
  kind: PaperGrainKind | unknown,
): Pick<StudioLivingInkMaterialControls, "paperFiber" | "paperTooth" | "granulation"> {
  const axes = getStudioPaperSurfaceCatalogEntry(kind).livingInk;
  return {
    paperFiber: axes.paperFiber,
    paperTooth: axes.paperTooth,
    granulation: axes.granulation,
  };
}

/** Reverse: which catalog paper best matches Living Ink fibre/tooth (for UI active state). */
export function matchPaperKindFromLivingInkMaterial(
  material: Pick<StudioLivingInkMaterialControls, "paperFiber" | "paperTooth" | "granulation">,
): PaperGrainKind {
  let best: PaperGrainKind = DEFAULT_PAPER_GRAIN_KIND;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const entry of STUDIO_PAPER_SURFACE_CATALOG) {
    const dFiber = entry.livingInk.paperFiber - material.paperFiber;
    const dTooth = entry.livingInk.paperTooth - material.paperTooth;
    const dGran = entry.livingInk.granulation - material.granulation;
    const score = dFiber * dFiber + dTooth * dTooth + dGran * dGran;
    if (score < bestScore) {
      bestScore = score;
      best = entry.id;
    }
  }
  return best;
}

export interface StudioPaperSurfaceApplyPlan {
  readonly surface: StudioPaperSurfaceSettings;
  readonly tintBg: string | null;
  readonly livingInk: Pick<
    StudioLivingInkMaterialControls,
    "paperFiber" | "paperTooth" | "granulation"
  >;
  readonly catalog: StudioPaperSurfaceCatalogEntry;
}

/** One-shot plan when the user picks a paper in canvas settings. */
export function planStudioPaperSurfaceApply(input: {
  readonly kind: PaperGrainKind;
  readonly seed?: number;
  readonly applyTintBackground?: boolean;
}): StudioPaperSurfaceApplyPlan {
  const catalog = getStudioPaperSurfaceCatalogEntry(input.kind);
  const surface = planStudioPaperSurfaceSelection(
    catalog.id,
    input.seed ?? DEFAULT_STUDIO_PAPER_SURFACE.seed,
  );
  return {
    surface,
    tintBg: input.applyTintBackground ? catalog.tintBg : null,
    livingInk: livingInkMaterialPatchForPaper(catalog.id),
    catalog,
  };
}
