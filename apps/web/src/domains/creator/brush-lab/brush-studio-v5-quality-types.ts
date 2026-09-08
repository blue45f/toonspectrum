export const BRUSH_STUDIO_V5_QUALITY_SCHEMA_VERSION = 1 as const;

export type BrushQualityGoal = "responsive" | "balanced" | "material" | "cinematic";
export type BrushDeviceClass = "desktop-pen" | "tablet-pen" | "touch-hybrid" | "mouse";
export type BrushInputTransport = "raw-coalesced" | "move-coalesced" | "move-basic";
export type BrushPatternSpace = "stroke" | "document" | "screen" | "radial" | "flow-field";
export type BrushRightsClass = "permissive" | "copyleft" | "private-grant" | "internal";
export type BrushProviderStatus = "product" | "conditional" | "lab";
export type BrushQualitySeverity = "error" | "warning" | "info";

export type BrushProviderId =
  | "native-webgpu"
  | "perfect-freehand"
  | "google-ink"
  | "libmypaint"
  | "hokusai"
  | "krita-smudge"
  | "krita-hairy"
  | "krita-spray"
  | "krita-hatching"
  | "inkwash"
  | "thin-film"
  | "reaction-diffusion"
  | "p5-brush"
  | "spectral"
  | "open-km"
  | "pigment-painter"
  | "mixbox"
  | "realbrush";

export type BrushPhysicsId =
  | "dry-contact"
  | "porous-paper"
  | "wet-flow"
  | "thin-film"
  | "bristle"
  | "pickup-reservoir"
  | "particle-ballistics"
  | "reaction-diffusion"
  | "height-field";

export interface BrushQualityPolicy {
  readonly schemaVersion: typeof BRUSH_STUDIO_V5_QUALITY_SCHEMA_VERSION;
  readonly goal: BrushQualityGoal;
  readonly device: BrushDeviceClass;
  readonly input: {
    readonly transport: BrushInputTransport;
    readonly predictionPreviewOnly: boolean;
    readonly pressureOnset: number;
    readonly pressureSaturation: number;
    readonly pressureGamma: number;
    readonly pressureHysteresis: number;
    readonly tiltDeadZoneDeg: number;
    readonly tiltSmoothing: number;
    readonly twistSmoothing: number;
    readonly hoverPreview: boolean;
    readonly palmRejection: boolean;
    readonly fingerWaterBrush: boolean;
  };
  readonly material: {
    readonly surfaceTooth: number;
    readonly friction: number;
    readonly compression: number;
    readonly absorbency: number;
    readonly capillary: number;
    readonly fiberAnisotropy: number;
    readonly deposit: number;
    readonly pickup: number;
    readonly reactivation: number;
    readonly solvent: number;
    readonly granulation: number;
    readonly edgeDarkening: number;
    readonly dryingRate: number;
    readonly viscosity: number;
    readonly plasticity: number;
    readonly gloss: number;
  };
  readonly simulation: {
    readonly physics: readonly BrushPhysicsId[];
    readonly wetResolution: number;
    readonly pressureIterations: number;
    readonly diffusion: number;
    readonly advection: number;
    readonly evaporation: number;
    readonly settleRate: number;
    readonly gravity: number;
    readonly bristleStrands: number;
    readonly bristleContactIterations: number;
    readonly reservoirCapacity: number;
    readonly particleCount: number;
  };
  readonly pigment: {
    readonly provider: "rgb" | "spectral" | "open-km" | "pigment-painter" | "mixbox" | "inkwash-density";
    readonly spectralSamples: 16 | 24 | 31 | 38;
    readonly lutResolution: 16 | 24 | 32 | 48;
    readonly thickness: number;
    readonly substrateBrightness: number;
    readonly mixingStrength: number;
    readonly allowMixboxWhenDistinct: boolean;
  };
  readonly pattern: {
    readonly space: BrushPatternSpace;
    readonly grammar: "continuous" | "grid" | "brick" | "along-path" | "radial" | "blue-noise" | "flow-field" | "l-system" | "reaction-mask";
    readonly motif: "none" | "dot" | "line" | "hatch" | "weave" | "brick" | "leaf" | "stitch" | "chain" | "hair" | "star" | "glyph" | "custom";
    readonly density: number;
    readonly spacing: number;
    readonly rotationJitter: number;
    readonly scaleJitter: number;
    readonly collisionAvoidance: number;
    readonly deterministic: boolean;
  };
  readonly output: {
    readonly tileSize: 64 | 128 | 256;
    readonly liveScale: number;
    readonly commitScale: number;
    readonly exportScale: number;
    readonly settleBudgetMs: number;
    readonly rasterReceipt: boolean;
  };
  readonly providers: readonly BrushProviderId[];
}

