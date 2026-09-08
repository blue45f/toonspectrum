export const BRUSH_STUDIO_V5_SCHEMA_VERSION = 5 as const;

export type BrushStudioV5Quality = "draft" | "balanced" | "pro";
export type BrushStudioV5Severity = "error" | "warning" | "info";
export type BrushStudioV5MotionId =
  | "direct"
  | "adaptive-ema"
  | "spring"
  | "google-ink-modeler"
  | "brush-inertia"
  | "lazy-leash";
export type BrushStudioV5StrokeEngineId =
  | "native-webgpu"
  | "perfect-freehand"
  | "google-ink"
  | "libmypaint"
  | "hokusai"
  | "krita"
  | "inkwash"
  | "p5-brush";
export type BrushStudioV5GeometryId =
  | "centerline"
  | "pressure-outline"
  | "google-mesh"
  | "angled-ribbon"
  | "bristle-bundle"
  | "particle-stream"
  | "motif-path";
export type BrushStudioV5TipId =
  | "round-sdf"
  | "chisel-sdf"
  | "grain-stamp"
  | "dual-tip"
  | "bristle-fan"
  | "normal-map-tip"
  | "motif-atlas";
export type BrushStudioV5SurfaceId =
  | "smooth-film"
  | "kent-paper"
  | "watercolor-coldpress"
  | "printmaking-tooth"
  | "linen-canvas"
  | "porous-fiber"
  | "custom-scan";
export type BrushStudioV5MaterialId =
  | "clean-ink"
  | "marker"
  | "graphite"
  | "charcoal"
  | "wax"
  | "watercolor"
  | "living-ink"
  | "gouache"
  | "acrylic"
  | "oil"
  | "particle-paint"
  | "light";
export type BrushStudioV5PigmentId =
  | "rgb"
  | "spectral"
  | "open-km"
  | "pigment-painter-lut"
  | "mixbox"
  | "inkwash-density";
export type BrushStudioV5PhysicsId =
  | "dry-contact"
  | "paper-absorption"
  | "inkwash-flow"
  | "thin-film"
  | "bristle-dynamics"
  | "krita-color-smudge"
  | "pigment-reservoir"
  | "particle-ballistics"
  | "reaction-diffusion"
  | "height-relief";
export type BrushStudioV5PatternId =
  | "none"
  | "dot-tone"
  | "line-tone"
  | "cross-hatch"
  | "fabric-weave"
  | "brick"
  | "foliage"
  | "stitch"
  | "kaleido"
  | "flow-field"
  | "rainbow-flow";
export type BrushStudioV5FinishId =
  | "edge-bloom"
  | "wet-sheen"
  | "relief-lighting"
  | "neon-bloom"
  | "grain-boost"
  | "chroma-fringe";
export type BrushStudioV5PressureTarget =
  | "size"
  | "opacity"
  | "flow"
  | "pigment-load"
  | "wetness";
export type BrushStudioV5TiltTarget =
  | "none"
  | "contact-width"
  | "tip-angle"
  | "bristle-spread"
  | "pattern-rotation";
export type BrushStudioV5SpeedTarget =
  | "none"
  | "opacity"
  | "spacing"
  | "dryness"
  | "particle-tail";
export type BrushStudioV5DwellTarget =
  | "none"
  | "pooling"
  | "height"
  | "emission"
  | "reaction-growth";

export interface BrushStudioV5Option<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly provider: string;
  readonly description: string;
  readonly cost: number;
  readonly realism: number;
  readonly tags: readonly string[];
}

function option<Id extends string>(
  id: Id,
  label: string,
  provider: string,
  description: string,
  cost: number,
  realism: number,
  tags: readonly string[],
): BrushStudioV5Option<Id> {
  return Object.freeze({
    id,
    label,
    provider,
    description,
    cost,
    realism,
    tags: Object.freeze([...tags]),
  });
}

export const BRUSH_STUDIO_V5_MOTIONS: readonly BrushStudioV5Option<BrushStudioV5MotionId>[] = Object.freeze([
  option("direct", "직접 추종", "Pointer Events", "보정 없이 가장 낮은 지연으로 추종합니다.", 1, 2, ["정밀"]),
  option("adaptive-ema", "적응형 부드러움", "Input Worker", "저속 흔들림만 줄이고 빠른 획은 직접 추종합니다.", 1, 3, ["범용"]),
  option("spring", "탄성 스트로크", "Spring Model", "질량·마찰·탄성으로 자연스러운 필기감을 만듭니다.", 2, 4, ["잉크"]),
  option("google-ink-modeler", "모델링 잉크", "Google Ink", "예측과 종점 보정을 포함한 모델링 경로입니다.", 3, 5, ["필기"]),
  option("brush-inertia", "붓 관성", "Brush Inertia", "큰 촉과 물감 질량이 포인터를 조금 늦게 따라옵니다.", 2, 5, ["유화"]),
  option("lazy-leash", "풀드 스트링", "lazy-brush / Croquis", "긴 곡선과 헤어 라인을 안정적으로 끌어냅니다.", 2, 4, ["장식"]),
]);

export const BRUSH_STUDIO_V5_STROKE_ENGINES: readonly BrushStudioV5Option<BrushStudioV5StrokeEngineId>[] = Object.freeze([
  option("native-webgpu", "Native WebGPU", "ToonSpectrum WebGPU", "다브·리본·입자·타일을 단일 GPU 그래프로 실행합니다.", 1, 4, ["고성능"]),
  option("perfect-freehand", "Perfect Freehand", "perfect-freehand + WebGPU", "필압 외곽선과 매끈한 테이퍼를 생성합니다.", 1, 4, ["G펜"]),
  option("google-ink", "Google Ink", "Google Ink WASM + WebGPU", "모델링된 경로와 삼각 메시를 사용합니다.", 3, 5, ["메시"]),
  option("libmypaint", "libmypaint", "libmypaint WASM", "MYB 다브·스머지·자연매체 동역학을 사용합니다.", 3, 5, ["MYB"]),
  option("hokusai", "Hokusai", "Hokusai Rust/WASM", "타일 기반 MYB 호환 자연매체 엔진입니다.", 3, 5, ["Rust"]),
  option("krita", "Krita PaintOp", "Krita GPL/WASM", "Hairy·Dual Tip·Spray·Color Smudge를 사용합니다.", 4, 5, ["GPL"]),
  option("inkwash", "Inkwash", "Inkwash WebGPU", "이동 안료·수분·유속·건조 필드를 사용합니다.", 4, 5, ["유체"]),
  option("p5-brush", "p5.brush", "p5.brush WebGL2 Worker", "플로우필드·해칭·mass stroke를 정착형으로 생성합니다.", 4, 4, ["생성형"]),
]);

