import { defineBrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";
import type { BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

/** V7.1 signatures deliberately span different physical mechanisms, not parameter-only variants. */
export const BRUSH_STUDIO_V7_ADVANCED_RECIPE_SEEDS: readonly BrushStudioV6RecipeSeed[] = Object.freeze([
  defineBrushStudioV6RecipeSeed("v7-backrun-cauliflower", "콜드프레스 콜리플라워 백런", "수채·백런", "반건조 경계로 물이 역침투하며 꽃양배추 모양의 어두운 경계를 만드는 수채", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-hokusai-dabs", tip: "tip-chisel-sdf", surface: "surface-v7-rough-watercolor", deposition: "deposit-wet", pigment: "pigment-open-km", physics: ["physics-porous-paper", "physics-inkwash", "physics-backrun-capillary"], finish: ["finish-edge-bloom"] },
    tuning: { size: 52, opacity: 0.64, flow: 0.48, wetness: 0.88, absorbency: 0.66, diffusion: 0.88, evaporation: 0.74, advection: 0.62, granulation: 0.42, edgeDarkening: 0.76 },
  }),
  defineBrushStudioV6RecipeSeed("v7-backrun-kozo-tide", "코조 화지 백런 타이드", "수묵·백런", "닥 섬유를 따라 비대칭 모세관 백런이 길게 찢어지는 먹 워시", {
    slots: { carrier: "carrier-hokusai-dabs", tip: "tip-chisel-sdf", surface: "surface-v7-washi-kozo", deposition: "deposit-wet", pigment: "pigment-inkwash-density", physics: ["physics-porous-paper", "physics-inkwash", "physics-backrun-capillary"], finish: ["finish-edge-bloom", "finish-wet-sheen"] },
    tuning: { size: 38, opacity: 0.72, flow: 0.54, wetness: 0.82, absorbency: 0.92, diffusion: 0.68, evaporation: 0.8, advection: 0.8, granulation: 0.36, edgeDarkening: 0.7 },
  }),
  defineBrushStudioV6RecipeSeed("v7-backrun-vellum-glaze", "벨럼 미세 백런 글레이즈", "수채·백런", "흡수성이 낮은 벨럼 위에서 작은 백런 고리가 겹치는 투명 글레이즈", {
    slots: { carrier: "carrier-libmypaint-dabs", surface: "surface-v7-vellum", deposition: "deposit-wet", pigment: "pigment-spectral", physics: ["physics-inkwash", "physics-backrun-capillary"], finish: ["finish-wet-sheen"] },
    tuning: { size: 24, opacity: 0.5, flow: 0.38, wetness: 0.72, absorbency: 0.24, diffusion: 0.52, evaporation: 0.9, advection: 0.34, granulation: 0.18 },
  }),
  defineBrushStudioV6RecipeSeed("v7-sediment-cobalt-granulation", "코발트 침전 과립", "수채·침전", "거친 종이 골에 무거운 광물 안료가 침전해 점상 과립을 남기는 수채", {
    slots: { carrier: "carrier-hokusai-dabs", surface: "surface-v7-rough-watercolor", deposition: "deposit-wet", pigment: "pigment-open-km", physics: ["physics-porous-paper", "physics-inkwash", "physics-pigment-sedimentation"], finish: ["finish-edge-bloom"] },
    tuning: { size: 44, opacity: 0.7, flow: 0.52, wetness: 0.82, absorbency: 0.72, diffusion: 0.5, granulation: 1, surfaceTooth: 0.86, edgeDarkening: 0.36 },
  }),
  defineBrushStudioV6RecipeSeed("v7-sediment-stone-ochre", "스톤 그릿 오커 침전", "수채·침전", "석분 표면의 미세 홈에 오커 안료가 뭉쳐 남는 무거운 미네랄 워시", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-chisel-sdf", surface: "surface-v7-stone-grit", deposition: "deposit-wet", pigment: "pigment-open-km", physics: ["physics-inkwash", "physics-pigment-sedimentation"], finish: ["finish-wet-sheen"] },
    tuning: { size: 36, opacity: 0.76, flow: 0.58, wetness: 0.66, absorbency: 0.46, diffusion: 0.34, granulation: 0.96, surfaceTooth: 0.94 },
  }),
  defineBrushStudioV6RecipeSeed("v7-sediment-laid-puddle", "레이드 페이퍼 침전 퍼들", "수채·침전", "제지망 골을 따라 안료가 줄무늬로 가라앉는 얕은 퍼들 수채", {
    slots: { carrier: "carrier-libmypaint-dabs", surface: "surface-v7-laid-paper", deposition: "deposit-wet", pigment: "pigment-spectral", physics: ["physics-inkwash", "physics-pigment-sedimentation"], finish: ["finish-edge-bloom"] },
    tuning: { size: 32, opacity: 0.62, flow: 0.48, wetness: 0.72, absorbency: 0.58, diffusion: 0.42, granulation: 0.82, surfaceTooth: 0.76, edgeDarkening: 0.42 },
  }),
  defineBrushStudioV6RecipeSeed("v7-backrun-sediment-superbloom", "백런 세디먼트 슈퍼블룸", "수채·하이브리드", "백런 경계와 광물 침전을 동시에 만들어 한 획 안에서 밝은 수로와 어두운 과립이 공존", {
    slots: { motion: "motion-spring", carrier: "carrier-hokusai-dabs", surface: "surface-v7-rough-watercolor", deposition: "deposit-wet", pigment: "pigment-open-km", physics: ["physics-porous-paper", "physics-inkwash", "physics-backrun-capillary", "physics-pigment-sedimentation"], finish: ["finish-edge-bloom", "finish-wet-sheen"] },
    tuning: { size: 58, opacity: 0.68, flow: 0.46, wetness: 0.9, absorbency: 0.7, diffusion: 0.9, evaporation: 0.8, advection: 0.7, granulation: 0.92, surfaceTooth: 0.88, edgeDarkening: 0.78 },
  }),
  defineBrushStudioV6RecipeSeed("v7-split-fan-oil", "스플릿 팬 브러시 오일", "강모·분리", "마찰과 압력 변화에 따라 강모 다발이 갈라졌다 다시 붙는 넓은 팬 브러시 유화", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-webgpu-ribbon", surface: "surface-v7-canvas-heavy", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir", pigment: "pigment-open-km", physics: ["physics-bristle", "physics-bristle-split-merge", "physics-height"], finish: ["finish-directional-relief"] },
    tuning: { size: 72, opacity: 0.96, flow: 0.84, pickup: 0.42, reservoir: 0.82, friction: 0.82, viscosity: 0.62, bristleStrands: 112, bristleIterations: 4, relief: 0.7, gloss: 0.48, surfaceTooth: 0.7 },
  }),
  defineBrushStudioV6RecipeSeed("v7-split-filbert-gesso", "스플릿 필버트 젯소", "강모·분리", "젯소의 긴 릿지를 만나면 끝단이 여러 묶음으로 벌어지는 필버트형 오일 브러시", {
    slots: { carrier: "carrier-libmypaint-dabs", surface: "surface-v7-gesso-brush", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir", pigment: "pigment-spectral", physics: ["physics-bristle", "physics-bristle-split-merge", "physics-height"], finish: ["finish-directional-relief"] },
    tuning: { size: 54, opacity: 0.92, flow: 0.78, pickup: 0.28, reservoir: 0.72, friction: 0.9, viscosity: 0.54, bristleStrands: 84, bristleIterations: 4, relief: 0.62, gloss: 0.36, surfaceTooth: 0.82 },
  }),
  defineBrushStudioV6RecipeSeed("v7-split-sumi-broom", "화지 스플릿 수묵 빗자루", "강모·수묵", "낮은 필압에서 털 다발이 길게 갈라져 여러 먹선을 동시에 남기는 빗자루붓", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-webgpu-ribbon", surface: "surface-v7-washi-kozo", deposition: "deposit-ink", pigment: "pigment-inkwash-density", physics: ["physics-bristle", "physics-bristle-split-merge", "physics-inkwash"] },
    tuning: { size: 48, opacity: 0.84, flow: 0.68, friction: 0.94, viscosity: 0.28, reservoir: 0.56, bristleStrands: 64, bristleIterations: 3, surfaceTooth: 0.74 },
  }),
  defineBrushStudioV6RecipeSeed("v7-split-dry-rake", "샌디드 스플릿 드라이 레이크", "강모·건식", "사포 결 위에서 마른 강모가 여러 갈래로 찢어져 긁힘 자국을 만드는 레이크", {
    slots: { carrier: "carrier-webgpu-ribbon", surface: "surface-v7-sanded-pastel", deposition: "deposit-dry", pigment: "pigment-spectral", physics: ["physics-bristle", "physics-bristle-split-merge", "physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 42, opacity: 0.88, flow: 0.7, friction: 1, viscosity: 0.18, reservoir: 0.38, bristleStrands: 52, bristleIterations: 3, surfaceTooth: 0.96, granulation: 0.78 },
  }),
  defineBrushStudioV6RecipeSeed("v7-merge-loaded-filbert", "로드드 필버트 머지", "강모·병합", "높은 점도와 필압에서 갈라진 강모가 다시 두꺼운 중심 다발로 합쳐지는 로드드 필버트", {
    slots: { carrier: "carrier-webgpu-ribbon", surface: "surface-v7-canvas-heavy", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir", pigment: "pigment-open-km", physics: ["physics-bristle", "physics-bristle-split-merge", "physics-height"], finish: ["finish-directional-relief"] },
    tuning: { size: 64, opacity: 0.98, flow: 0.88, pickup: 0.56, reservoir: 0.94, friction: 0.44, viscosity: 0.96, bristleStrands: 92, bristleIterations: 5, relief: 0.82, gloss: 0.58, surfaceTooth: 0.62 },
  }),
  defineBrushStudioV6RecipeSeed("v7-split-calligraphy-fan", "스플릿 캘리그래피 팬", "강모·서예", "회전과 마찰에 따라 여러 세필이 나타났다 사라지는 다중선 서예 붓", {
    slots: { motion: "motion-spring", carrier: "carrier-webgpu-ribbon", tip: "tip-chisel-sdf", surface: "surface-v7-laid-paper", deposition: "deposit-ink", pigment: "pigment-spectral", physics: ["physics-bristle", "physics-bristle-split-merge"] },
    tuning: { size: 34, opacity: 0.94, flow: 0.82, friction: 0.88, viscosity: 0.34, reservoir: 0.58, bristleStrands: 44, bristleIterations: 3, surfaceTooth: 0.58 },
  }),
  defineBrushStudioV6RecipeSeed("v7-raking-light-impasto", "레이킹 라이트 캔버스 임파스토", "임파스토·조명", "로드된 강모 능선마다 고정 사광의 밝기와 그림자가 달라지는 저스트랜드 임파스토", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-webgpu-ribbon", tip: "tip-pigment-normal", surface: "surface-v7-canvas-heavy", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir", pigment: "pigment-open-km", physics: ["physics-bristle", "physics-height"], finish: ["finish-relief", "finish-directional-relief"] },
    tuning: { size: 88, opacity: 0.98, flow: 0.92, pickup: 0.46, reservoir: 0.92, friction: 0.5, viscosity: 0.82, bristleStrands: 38, bristleIterations: 3, plasticity: 0.82, relief: 1, gloss: 0.72, surfaceTooth: 0.74 },
  }),
  defineBrushStudioV6RecipeSeed("v7-crosslight-gesso-bristle", "크로스라이트 젯소 브리슬", "임파스토·조명", "고마찰 짧은 강모가 젯소 릿지를 가로지르며 교차 능선과 방향성 명암을 만드는 브러시", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-pigment-normal", surface: "surface-v7-gesso-brush", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir", pigment: "pigment-spectral", physics: ["physics-bristle", "physics-height"], finish: ["finish-directional-relief"] },
    tuning: { size: 68, opacity: 0.96, flow: 0.82, pickup: 0.3, reservoir: 0.78, friction: 0.96, viscosity: 0.58, bristleStrands: 26, bristleIterations: 3, plasticity: 0.7, relief: 0.86, gloss: 0.4, surfaceTooth: 0.9 },
  }),
  defineBrushStudioV6RecipeSeed("v7-metallic-stone-relief", "스톤 메탈릭 릴리프", "임파스토·조명", "석분 위 얇은 메탈릭 페인트가 릿지 방향에 따라 반짝임과 음영을 교차시키는 릴리프", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-chisel-sdf", surface: "surface-v7-stone-grit", deposition: "deposit-oil", pigment: "pigment-spectral", physics: ["physics-height"], finish: ["finish-directional-relief"] },
    tuning: { size: 48, opacity: 0.9, flow: 0.74, reservoir: 0.64, viscosity: 0.76, plasticity: 0.68, relief: 0.78, gloss: 0.96, surfaceTooth: 0.92 },
  }),
  defineBrushStudioV6RecipeSeed("v7-split-raking-impasto", "스플릿 레이킹 임파스토", "임파스토·하이브리드", "갈라지는 강모 능선과 방향성 조명을 동시에 사용해 실제 페인트 융기를 강조", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-webgpu-ribbon", surface: "surface-v7-canvas-heavy", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir", pigment: "pigment-open-km", physics: ["physics-bristle", "physics-bristle-split-merge", "physics-height"], finish: ["finish-directional-relief"] },
    tuning: { size: 80, opacity: 0.98, flow: 0.88, pickup: 0.44, reservoir: 0.9, friction: 0.76, viscosity: 0.8, bristleStrands: 104, bristleIterations: 4, relief: 0.94, gloss: 0.68, surfaceTooth: 0.78 },
  }),
  defineBrushStudioV6RecipeSeed("v7-vector-windgrass", "윈드필드 그래스", "벡터필드", "문서 좌표의 바람장에 따라 평행 스트로크가 휘어지는 초원·머리카락용 벡터 브러시", {
    slots: { carrier: "carrier-webgpu-ribbon", surface: "surface-v7-kraft-fiber", deposition: "deposit-dry", pigment: "pigment-spectral", pattern: "pattern-vector-flow", finish: ["finish-grain"] },
    tuning: { size: 34, opacity: 0.88, flow: 0.72, patternDensity: 0.72, patternScale: 1.3, patternJitter: 0.68, surfaceTooth: 0.54, granulation: 0.36 },
  }),
  defineBrushStudioV6RecipeSeed("v7-vector-vortex-ink", "볼텍스 필드 잉크", "벡터필드", "반복되는 국소 소용돌이장을 따라 잉크 리본이 회전하는 에너지·연기용 브러시", {
    slots: { carrier: "carrier-webgpu-centerline", surface: "surface-smooth", deposition: "deposit-ink", pigment: "pigment-spectral", pattern: "pattern-vector-vortex" },
    tuning: { size: 30, opacity: 0.9, flow: 0.78, patternDensity: 0.64, patternScale: 1.6, patternJitter: 0.34 },
  }),
  defineBrushStudioV6RecipeSeed("v7-vector-contour-etch", "컨투어 필드 에칭", "벡터필드", "완만한 등고 벡터장을 따라 짧은 에칭선이 정렬되어 지형·금속 음영을 만드는 브러시", {
    slots: { carrier: "carrier-webgpu-centerline", surface: "surface-v7-laid-paper", deposition: "deposit-ink", pigment: "pigment-spectral", pattern: "pattern-vector-contour" },
    tuning: { size: 26, opacity: 0.92, flow: 0.76, patternDensity: 0.82, patternScale: 0.78, patternJitter: 0.18, surfaceTooth: 0.44 },
  }),
  defineBrushStudioV6RecipeSeed("v7-vector-smoke-stream", "스모크 스트림 필드", "벡터필드", "큰 스케일의 흐름장을 따라 반투명 섬유선이 겹쳐 연기와 구름의 운동감을 만드는 스트림", {
    slots: { carrier: "carrier-webgpu-ribbon", surface: "surface-smooth", deposition: "deposit-ink", pigment: "pigment-spectral", pattern: "pattern-vector-flow", finish: ["finish-chroma"], physics: ["physics-porous-paper"] },
    tuning: { size: 46, opacity: 0.46, flow: 0.42, patternDensity: 0.5, patternScale: 2.4, patternJitter: 0.9, diffusion: 0.42 },
  }),
  defineBrushStudioV6RecipeSeed("v7-textile-satin-thread", "새틴 광택 스레드", "텍스타일", "긴 경사와 짧은 위사가 교차하고 실 높이에 방향성 광택이 생기는 새틴 직조", {
    slots: { carrier: "carrier-webgpu-centerline", surface: "surface-v7-vellum", deposition: "deposit-ink", pigment: "pigment-spectral", physics: ["physics-height"], pattern: "pattern-textile-satin", finish: ["finish-directional-relief"] },
    tuning: { size: 32, opacity: 0.94, flow: 0.82, patternDensity: 0.72, patternScale: 0.72, patternJitter: 0.08, relief: 0.68, gloss: 0.92 },
  }),
  defineBrushStudioV6RecipeSeed("v7-textile-twill-denim", "트윌 데님 위브", "텍스타일", "행마다 위상이 어긋나는 사선 능선으로 데님·능직 천의 조직감을 만드는 브러시", {
    slots: { carrier: "carrier-webgpu-centerline", surface: "surface-v7-canvas-heavy", deposition: "deposit-ink", pigment: "pigment-spectral", physics: ["physics-height"], pattern: "pattern-textile-twill", finish: ["finish-directional-relief"] },
    tuning: { size: 36, opacity: 0.96, flow: 0.84, patternDensity: 0.86, patternScale: 0.66, patternJitter: 0.12, relief: 0.58, gloss: 0.36 },
  }),
  defineBrushStudioV6RecipeSeed("v7-textile-wool-twill", "러프 울 트윌", "텍스타일", "거친 섬유가 들쭉날쭉 튀어나오는 저광택 능직으로 니트·모직 의상 질감을 빠르게 구축", {
    slots: { carrier: "carrier-webgpu-ribbon", surface: "surface-v7-kraft-fiber", deposition: "deposit-dry", pigment: "pigment-open-km", physics: ["physics-height"], pattern: "pattern-textile-twill", finish: ["finish-directional-relief", "finish-grain"] },
    tuning: { size: 42, opacity: 0.9, flow: 0.7, patternDensity: 0.68, patternScale: 1.15, patternJitter: 0.62, relief: 0.42, gloss: 0.08, surfaceTooth: 0.78, granulation: 0.56 },
  }),
]);