export interface BrushProviderDescriptor {
  readonly id: BrushProviderId;
  readonly label: string;
  readonly role: string;
  readonly strengths: readonly string[];
  readonly latency: number;
  readonly fidelity: number;
  readonly determinism: number;
  readonly memory: number;
  readonly rights: BrushRightsClass;
  readonly status: BrushProviderStatus;
  readonly webgpu: boolean;
}

export interface BrushQualityIssue {
  readonly id: string;
  readonly severity: BrushQualitySeverity;
  readonly title: string;
  readonly detail: string;
  readonly fix?: string;
}

export interface BrushExecutionPass {
  readonly phase: "hover" | "preview" | "live" | "settle" | "commit" | "export";
  readonly domain: "main" | "input-worker" | "webgpu" | "wasm-worker" | "webgl-worker";
  readonly label: string;
  readonly provider: BrushProviderId | "browser";
  readonly canonical: boolean;
  readonly budgetMs: number;
}

export interface BrushProviderCandidate {
  readonly id: BrushProviderId;
  readonly label: string;
  readonly score: number;
  readonly selected: boolean;
  readonly reason: string;
}

export interface BrushQualityAnalysis {
  readonly valid: boolean;
  readonly issues: readonly BrushQualityIssue[];
  readonly metrics: {
    readonly handFeel: number;
    readonly materialFidelity: number;
    readonly surfaceFidelity: number;
    readonly colorFidelity: number;
    readonly temporalFidelity: number;
    readonly uniqueness: number;
    readonly performance: number;
    readonly determinism: number;
  };
  readonly estimatedInputLatencyMs: number;
  readonly estimatedFrameCostMs: number;
  readonly estimatedSettleMs: number;
  readonly estimatedGpuMemoryMb: number;
  readonly rightsProfile: "commercial-safe" | "copyleft-distribution" | "private-grant";
  readonly providers: readonly BrushProviderCandidate[];
  readonly executionPlan: readonly BrushExecutionPass[];
}

export interface BrushCatalogEntry {
  readonly id: string;
  readonly group: string;
  readonly name: string;
  readonly signature: string;
  readonly engine: string;
  readonly quick: boolean;
}

function descriptor(
  id: BrushProviderId,
  label: string,
  role: string,
  strengths: readonly string[],
  latency: number,
  fidelity: number,
  determinism: number,
  memory: number,
  rights: BrushRightsClass,
  status: BrushProviderStatus,
  webgpu: boolean,
): BrushProviderDescriptor {
  return Object.freeze({ id, label, role, strengths: Object.freeze([...strengths]), latency, fidelity, determinism, memory, rights, status, webgpu });
}