export const BRUSH_STUDIO_V5_GEOMETRIES: readonly BrushStudioV5Option<BrushStudioV5GeometryId>[] = Object.freeze([
  option("centerline", "센터라인", "Native WebGPU", "중심 경로를 직접 래스터화합니다.", 1, 2, ["클린"]),
  option("pressure-outline", "필압 외곽선", "perfect-freehand", "필압 폭과 시작·끝 테이퍼를 가진 외곽선입니다.", 1, 4, ["선화"]),
  option("google-mesh", "잉크 메시", "Google Ink", "급회전과 코너를 안정적으로 표현하는 메시입니다.", 3, 5, ["메시"]),
  option("angled-ribbon", "각진 리본", "Native WebGPU", "틸트·트위스트에 반응하는 평붓 캐리어입니다.", 2, 4, ["캘리"]),
  option("bristle-bundle", "강모 번들", "WebGPU / Krita Hairy", "여러 털과 레인이 독립적으로 접촉합니다.", 4, 5, ["유화"]),
  option("particle-stream", "입자 스트림", "WebGPU Particle", "선 대신 입자와 비말 흐름을 생성합니다.", 3, 4, ["FX"]),
  option("motif-path", "모티프 경로", "Pattern Graph", "경로를 따라 문양·글리프·스탬프를 배치합니다.", 2, 4, ["패턴"]),
]);

export const BRUSH_STUDIO_V5_TIPS: readonly BrushStudioV5Option<BrushStudioV5TipId>[] = Object.freeze([
  option("round-sdf", "원형 SDF", "Native WebGPU", "확대해도 매끈한 원형·타원형 촉입니다.", 1, 2, ["범용"]),
  option("chisel-sdf", "치즐 SDF", "Native WebGPU", "회전 가능한 평촉과 날카로운 모서리입니다.", 1, 4, ["마커"]),
  option("grain-stamp", "그레인 스탬프", "Stamp Engine", "사용자 알파와 종이 결을 반복 도포합니다.", 2, 4, ["건식"]),
  option("dual-tip", "듀얼 팁", "Krita-inspired", "두 팁을 multiply·screen·overlay로 결합합니다.", 3, 5, ["복합"]),
  option("bristle-fan", "팬 강모", "WebGPU / Krita Hairy", "여러 강모 접촉을 가진 부채꼴 촉입니다.", 4, 5, ["유화"]),
  option("normal-map-tip", "노멀맵 촉", "pigment-painter derived", "높이와 방향 정보를 가진 입체 촉입니다.", 3, 5, ["릴리프"]),
  option("motif-atlas", "모티프 아틀라스", "Pattern Atlas", "여러 SVG·SDF·알파 모티프를 시드로 선택합니다.", 2, 4, ["문양"]),
]);

export const BRUSH_STUDIO_V5_SURFACES: readonly BrushStudioV5Option<BrushStudioV5SurfaceId>[] = Object.freeze([
  option("smooth-film", "매끈한 필름", "Analytic Surface", "표면 요철 없이 깨끗한 선을 표현합니다.", 1, 1, ["클린"]),
  option("kent-paper", "켄트지", "Paper Height Field", "고운 종이 이빨과 균일한 흡수입니다.", 1, 3, ["연필"]),
  option("watercolor-coldpress", "콜드프레스 수채지", "Height + Absorbency", "굵은 요철·과립 침전·엣지 농축입니다.", 2, 5, ["수채"]),
  option("printmaking-tooth", "판화지", "Deep Tooth Field", "깊은 골과 봉우리에 건식 입자가 걸립니다.", 2, 5, ["목탄"]),
  option("linen-canvas", "리넨 캔버스", "Woven Surface", "경사·위사 직조와 방향성 마찰입니다.", 2, 5, ["유화"]),
  option("porous-fiber", "다공성 섬유지", "Porous Paper Solver", "섬유 방향과 모세관 확산을 강조합니다.", 3, 5, ["수묵"]),
  option("custom-scan", "사용자 스캔 표면", "Exemplar Surface", "스캔한 height·normal·fiber 맵을 사용합니다.", 3, 5, ["실물"]),
]);

export const BRUSH_STUDIO_V5_MATERIALS: readonly BrushStudioV5Option<BrushStudioV5MaterialId>[] = Object.freeze([
  option("clean-ink", "클린 잉크", "WebGPU Coverage", "깨끗한 불투명 잉크와 필압 선화입니다.", 1, 2, ["선화"]),
  option("marker", "마커", "WebGPU Deposition", "평면 도포·펠트 그레인·알코올 중첩입니다.", 1, 3, ["채색"]),
  option("graphite", "흑연", "Dry Contact", "종이 요철·심 경도·측면 접촉입니다.", 2, 5, ["연필"]),
  option("charcoal", "목탄", "Dry Contact", "큰 탄소 입자·가루·압축 모서리입니다.", 2, 5, ["건식"]),
  option("wax", "왁스·오일파스텔", "Dry Contact + Pigment", "종이 골을 건너뛰는 점착성 왁스막입니다.", 2, 5, ["크레용"]),
  option("watercolor", "수채", "Wet Field", "투명 워시·과립·엣지 블룸입니다.", 3, 5, ["습식"]),
  option("living-ink", "리빙 잉크", "Inkwash", "안료가 물을 따라 흐르고 건조되며 정착합니다.", 4, 5, ["수묵"]),
  option("gouache", "과슈", "Opaque Pigment", "불투명하고 매트한 바디와 제한된 재활성입니다.", 2, 4, ["불투명"]),
  option("acrylic", "아크릴", "Polymer Film", "빠른 고정과 단단한 외곽·폴리머막입니다.", 3, 4, ["페인트"]),
  option("oil", "유화", "Bristle + Reservoir", "물감 적재·픽업·강모·높이와 느린 혼색입니다.", 4, 5, ["강모"]),
  option("particle-paint", "입자 페인트", "Particle Deposition", "스프레이·비말·글리터 입자를 도포합니다.", 3, 4, ["입자"]),
  option("light", "발광 재료", "Additive Light", "네온·오로라·광택 입자를 가산 합성합니다.", 2, 3, ["FX"]),
]);

