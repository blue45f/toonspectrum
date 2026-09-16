import { defineBrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";
import type { BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

/** Distinct artist-facing engine combinations rather than parameter-only aliases. */
export const BRUSH_STUDIO_V6_SHOWCASE_RECIPE_SEEDS: readonly BrushStudioV6RecipeSeed[] = Object.freeze([
  defineBrushStudioV6RecipeSeed(
    "technical-micron-vector", "마이크론 벡터 제도펜", "정밀 잉크",
    "Adaptive EMA 입력과 Perfect Freehand 외곽선을 결합한 균일 극세 제도펜",
    { slots: {
      motion: "motion-adaptive-ema", carrier: "carrier-perfect-outline", tip: "tip-round-sdf",
      surface: "surface-smooth", deposition: "deposit-ink", pickup: "pickup-none",
      pigment: "pigment-spectral", physics: [], pattern: "pattern-none", finish: [], output: "output-contact-canvas-svg",
    }, tuning: { size: 3, opacity: 1, flow: 0.94, spacing: 0.035, stabilization: 0.18 } },
  ),
  defineBrushStudioV6RecipeSeed(
    "linen-dry-bristle", "리넨 드라이 강모", "유화·강모",
    "Krita 강모와 높이장을 리넨 결 위에 얹어 마른 붓 갈라짐과 물감 융기를 함께 표현",
    { slots: {
      motion: "motion-brush-inertia", carrier: "carrier-krita-hairy", tip: "tip-pigment-normal",
      surface: "surface-linen", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir",
      pigment: "pigment-open-km", physics: ["physics-dry-contact", "physics-bristle", "physics-height"],
      pattern: "pattern-none", finish: ["finish-grain", "finish-relief"], output: "output-contact-canvas-svg",
    }, tuning: { size: 38, opacity: 0.9, flow: 0.74, spacing: 0.055, surfaceTooth: 0.78,
      friction: 0.66, pickup: 0.48, reservoir: 0.58, viscosity: 0.72, bristleStrands: 72,
      bristleIterations: 5, relief: 0.48 } },
  ),
  defineBrushStudioV6RecipeSeed(
    "salt-crystal-watercolor", "소금결 과립 수채", "수채·과립",
    "Hokusai 다브와 반응 확산을 결합해 젖은 종이에 소금 결정 같은 밝은 틈과 과립을 형성",
    { slots: {
      motion: "motion-spring", carrier: "carrier-hokusai-dabs", tip: "tip-grain-exemplar",
      surface: "surface-coldpress", deposition: "deposit-wet", pickup: "pickup-pigment-reservoir",
      pigment: "pigment-open-km", physics: ["physics-porous-paper", "physics-inkwash", "physics-reaction"],
      pattern: "pattern-none", finish: ["finish-edge-bloom", "finish-grain", "finish-wet-sheen"],
      output: "output-contact-canvas-svg",
    }, tuning: { size: 34, opacity: 0.58, flow: 0.42, spacing: 0.075, wetness: 0.88,
      absorbency: 0.7, diffusion: 0.68, granulation: 0.9, reactionRate: 0.46, edgeDarkening: 0.54 } },
  ),
  defineBrushStudioV6RecipeSeed(
    "velvet-dual-gouache", "벨벳 듀얼 과슈", "과슈·듀얼촉",
    "libmypaint 다브와 Krita 듀얼 촉을 결합해 매트한 불투명 면 안에 미세한 섬유 결을 남김",
    { slots: {
      motion: "motion-adaptive-ema", carrier: "carrier-libmypaint-dabs", tip: "tip-krita-dual",
      surface: "surface-kent", deposition: "deposit-marker", pickup: "pickup-krita-smudge",
      pigment: "pigment-spectral", physics: ["physics-porous-paper"], pattern: "pattern-none",
      finish: ["finish-grain"], output: "output-contact-canvas-svg",
    }, tuning: { size: 24, opacity: 0.94, flow: 0.86, spacing: 0.065, absorbency: 0.26,
      pickup: 0.18, granulation: 0.34, surfaceTooth: 0.42 } },
  ),
  defineBrushStudioV6RecipeSeed(
    "pigment-spray-glaze", "입자 에어 글레이즈", "분사·에어",
    "WebGPU 입자를 저농도로 누적해 밴딩 없는 피부 명암과 색 글레이즈를 만드는 소프트 분사",
    { slots: {
      motion: "motion-adaptive-ema", carrier: "carrier-webgpu-particles", tip: "tip-round-sdf",
      surface: "surface-smooth", deposition: "deposit-particles", pickup: "pickup-none",
      pigment: "pigment-spectral", physics: ["physics-particles"], pattern: "pattern-none",
      finish: [], output: "output-contact-canvas-svg",
    }, tuning: { size: 36, opacity: 0.3, flow: 0.18, spacing: 0.045, particleCount: 1536,
      patternJitter: 0.62, advection: 0.18 } },
  ),
  defineBrushStudioV6RecipeSeed(
    "engraved-crosshatch", "각인 크로스해치", "만화·해칭",
    "WebGPU 중심선과 판화지 접촉, 문서 고정 교차 해칭을 결합한 음영 전용 펜",
    { slots: {
      motion: "motion-adaptive-ema", carrier: "carrier-webgpu-centerline", tip: "tip-chisel-sdf",
      surface: "surface-printmaking", deposition: "deposit-dry", pickup: "pickup-none",
      pigment: "pigment-spectral", physics: ["physics-dry-contact"], pattern: "pattern-cross-hatch",
      finish: ["finish-grain"], output: "output-contact-canvas-svg",
    }, tuning: { size: 16, opacity: 0.82, flow: 0.76, spacing: 0.055, surfaceTooth: 0.76,
      patternDensity: 0.72, patternScale: 0.66, patternJitter: 0.12 } },
  ),
  defineBrushStudioV6RecipeSeed(
    "sumi-fiber-calligraphy", "섬유 수묵 캘리", "수묵·캘리",
    "치즐 촉과 Hokusai 다브, 광학 먹 밀도를 결합해 한 획 안에서 섬유 번짐과 먹 중심을 유지",
    { slots: {
      motion: "motion-brush-inertia", carrier: "carrier-hokusai-dabs", tip: "tip-chisel-sdf",
      surface: "surface-porous", deposition: "deposit-wet", pickup: "pickup-pigment-reservoir",
      pigment: "pigment-inkwash-density", physics: ["physics-porous-paper", "physics-inkwash"],
      pattern: "pattern-none", finish: ["finish-edge-bloom", "finish-wet-sheen"], output: "output-contact-canvas-svg",
    }, tuning: { size: 22, opacity: 0.88, flow: 0.68, spacing: 0.05, wetness: 0.7,
      absorbency: 0.82, diffusion: 0.56, reservoir: 0.66, edgeDarkening: 0.72 } },
  ),
  defineBrushStudioV6RecipeSeed(
    "glass-neon-ribbon", "유리 네온 리본", "FX·리본",
    "Spring 보정과 WebGPU 틸트 리본, 무지개 흐름·네온 블룸을 결합한 투명 발광 스트로크",
    { slots: {
      motion: "motion-spring", carrier: "carrier-webgpu-ribbon", tip: "tip-chisel-sdf",
      surface: "surface-smooth", deposition: "deposit-light", pickup: "pickup-none",
      pigment: "pigment-rgb", physics: [], pattern: "pattern-rainbow", finish: ["finish-neon"],
      output: "output-contact-canvas-svg",
    }, tuning: { size: 18, opacity: 0.9, flow: 0.82, spacing: 0.035, stabilization: 0.16,
      patternScale: 0.78, patternDensity: 0.86, primaryColor: "#22d3ee", secondaryColor: "#f472b6" } },
  ),
]);