export const BRUSH_QUALITY_PROVIDERS: readonly BrushProviderDescriptor[] = Object.freeze([
  descriptor("native-webgpu", "Native WebGPU", "carrier · tip · deposition · pattern", ["최저 지연", "pass fusion", "타일 LOD"], 98, 84, 96, 90, "internal", "product", true),
  descriptor("perfect-freehand", "Perfect Freehand", "pressure outline", ["G펜", "테이퍼", "벡터 proxy"], 94, 87, 99, 96, "permissive", "product", true),
  descriptor("google-ink", "Google Ink", "input modeler · mesh", ["예측", "종점 보정", "급회전"], 84, 93, 92, 85, "permissive", "conditional", true),
  descriptor("libmypaint", "libmypaint", "MYB natural media", ["다브", "스머지", "입력 매핑"], 64, 96, 85, 66, "permissive", "product", false),
  descriptor("hokusai", "Hokusai", "Rust/WASM MYB", ["타일", "WASM", "MYB"], 75, 92, 89, 76, "permissive", "conditional", false),
  descriptor("krita-smudge", "Krita Color Smudge", "pickup · reservoir", ["아래색 픽업", "알코올", "블렌더"], 57, 99, 79, 60, "copyleft", "conditional", false),
  descriptor("krita-hairy", "Krita Hairy", "bristle geometry", ["개별 강모", "갈필", "헤어"], 54, 99, 76, 55, "copyleft", "conditional", false),
  descriptor("krita-spray", "Krita Spray", "particle deposition", ["입자 형상", "분포", "회전"], 64, 94, 84, 66, "copyleft", "conditional", false),
  descriptor("krita-hatching", "Krita Hatching", "directional pattern", ["해칭", "컨투어", "갈퀴"], 76, 93, 94, 84, "copyleft", "conditional", false),
  descriptor("inkwash", "Inkwash", "wet field authority", ["이동 안료", "물붓", "건조"], 55, 100, 75, 48, "private-grant", "conditional", true),
  descriptor("thin-film", "Thin-film", "gravity film", ["드립", "페인트 런", "중력"], 52, 97, 78, 52, "internal", "lab", true),
  descriptor("reaction-diffusion", "Reaction–Diffusion", "growth field", ["덴드라이트", "녹", "균열"], 62, 95, 88, 59, "internal", "conditional", true),
  descriptor("p5-brush", "p5.brush", "settled generator", ["flow field", "mass stroke", "해칭"], 38, 91, 82, 68, "permissive", "conditional", false),
  descriptor("spectral", "Spectral WGSL", "default pigment", ["스펙트럼", "범용 안료", "MIT"], 80, 93, 95, 78, "permissive", "product", true),
  descriptor("open-km", "Open K/S WGSL", "measured pigment", ["K/S 곡선", "두께", "바탕색"], 70, 99, 93, 69, "permissive", "conditional", true),
  descriptor("pigment-painter", "pigment-painter", "LUT baker · reservoir", ["LUT", "스머지", "normal tip"], 73, 96, 86, 66, "copyleft", "conditional", true),
  descriptor("mixbox", "Mixbox LUT", "exception pigment", ["고유 색상 경로", "latent pigment"], 78, 97, 96, 76, "private-grant", "lab", true),
  descriptor("realbrush", "RealBrush Exemplar", "captured material texture", ["실물 샘플", "경계 패치", "미세 질감"], 58, 100, 80, 50, "internal", "lab", true),
]);

export const PHYSICS_PROVIDER: Readonly<Record<BrushPhysicsId, BrushProviderId>> = Object.freeze({
  "dry-contact": "native-webgpu",
  "porous-paper": "native-webgpu",
  "wet-flow": "inkwash",
  "thin-film": "thin-film",
  bristle: "krita-hairy",
  "pickup-reservoir": "krita-smudge",
  "particle-ballistics": "krita-spray",
  "reaction-diffusion": "reaction-diffusion",
  "height-field": "native-webgpu",
});