export const BRUSH_STUDIO_V5_PIGMENTS: readonly BrushStudioV5Option<BrushStudioV5PigmentId>[] = Object.freeze([
  option("rgb", "RGB / OKLab", "Native Shader", "빠른 일반 색상과 발광 합성입니다.", 1, 1, ["고성능"]),
  option("spectral", "Spectral.js", "Spectral WGSL", "스펙트럼 반사율 기반 범용 안료 혼합입니다.", 2, 4, ["MIT"]),
  option("open-km", "Open K/S", "open-km derived WGSL", "검증 K·S 곡선과 두께·바탕색을 사용합니다.", 3, 5, ["KM"]),
  option("pigment-painter-lut", "Pigment LUT", "pigment-painter GPL", "사용자 안료 세트를 최적화한 LUT 혼합입니다.", 2, 5, ["GPL"]),
  option("mixbox", "Mixbox", "Mixbox licensed", "대체하기 어려운 포화 색상 경로를 제공합니다.", 2, 5, ["조건부"]),
  option("inkwash-density", "Inkwash 광학 밀도", "Inkwash Shader", "이동·고정 잉크의 광학 밀도를 사용합니다.", 2, 5, ["수묵"]),
]);

export const BRUSH_STUDIO_V5_PHYSICS: readonly BrushStudioV5Option<BrushStudioV5PhysicsId>[] = Object.freeze([
  option("dry-contact", "건식 접촉", "Native WebGPU", "종이 이빨·마찰·마모·가루를 계산합니다.", 2, 5, ["건식"]),
  option("paper-absorption", "종이 흡수", "Porous Paper WebGPU", "흡수율·섬유·모세관 확산을 계산합니다.", 3, 5, ["습식"]),
  option("inkwash-flow", "Inkwash 유체", "Inkwash WebGPU", "수분·유속·이동 안료·건조를 계산합니다.", 4, 5, ["유체"]),
  option("thin-film", "박막 드립", "Thin-film WebGPU", "중력에 따른 페인트 드립을 계산합니다.", 4, 5, ["중력"]),
  option("bristle-dynamics", "강모 역학", "WebGPU / Krita Hairy", "털의 강성·휘어짐·벌어짐을 계산합니다.", 4, 5, ["강모"]),
  option("krita-color-smudge", "Color Smudge", "Krita GPL/WASM", "아래색 픽업·스머지·도포를 처리합니다.", 4, 5, ["픽업"]),
  option("pigment-reservoir", "안료 Reservoir", "pigment-painter derived", "촉 내부에 여러 색과 물감량을 유지합니다.", 3, 5, ["혼색"]),
  option("particle-ballistics", "입자 탄도", "WebGPU Particle", "중력·속도·충돌을 가진 비말을 계산합니다.", 3, 4, ["스플래터"]),
  option("reaction-diffusion", "반응 확산", "Reaction-Diffusion WebGPU", "덴드라이트·녹·이끼처럼 성장하는 필드입니다.", 4, 5, ["성장"]),
  option("height-relief", "높이·릴리프", "WebGPU Height Field", "물감 두께·능선·노멀·광택을 계산합니다.", 3, 5, ["임파스토"]),
]);

export const BRUSH_STUDIO_V5_PATTERNS: readonly BrushStudioV5Option<BrushStudioV5PatternId>[] = Object.freeze([
  option("none", "패턴 없음", "-", "재료의 기본 자국만 사용합니다.", 0, 0, []),
  option("dot-tone", "도트 스크린톤", "WebGPU Document Grid", "문서 위상에 고정되는 망점입니다.", 1, 3, ["만화"]),
  option("line-tone", "라인 스크린톤", "WebGPU Line Grid", "각도와 밀도를 가진 평행선 톤입니다.", 1, 3, ["만화"]),
  option("cross-hatch", "크로스해칭", "WebGPU / Krita Hatching", "진행 방향을 따르는 교차 음영선입니다.", 2, 4, ["해칭"]),
  option("fabric-weave", "패브릭 위브", "WebGPU Pattern", "경사·위사의 교차 직조입니다.", 2, 5, ["직조"]),
  option("brick", "브릭 모르타르", "WebGPU Staggered Pattern", "반단 위상의 벽돌과 줄눈입니다.", 2, 4, ["건축"]),
  option("foliage", "폴리지 클러스터", "Blue-noise Scatter", "겹침을 억제한 유기적 잎 군집입니다.", 2, 5, ["잎"]),
  option("stitch", "스티치·체인", "Along-path Decorator", "경로를 따라 연결 모티프를 배치합니다.", 2, 4, ["장식"]),
  option("kaleido", "칼레이도", "WebGPU Symmetry", "미러·방사·회전 대칭으로 획을 증식합니다.", 2, 4, ["대칭"]),
  option("flow-field", "플로우필드", "p5.brush / WebGPU", "벡터장을 따라 mass stroke를 생성합니다.", 4, 5, ["생성형"]),
  option("rainbow-flow", "레인보우 플로우", "Arc-length Color", "진행 거리에 따라 색상 궤적이 변합니다.", 2, 4, ["색상"]),
]);

export const BRUSH_STUDIO_V5_FINISHES: readonly BrushStudioV5Option<BrushStudioV5FinishId>[] = Object.freeze([
  option("edge-bloom", "엣지 블룸", "WebGPU Post", "젖은 가장자리에 안료 링을 만듭니다.", 2, 4, ["수채"]),
  option("wet-sheen", "젖은 광택", "WebGPU Lighting", "수분량에 따라 미세 광택을 추가합니다.", 2, 4, ["습식"]),
  option("relief-lighting", "릴리프 조명", "WebGPU Normal Lighting", "높이·노멀에 따른 능선을 표시합니다.", 2, 5, ["임파스토"]),
  option("neon-bloom", "네온 블룸", "WebGPU Multipass", "밝은 코어와 다단 발광층을 만듭니다.", 2, 3, ["FX"]),
  option("grain-boost", "미세 그레인", "WebGPU Texture", "미세 입자와 공극을 보강합니다.", 1, 4, ["질감"]),
  option("chroma-fringe", "크로마 프린지", "Channel Mobility", "채널별 이동 차이로 색 가장자리를 만듭니다.", 2, 4, ["색분리"]),
]);

export interface BrushStudioV5Tuning {
  readonly size: number;
  readonly flow: number;
  readonly grain: number;
  readonly wetness: number;
  readonly viscosity: number;
  readonly scatter: number;
  readonly relief: number;
  readonly patternScale: number;
  readonly stabilization: number;
}

export interface BrushStudioV5SensorMapping {
  readonly pressure: BrushStudioV5PressureTarget;
  readonly tilt: BrushStudioV5TiltTarget;
  readonly speed: BrushStudioV5SpeedTarget;
  readonly dwell: BrushStudioV5DwellTarget;
}

export interface BrushStudioV5Draft {
  readonly schemaVersion: typeof BRUSH_STUDIO_V5_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly seed: number;
  readonly quality: BrushStudioV5Quality;
  readonly motionId: BrushStudioV5MotionId;
  readonly strokeEngineId: BrushStudioV5StrokeEngineId;
  readonly geometryId: BrushStudioV5GeometryId;
  readonly tipId: BrushStudioV5TipId;
  readonly surfaceId: BrushStudioV5SurfaceId;
  readonly materialId: BrushStudioV5MaterialId;
  readonly pigmentId: BrushStudioV5PigmentId;
  readonly physicsIds: readonly BrushStudioV5PhysicsId[];
  readonly patternId: BrushStudioV5PatternId;
  readonly finishIds: readonly BrushStudioV5FinishId[];
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly tuning: BrushStudioV5Tuning;
  readonly sensorMapping: BrushStudioV5SensorMapping;
}

export interface BrushStudioV5Issue {
  readonly id: string;
  readonly severity: BrushStudioV5Severity;
  readonly title: string;
  readonly description: string;
}

export interface BrushStudioV5Analysis {
  readonly valid: boolean;
  readonly issues: readonly BrushStudioV5Issue[];
  readonly performanceScore: number;
  readonly realismScore: number;
  readonly uniquenessScore: number;
  readonly complexityScore: number;
  readonly selectedModuleCount: number;
  readonly executionPlan: readonly string[];
}

export interface BrushStudioV5Recipe {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly program: Omit<BrushStudioV5Draft, "id" | "name" | "seed">;
}

const DEFAULT_TUNING: BrushStudioV5Tuning = Object.freeze({
  size: 28,
  flow: 0.78,
  grain: 0.18,
  wetness: 0.12,
  viscosity: 0.45,
  scatter: 0.08,
  relief: 0.08,
  patternScale: 1,
  stabilization: 0.35,
});
const DEFAULT_SENSOR_MAPPING: BrushStudioV5SensorMapping = Object.freeze({
  pressure: "size",
  tilt: "none",
  speed: "none",
  dwell: "none",
});

function randomId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `brush-v5-${Date.now().toString(36)}`;
  } catch {
    return `brush-v5-${Date.now().toString(36)}`;
  }
}

export function createDefaultBrushStudioV5Draft(): BrushStudioV5Draft {
  return Object.freeze({
    schemaVersion: BRUSH_STUDIO_V5_SCHEMA_VERSION,
    id: randomId(),
    name: "새 WebGPU 잉크",
    seed: 20260909,
    quality: "balanced",
    motionId: "adaptive-ema",
    strokeEngineId: "native-webgpu",
    geometryId: "pressure-outline",
    tipId: "round-sdf",
    surfaceId: "kent-paper",
    materialId: "clean-ink",
    pigmentId: "rgb",
    physicsIds: Object.freeze([]),
    patternId: "none",
    finishIds: Object.freeze([]),
    primaryColor: "#17191f",
    secondaryColor: "#4f6bff",
    tuning: DEFAULT_TUNING,
    sensorMapping: DEFAULT_SENSOR_MAPPING,
  });
}

type RecipeOverride = Partial<Omit<BrushStudioV5Draft, "schemaVersion" | "id" | "name" | "seed">>;

function recipe(id: string, name: string, description: string, values: RecipeOverride): BrushStudioV5Recipe {
  const base = createDefaultBrushStudioV5Draft();
  return Object.freeze({
    id,
    name,
    description,
    program: Object.freeze({
      schemaVersion: BRUSH_STUDIO_V5_SCHEMA_VERSION,
      quality: values.quality ?? base.quality,
      motionId: values.motionId ?? base.motionId,
      strokeEngineId: values.strokeEngineId ?? base.strokeEngineId,
      geometryId: values.geometryId ?? base.geometryId,
      tipId: values.tipId ?? base.tipId,
      surfaceId: values.surfaceId ?? base.surfaceId,
      materialId: values.materialId ?? base.materialId,
      pigmentId: values.pigmentId ?? base.pigmentId,
      physicsIds: Object.freeze([...(values.physicsIds ?? base.physicsIds)]),
      patternId: values.patternId ?? base.patternId,
      finishIds: Object.freeze([...(values.finishIds ?? base.finishIds)]),
      primaryColor: values.primaryColor ?? base.primaryColor,
      secondaryColor: values.secondaryColor ?? base.secondaryColor,
      tuning: Object.freeze({ ...base.tuning, ...(values.tuning ?? {}) }),
      sensorMapping: Object.freeze({ ...base.sensorMapping, ...(values.sensorMapping ?? {}) }),
    }),
  });
}