export function createBrushQualityPolicy(): BrushQualityPolicy {
  return Object.freeze({
    schemaVersion: BRUSH_STUDIO_V5_QUALITY_SCHEMA_VERSION,
    goal: "balanced",
    device: "desktop-pen",
    input: Object.freeze({
      transport: "move-coalesced",
      predictionPreviewOnly: true,
      pressureOnset: 0.02,
      pressureSaturation: 0.94,
      pressureGamma: 0.82,
      pressureHysteresis: 0.02,
      tiltDeadZoneDeg: 2,
      tiltSmoothing: 0.18,
      twistSmoothing: 0.22,
      hoverPreview: true,
      palmRejection: true,
      fingerWaterBrush: false,
    }),
    material: Object.freeze({
      surfaceTooth: 0.35,
      friction: 0.32,
      compression: 0.16,
      absorbency: 0.28,
      capillary: 0.28,
      fiberAnisotropy: 0.15,
      deposit: 0.78,
      pickup: 0.12,
      reactivation: 0.08,
      solvent: 0,
      granulation: 0.16,
      edgeDarkening: 0.08,
      dryingRate: 0.58,
      viscosity: 0.42,
      plasticity: 0.12,
      gloss: 0.08,
    }),
    simulation: Object.freeze({
      physics: Object.freeze([]),
      wetResolution: 0.72,
      pressureIterations: 16,
      diffusion: 0.24,
      advection: 0.55,
      evaporation: 0.34,
      settleRate: 0.48,
      gravity: 0,
      bristleStrands: 48,
      bristleContactIterations: 4,
      reservoirCapacity: 0.52,
      particleCount: 128,
    }),
    pigment: Object.freeze({
      provider: "rgb",
      spectralSamples: 31,
      lutResolution: 24,
      thickness: 0.45,
      substrateBrightness: 0.94,
      mixingStrength: 0.72,
      allowMixboxWhenDistinct: false,
    }),
    pattern: Object.freeze({
      space: "stroke",
      grammar: "continuous",
      motif: "none",
      density: 0.5,
      spacing: 0.38,
      rotationJitter: 0,
      scaleJitter: 0,
      collisionAvoidance: 0,
      deterministic: true,
    }),
    output: Object.freeze({
      tileSize: 128,
      liveScale: 0.75,
      commitScale: 1,
      exportScale: 2,
      settleBudgetMs: 4,
      rasterReceipt: true,
    }),
    providers: Object.freeze(["native-webgpu"] as const),
  });
}

export function clamp(value: unknown, min: number, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, numeric));
}

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function oneOf<T extends string | number>(values: readonly T[], value: unknown, fallback: T): T {
  return (typeof value === "string" || typeof value === "number") && values.includes(value as T) ? value as T : fallback;
}

export function unique<T extends string>(values: readonly T[], input: unknown): readonly T[] {
  if (!Array.isArray(input)) return Object.freeze([]);
  return Object.freeze([...new Set(input.filter((value): value is T => typeof value === "string" && values.includes(value as T)))]);
}

export const GOALS: readonly BrushQualityGoal[] = ["responsive", "balanced", "material", "cinematic"];
export const DEVICES: readonly BrushDeviceClass[] = ["desktop-pen", "tablet-pen", "touch-hybrid", "mouse"];
export const TRANSPORTS: readonly BrushInputTransport[] = ["raw-coalesced", "move-coalesced", "move-basic"];
export const PHYSICS: readonly BrushPhysicsId[] = Object.keys(PHYSICS_PROVIDER) as BrushPhysicsId[];
export const PROVIDERS: readonly BrushProviderId[] = BRUSH_QUALITY_PROVIDERS.map((provider) => provider.id);
export const SPACES: readonly BrushPatternSpace[] = ["stroke", "document", "screen", "radial", "flow-field"];
export const GRAMMARS: readonly BrushQualityPolicy["pattern"]["grammar"][] = ["continuous", "grid", "brick", "along-path", "radial", "blue-noise", "flow-field", "l-system", "reaction-mask"];
export const MOTIFS: readonly BrushQualityPolicy["pattern"]["motif"][] = ["none", "dot", "line", "hatch", "weave", "brick", "leaf", "stitch", "chain", "hair", "star", "glyph", "custom"];
export const PIGMENTS: readonly BrushQualityPolicy["pigment"]["provider"][] = ["rgb", "spectral", "open-km", "pigment-painter", "mixbox", "inkwash-density"];