export const BRUSH_STUDIO_V5_RECIPES: readonly BrushStudioV5Recipe[] = Object.freeze([
  recipe("velvet-graphite", "벨벳 그래파이트", "종이 이빨과 틸트 측면 음영을 가진 흑연입니다.", {
    geometryId: "angled-ribbon",
    tipId: "grain-stamp",
    surfaceId: "printmaking-tooth",
    materialId: "graphite",
    physicsIds: ["dry-contact"],
    finishIds: ["grain-boost"],
    primaryColor: "#24252a",
    secondaryColor: "#686a74",
    tuning: { ...DEFAULT_TUNING, grain: 0.78, viscosity: 0.15, relief: 0.2 },
    sensorMapping: { pressure: "pigment-load", tilt: "contact-width", speed: "opacity", dwell: "none" },
  }),
  recipe("mineral-bloom", "미네랄 블룸 워시", "광물 안료·다공성 종이·과립·백런 수채입니다.", {
    motionId: "brush-inertia",
    strokeEngineId: "inkwash",
    geometryId: "angled-ribbon",
    tipId: "grain-stamp",
    surfaceId: "watercolor-coldpress",
    materialId: "watercolor",
    pigmentId: "open-km",
    physicsIds: ["paper-absorption", "inkwash-flow"],
    finishIds: ["edge-bloom", "wet-sheen"],
    primaryColor: "#195f78",
    secondaryColor: "#d49a32",
    tuning: { ...DEFAULT_TUNING, wetness: 0.78, grain: 0.68, flow: 0.56, viscosity: 0.25 },
    sensorMapping: { pressure: "wetness", tilt: "contact-width", speed: "dryness", dwell: "pooling" },
  }),
  recipe("chroma-sumi", "크로마 수묵", "먹 중심과 섬유 번짐, 청보라색 프린지를 결합합니다.", {
    motionId: "spring",
    strokeEngineId: "inkwash",
    geometryId: "pressure-outline",
    tipId: "bristle-fan",
    surfaceId: "porous-fiber",
    materialId: "living-ink",
    pigmentId: "inkwash-density",
    physicsIds: ["paper-absorption", "inkwash-flow"],
    finishIds: ["edge-bloom", "chroma-fringe"],
    primaryColor: "#11131d",
    secondaryColor: "#4157b8",
    tuning: { ...DEFAULT_TUNING, wetness: 0.64, grain: 0.38, flow: 0.7, viscosity: 0.34 },
    sensorMapping: { pressure: "flow", tilt: "bristle-spread", speed: "dryness", dwell: "pooling" },
  }),
  recipe("oil-hair-mixer", "오일 헤어 믹서", "개별 강모·안료 reservoir·높이 릴리프 유화입니다.", {
    motionId: "brush-inertia",
    strokeEngineId: "krita",
    geometryId: "bristle-bundle",
    tipId: "bristle-fan",
    surfaceId: "linen-canvas",
    materialId: "oil",
    pigmentId: "open-km",
    physicsIds: ["bristle-dynamics", "pigment-reservoir", "height-relief"],
    finishIds: ["relief-lighting", "grain-boost"],
    primaryColor: "#b8452e",
    secondaryColor: "#e1bd34",
    tuning: { ...DEFAULT_TUNING, size: 42, flow: 0.72, viscosity: 0.82, relief: 0.74, grain: 0.32 },
    sensorMapping: { pressure: "pigment-load", tilt: "bristle-spread", speed: "spacing", dwell: "height" },
  }),
  recipe("dripping-neon", "드리핑 네온 잉크", "리빙 잉크와 박막 중력, 네온 블룸을 결합합니다.", {
    motionId: "spring",
    strokeEngineId: "inkwash",
    geometryId: "centerline",
    tipId: "round-sdf",
    surfaceId: "smooth-film",
    materialId: "light",
    physicsIds: ["inkwash-flow", "thin-film"],
    finishIds: ["neon-bloom", "wet-sheen"],
    primaryColor: "#48f4ff",
    secondaryColor: "#d64dff",
    tuning: { ...DEFAULT_TUNING, wetness: 0.72, viscosity: 0.3, relief: 0.2, flow: 0.88 },
    sensorMapping: { pressure: "flow", tilt: "none", speed: "particle-tail", dwell: "pooling" },
  }),
  recipe("dendritic-copper", "덴드라이트 코퍼", "구리색 안료가 다공성 표면에서 가지형으로 성장합니다.", {
    geometryId: "particle-stream",
    tipId: "grain-stamp",
    surfaceId: "porous-fiber",
    materialId: "particle-paint",
    pigmentId: "spectral",
    physicsIds: ["paper-absorption", "reaction-diffusion"],
    finishIds: ["wet-sheen", "grain-boost"],
    primaryColor: "#9d4f2e",
    secondaryColor: "#2aa889",
    tuning: { ...DEFAULT_TUNING, scatter: 0.42, grain: 0.54, wetness: 0.44, viscosity: 0.34 },
    sensorMapping: { pressure: "pigment-load", tilt: "pattern-rotation", speed: "spacing", dwell: "reaction-growth" },
  }),
  recipe("holographic-stitch", "홀로그래픽 스티치", "경로 문양과 틸트 회전, 색상 순환을 결합합니다.", {
    motionId: "lazy-leash",
    geometryId: "motif-path",
    tipId: "motif-atlas",
    surfaceId: "smooth-film",
    materialId: "light",
    patternId: "stitch",
    finishIds: ["neon-bloom", "chroma-fringe"],
    primaryColor: "#56d7ff",
    secondaryColor: "#ff63b8",
    tuning: { ...DEFAULT_TUNING, patternScale: 1.25, scatter: 0.04, relief: 0.16 },
    sensorMapping: { pressure: "size", tilt: "pattern-rotation", speed: "spacing", dwell: "none" },
  }),
  recipe("moss-flow", "모스 플로우", "플로우필드를 따라 잎·이끼 모티프가 증식합니다.", {
    motionId: "brush-inertia",
    strokeEngineId: "p5-brush",
    geometryId: "motif-path",
    tipId: "motif-atlas",
    surfaceId: "watercolor-coldpress",
    materialId: "watercolor",
    pigmentId: "spectral",
    physicsIds: ["paper-absorption"],
    patternId: "flow-field",
    finishIds: ["grain-boost"],
    primaryColor: "#315f36",
    secondaryColor: "#9aae4f",
    tuning: { ...DEFAULT_TUNING, patternScale: 1.4, scatter: 0.56, wetness: 0.38, grain: 0.42 },
    sensorMapping: { pressure: "pigment-load", tilt: "pattern-rotation", speed: "spacing", dwell: "emission" },
  }),
]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function hasId<Id extends string>(options: readonly BrushStudioV5Option<Id>[], value: unknown): value is Id {
  return typeof value === "string" && options.some((candidate) => candidate.id === value);
}

function readId<Id extends string>(options: readonly BrushStudioV5Option<Id>[], value: unknown, fallback: Id): Id {
  return hasId(options, value) ? value : fallback;
}

function uniqueKnown<Id extends string>(options: readonly BrushStudioV5Option<Id>[], values: unknown): readonly Id[] {
  if (!Array.isArray(values)) return Object.freeze([]);
  return Object.freeze([...new Set(values.filter((value): value is Id => hasId(options, value)))]);
}

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}

function safeName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;
}

function safeSeed(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff
    ? value
    : fallback;
}

export function normalizeBrushStudioV5Draft(value: unknown): BrushStudioV5Draft {
  const fallback = createDefaultBrushStudioV5Draft();
  const source = record(value);
  const tuning = record(source.tuning);
  const sensor = record(source.sensorMapping);
  const pressureTargets: readonly BrushStudioV5PressureTarget[] = ["size", "opacity", "flow", "pigment-load", "wetness"];
  const tiltTargets: readonly BrushStudioV5TiltTarget[] = ["none", "contact-width", "tip-angle", "bristle-spread", "pattern-rotation"];
  const speedTargets: readonly BrushStudioV5SpeedTarget[] = ["none", "opacity", "spacing", "dryness", "particle-tail"];
  const dwellTargets: readonly BrushStudioV5DwellTarget[] = ["none", "pooling", "height", "emission", "reaction-growth"];

  return Object.freeze({
    schemaVersion: BRUSH_STUDIO_V5_SCHEMA_VERSION,
    id: safeName(source.id, fallback.id),
    name: safeName(source.name, fallback.name),
    seed: safeSeed(source.seed, fallback.seed),
    quality: source.quality === "draft" || source.quality === "balanced" || source.quality === "pro"
      ? source.quality
      : fallback.quality,
    motionId: readId(BRUSH_STUDIO_V5_MOTIONS, source.motionId, fallback.motionId),
    strokeEngineId: readId(BRUSH_STUDIO_V5_STROKE_ENGINES, source.strokeEngineId, fallback.strokeEngineId),
    geometryId: readId(BRUSH_STUDIO_V5_GEOMETRIES, source.geometryId, fallback.geometryId),
    tipId: readId(BRUSH_STUDIO_V5_TIPS, source.tipId, fallback.tipId),
    surfaceId: readId(BRUSH_STUDIO_V5_SURFACES, source.surfaceId, fallback.surfaceId),
    materialId: readId(BRUSH_STUDIO_V5_MATERIALS, source.materialId, fallback.materialId),
    pigmentId: readId(BRUSH_STUDIO_V5_PIGMENTS, source.pigmentId, fallback.pigmentId),
    physicsIds: uniqueKnown(BRUSH_STUDIO_V5_PHYSICS, source.physicsIds),
    patternId: readId(BRUSH_STUDIO_V5_PATTERNS, source.patternId, fallback.patternId),
    finishIds: uniqueKnown(BRUSH_STUDIO_V5_FINISHES, source.finishIds),
    primaryColor: safeColor(source.primaryColor, fallback.primaryColor),
    secondaryColor: safeColor(source.secondaryColor, fallback.secondaryColor),
    tuning: Object.freeze({
      size: clamp(Number(tuning.size ?? fallback.tuning.size), 1, 160),
      flow: clamp(Number(tuning.flow ?? fallback.tuning.flow), 0.02, 1),
      grain: clamp(Number(tuning.grain ?? fallback.tuning.grain), 0, 1),
      wetness: clamp(Number(tuning.wetness ?? fallback.tuning.wetness), 0, 1),
      viscosity: clamp(Number(tuning.viscosity ?? fallback.tuning.viscosity), 0, 1),
      scatter: clamp(Number(tuning.scatter ?? fallback.tuning.scatter), 0, 1),
      relief: clamp(Number(tuning.relief ?? fallback.tuning.relief), 0, 1),
      patternScale: clamp(Number(tuning.patternScale ?? fallback.tuning.patternScale), 0.25, 4),
      stabilization: clamp(Number(tuning.stabilization ?? fallback.tuning.stabilization), 0, 1),
    }),
    sensorMapping: Object.freeze({
      pressure: pressureTargets.includes(sensor.pressure as BrushStudioV5PressureTarget)
        ? sensor.pressure as BrushStudioV5PressureTarget
        : fallback.sensorMapping.pressure,
      tilt: tiltTargets.includes(sensor.tilt as BrushStudioV5TiltTarget)
        ? sensor.tilt as BrushStudioV5TiltTarget
        : fallback.sensorMapping.tilt,
      speed: speedTargets.includes(sensor.speed as BrushStudioV5SpeedTarget)
        ? sensor.speed as BrushStudioV5SpeedTarget
        : fallback.sensorMapping.speed,
      dwell: dwellTargets.includes(sensor.dwell as BrushStudioV5DwellTarget)
        ? sensor.dwell as BrushStudioV5DwellTarget
        : fallback.sensorMapping.dwell,
    }),
  });
}

export function parseBrushStudioV5Draft(text: string): BrushStudioV5Draft {
  const parsed: unknown = JSON.parse(text);
  const source = record(parsed);
  return normalizeBrushStudioV5Draft("program" in source ? source.program : source);
}

function findOption<Id extends string>(options: readonly BrushStudioV5Option<Id>[], id: Id): BrushStudioV5Option<Id> {
  return options.find((candidate) => candidate.id === id) ?? options[0]!;
}

function issue(id: string, severity: BrushStudioV5Severity, title: string, description: string): BrushStudioV5Issue {
  return Object.freeze({ id, severity, title, description });
}

export function analyzeBrushStudioV5Draft(input: BrushStudioV5Draft): BrushStudioV5Analysis {
  const draft = normalizeBrushStudioV5Draft(input);
  const physics = new Set(draft.physicsIds);
  const finishes = new Set(draft.finishIds);
  const issues: BrushStudioV5Issue[] = [];
  const wetMaterials: readonly BrushStudioV5MaterialId[] = ["watercolor", "living-ink", "gouache", "acrylic", "oil", "light"];
  const dryMaterials: readonly BrushStudioV5MaterialId[] = ["graphite", "charcoal", "wax"];
  const thickMaterials: readonly BrushStudioV5MaterialId[] = ["gouache", "acrylic", "oil"];

  if (draft.strokeEngineId === "perfect-freehand" && draft.geometryId !== "pressure-outline") {
    issues.push(issue("perfect-outline", "error", "Perfect Freehand 기하 불일치", "필압 외곽선 기하가 필요합니다."));
  }
  if (draft.strokeEngineId === "google-ink" && draft.geometryId !== "google-mesh") {
    issues.push(issue("google-mesh", "error", "Google Ink 메시 필요", "Google Ink는 잉크 메시 기하가 필요합니다."));
  }
  if (draft.strokeEngineId === "inkwash") {
    if (!wetMaterials.includes(draft.materialId)) {
      issues.push(issue("inkwash-material", "error", "Inkwash 재료 불일치", "흐를 수 있는 습식 재료를 선택하세요."));
    }
    if (!physics.has("inkwash-flow")) {
      issues.push(issue("inkwash-flow", "error", "Inkwash 유체 누락", "이동 안료·수분·건조 authority를 추가하세요."));
    }
  }
  if (draft.strokeEngineId === "p5-brush" && !(["flow-field", "cross-hatch", "kaleido"] as readonly string[]).includes(draft.patternId)) {
    issues.push(issue("p5-pattern", "warning", "p5.brush 활용도가 낮음", "플로우필드·해칭·칼레이도에서 차이가 큽니다."));
  }
  if ((draft.strokeEngineId === "libmypaint" || draft.strokeEngineId === "hokusai") && (draft.materialId === "light" || draft.materialId === "particle-paint")) {
    issues.push(issue("mypaint-material", "warning", "자연매체 엔진과 재료가 어울리지 않음", "잉크·건식·회화 재료를 권장합니다."));
  }
  if (draft.strokeEngineId === "krita"
    && !(["dual-tip", "bristle-fan", "normal-map-tip"] as readonly string[]).includes(draft.tipId)
    && !physics.has("krita-color-smudge")
    && !physics.has("bristle-dynamics")
    && !physics.has("particle-ballistics")) {
    issues.push(issue("krita-specialist", "warning", "Krita 전문 기능 미선택", "Dual Tip·Hairy·Spray·Color Smudge를 선택하세요."));
  }
  if (physics.has("dry-contact") && !dryMaterials.includes(draft.materialId)) {
    issues.push(issue("dry-contact-material", "warning", "건식 접촉과 재료가 다름", "흑연·목탄·왁스에서 가장 자연스럽습니다."));
  }
  if (physics.has("paper-absorption") && !wetMaterials.includes(draft.materialId) && draft.materialId !== "particle-paint") {
    issues.push(issue("absorption-material", "warning", "흡수 물리와 재료가 다름", "수분이나 묽은 재료가 필요합니다."));
  }
  if (physics.has("inkwash-flow") && !wetMaterials.includes(draft.materialId)) {
    issues.push(issue("flow-material", "error", "유체가 이동시킬 재료가 없음", "습식 또는 발광 유체 재료를 선택하세요."));
  }
  if (physics.has("thin-film") && !wetMaterials.includes(draft.materialId)) {
    issues.push(issue("film-material", "error", "박막 재료 필요", "흐를 수 있는 재료가 필요합니다."));
  }
  if (physics.has("bristle-dynamics") && draft.geometryId !== "bristle-bundle" && draft.tipId !== "bristle-fan") {
    issues.push(issue("bristle-contact", "warning", "강모 접촉 형상 부족", "강모 번들 기하 또는 팬 강모 촉을 권장합니다."));
  }
  if (physics.has("height-relief") && !thickMaterials.includes(draft.materialId)) {
    issues.push(issue("height-material", "warning", "릴리프가 얇은 재료에 적용됨", "과슈·아크릴·유화에서 가장 사실적입니다."));
  }
  if (physics.has("reaction-diffusion") && draft.tuning.wetness < 0.15) {
    issues.push(issue("reaction-medium", "warning", "반응 확산 매질 부족", "수분을 높여 성장 패턴을 드러내세요."));
  }
  if (draft.pigmentId === "inkwash-density" && draft.materialId !== "watercolor" && draft.materialId !== "living-ink") {
    issues.push(issue("density-material", "error", "Inkwash 광학 밀도 불일치", "수채 또는 리빙 잉크에만 연결할 수 있습니다."));
  }
  if (draft.pigmentId === "mixbox" && !(["marker", "watercolor", "gouache", "acrylic", "oil", "wax"] as readonly string[]).includes(draft.materialId)) {
    issues.push(issue("mixbox-material", "warning", "Mixbox 차이가 작을 가능성", "혼색이 핵심인 회화 재료에서 사용하세요."));
  }
  if (draft.pigmentId === "rgb" && (physics.has("pigment-reservoir") || physics.has("krita-color-smudge")) && draft.materialId !== "clean-ink" && draft.materialId !== "light") {
    issues.push(issue("rgb-pickup", "info", "광학 혼합 모드", "회화 혼색은 Spectral·Open K/S·Pigment LUT가 더 자연스럽습니다."));
  }
  if (finishes.has("relief-lighting") && !physics.has("height-relief")) {
    issues.push(issue("relief-source", "warning", "릴리프 조명의 높이 필드 누락", "높이·릴리프 물리를 추가하세요."));
  }
  if (finishes.has("wet-sheen") && draft.tuning.wetness < 0.1 && !physics.has("inkwash-flow")) {
    issues.push(issue("sheen-wetness", "warning", "젖은 광택의 수분 부족", "수분 또는 습식 물리를 높이세요."));
  }

  const selected: readonly BrushStudioV5Option[] = [
    findOption(BRUSH_STUDIO_V5_MOTIONS, draft.motionId),
    findOption(BRUSH_STUDIO_V5_STROKE_ENGINES, draft.strokeEngineId),
    findOption(BRUSH_STUDIO_V5_GEOMETRIES, draft.geometryId),
    findOption(BRUSH_STUDIO_V5_TIPS, draft.tipId),
    findOption(BRUSH_STUDIO_V5_SURFACES, draft.surfaceId),
    findOption(BRUSH_STUDIO_V5_MATERIALS, draft.materialId),
    findOption(BRUSH_STUDIO_V5_PIGMENTS, draft.pigmentId),
    findOption(BRUSH_STUDIO_V5_PATTERNS, draft.patternId),
    ...draft.physicsIds.map((id) => findOption(BRUSH_STUDIO_V5_PHYSICS, id)),
    ...draft.finishIds.map((id) => findOption(BRUSH_STUDIO_V5_FINISHES, id)),
  ];
  const rawCost = selected.reduce((sum, candidate) => sum + candidate.cost, 0);
  const rawRealism = selected.reduce((sum, candidate) => sum + candidate.realism, 0);
  const qualityFactor = draft.quality === "draft" ? 0.72 : draft.quality === "pro" ? 1.22 : 1;
  const complexityScore = Math.round(clamp(rawCost * 3.2 * qualityFactor, 0, 100));
  const performanceScore = Math.round(clamp(104 - complexityScore * 0.72 - draft.physicsIds.length * 2.5, 0, 100));
  const realismScore = Math.round(clamp(24 + rawRealism * 2.15 + draft.tuning.grain * 8 + draft.tuning.relief * 8, 0, 100));
  const uniquenessScore = Math.round(clamp(
    24
      + draft.physicsIds.length * 7
      + draft.finishIds.length * 4
      + (draft.patternId === "none" ? 0 : 14)
      + (draft.pigmentId === "rgb" ? 0 : 8)
      + (draft.strokeEngineId === "native-webgpu" || draft.strokeEngineId === "perfect-freehand" ? 0 : 8),
    0,
    100,
  ));
  const executionPlan = Object.freeze([
    `${findOption(BRUSH_STUDIO_V5_MOTIONS, draft.motionId).label} · 입력`,
    `${findOption(BRUSH_STUDIO_V5_STROKE_ENGINES, draft.strokeEngineId).label} · 캐리어`,
    `${findOption(BRUSH_STUDIO_V5_GEOMETRIES, draft.geometryId).label} + ${findOption(BRUSH_STUDIO_V5_TIPS, draft.tipId).label}`,
    `${findOption(BRUSH_STUDIO_V5_SURFACES, draft.surfaceId).label} · 표면`,
    `${findOption(BRUSH_STUDIO_V5_MATERIALS, draft.materialId).label} + ${findOption(BRUSH_STUDIO_V5_PIGMENTS, draft.pigmentId).label}`,
    ...draft.physicsIds.map((id) => `${findOption(BRUSH_STUDIO_V5_PHYSICS, id).label} · 물리`),
    ...(draft.patternId === "none" ? [] : [`${findOption(BRUSH_STUDIO_V5_PATTERNS, draft.patternId).label} · 패턴`]),
    ...draft.finishIds.map((id) => `${findOption(BRUSH_STUDIO_V5_FINISHES, id).label} · 마감`),
  ]);

  return Object.freeze({
    valid: !issues.some((candidate) => candidate.severity === "error"),
    issues: Object.freeze(issues),
    performanceScore,
    realismScore,
    uniquenessScore,
    complexityScore,
    selectedModuleCount: selected.length,
    executionPlan,
  });
}

export function applyBrushStudioV5Recipe(current: BrushStudioV5Draft, recipeId: string): BrushStudioV5Draft {
  const selected = BRUSH_STUDIO_V5_RECIPES.find((candidate) => candidate.id === recipeId);
  if (!selected) return current;
  return normalizeBrushStudioV5Draft({ ...selected.program, id: current.id, name: selected.name, seed: current.seed });
}

export function toggleBrushStudioV5Physics(draft: BrushStudioV5Draft, id: BrushStudioV5PhysicsId): BrushStudioV5Draft {
  const values = new Set(draft.physicsIds);
  if (values.has(id)) values.delete(id); else values.add(id);
  return normalizeBrushStudioV5Draft({ ...draft, physicsIds: [...values] });
}

export function toggleBrushStudioV5Finish(draft: BrushStudioV5Draft, id: BrushStudioV5FinishId): BrushStudioV5Draft {
  const values = new Set(draft.finishIds);
  if (values.has(id)) values.delete(id); else values.add(id);
  return normalizeBrushStudioV5Draft({ ...draft, finishIds: [...values] });
}

export function optimizeBrushStudioV5Draft(draft: BrushStudioV5Draft): BrushStudioV5Draft {
  const physics = new Set(draft.physicsIds);
  let strokeEngineId: BrushStudioV5StrokeEngineId;
  let geometryId: BrushStudioV5GeometryId = draft.geometryId;
  let pigmentId: BrushStudioV5PigmentId = draft.pigmentId;

  if (draft.materialId === "living-ink" || physics.has("inkwash-flow")) {
    strokeEngineId = "inkwash";
    physics.add("inkwash-flow");
    if (draft.materialId === "living-ink") pigmentId = "inkwash-density";
  } else if (draft.patternId === "flow-field" && draft.strokeEngineId === "p5-brush") {
    strokeEngineId = "p5-brush";
  } else if (draft.geometryId === "google-mesh") {
    strokeEngineId = "google-ink";
  } else if (draft.geometryId === "pressure-outline" && draft.strokeEngineId === "perfect-freehand") {
    strokeEngineId = "perfect-freehand";
  } else {
    strokeEngineId = "native-webgpu";
  }

  if (strokeEngineId === "perfect-freehand") geometryId = "pressure-outline";
  if (strokeEngineId === "google-ink") geometryId = "google-mesh";
  const finishIds = physics.has("height-relief") && !draft.finishIds.includes("relief-lighting")
    ? [...draft.finishIds, "relief-lighting" as const]
    : draft.finishIds;
  return normalizeBrushStudioV5Draft({
    ...draft,
    strokeEngineId,
    geometryId,
    pigmentId,
    physicsIds: [...physics],
    finishIds,
  });
}

function lcg(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function choose<T>(values: readonly T[], random: () => number): T {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))]!;
}

export function randomizeBrushStudioV5Draft(draft: BrushStudioV5Draft): BrushStudioV5Draft {
  const random = lcg((draft.seed + 1) >>> 0);
  const selectedRecipe = choose(BRUSH_STUDIO_V5_RECIPES, random);
  const next = applyBrushStudioV5Recipe(
    normalizeBrushStudioV5Draft({ ...draft, seed: (draft.seed + 1) >>> 0 }),
    selectedRecipe.id,
  );
  const patternId = random() > 0.58
    ? choose(BRUSH_STUDIO_V5_PATTERNS.map((candidate) => candidate.id), random)
    : next.patternId;
  return normalizeBrushStudioV5Draft({
    ...next,
    id: draft.id,
    name: `${selectedRecipe.name} 변형`,
    seed: (draft.seed + 1) >>> 0,
    patternId,
    tuning: {
      ...next.tuning,
      grain: clamp(next.tuning.grain + (random() - 0.5) * 0.24, 0, 1),
      wetness: clamp(next.tuning.wetness + (random() - 0.5) * 0.24, 0, 1),
      scatter: clamp(next.tuning.scatter + (random() - 0.5) * 0.2, 0, 1),
      relief: clamp(next.tuning.relief + (random() - 0.5) * 0.2, 0, 1),
      patternScale: clamp(next.tuning.patternScale * (0.82 + random() * 0.36), 0.25, 4),
    },
  });
}

export function brushStudioV5OptionLabel(
  category: "motion" | "engine" | "geometry" | "tip" | "surface" | "material" | "pigment" | "physics" | "pattern" | "finish",
  id: string,
): string {
  const groups: Readonly<Record<typeof category, readonly BrushStudioV5Option[]>> = {
    motion: BRUSH_STUDIO_V5_MOTIONS,
    engine: BRUSH_STUDIO_V5_STROKE_ENGINES,
    geometry: BRUSH_STUDIO_V5_GEOMETRIES,
    tip: BRUSH_STUDIO_V5_TIPS,
    surface: BRUSH_STUDIO_V5_SURFACES,
    material: BRUSH_STUDIO_V5_MATERIALS,
    pigment: BRUSH_STUDIO_V5_PIGMENTS,
    physics: BRUSH_STUDIO_V5_PHYSICS,
    pattern: BRUSH_STUDIO_V5_PATTERNS,
    finish: BRUSH_STUDIO_V5_FINISHES,
  };
  return groups[category].find((candidate) => candidate.id === id)?.label ?? id;
}
