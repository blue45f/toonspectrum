import { defineBrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";
import type { BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

/** V7 material pack: surface microstructure changes the actual contact geometry, not just preview decoration. */
export const BRUSH_STUDIO_V7_MATERIAL_RECIPE_SEEDS: readonly BrushStudioV6RecipeSeed[] = Object.freeze([
  defineBrushStudioV6RecipeSeed("v7-hotpress-precision-graphite", "핫프레스 정밀 흑연", "종이·건식", "매끈한 압착 수채지에서 미세 흑연 입자가 끊김 없이 이어지는 정밀 연필", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-grain-exemplar", surface: "surface-v7-hotpress", deposition: "deposit-dry", pigment: "pigment-spectral", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 7, opacity: 0.78, flow: 0.42, spacing: 0.11, surfaceTooth: 0.48, friction: 0.5, granulation: 0.42 },
  }),
  defineBrushStudioV6RecipeSeed("v7-hotpress-ink-glaze", "핫프레스 잉크 글레이즈", "종이·잉크", "미세 압착 섬유를 드러내는 얇고 반투명한 일러스트 잉크", {
    slots: { carrier: "carrier-libmypaint-dabs", surface: "surface-v7-hotpress", deposition: "deposit-ink", pigment: "pigment-spectral" },
    tuning: { size: 13, opacity: 0.78, flow: 0.54, spacing: 0.05, surfaceTooth: 0.3 },
  }),
  defineBrushStudioV6RecipeSeed("v7-rough-mineral-watercolor", "러프 미네랄 플랫 수채", "수채·과립", "넓은 평붓 가장자리와 큰 종이 골, 광물 입자가 동시에 드러나는 거친 과립 수채", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-hokusai-dabs", tip: "tip-chisel-sdf", surface: "surface-v7-rough-watercolor", deposition: "deposit-wet", pigment: "pigment-open-km", physics: ["physics-porous-paper", "physics-inkwash"], finish: ["finish-edge-bloom", "finish-wet-sheen"] },
    tuning: { size: 46, opacity: 0.66, flow: 0.52, wetness: 0.9, absorbency: 0.86, diffusion: 0.76, granulation: 0.92, edgeDarkening: 0.7 },
  }),
  defineBrushStudioV6RecipeSeed("v7-rough-dry-gouache", "러프 드라이 과슈", "종이·과슈", "거친 수채지의 산마루만 긁어 지나가는 불투명 드라이 과슈", {
    slots: { carrier: "carrier-libmypaint-dabs", tip: "tip-grain-exemplar", surface: "surface-v7-rough-watercolor", deposition: "deposit-dry", pigment: "pigment-open-km", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 31, opacity: 0.96, flow: 0.86, surfaceTooth: 0.78, friction: 0.72, granulation: 0.78 },
  }),
  defineBrushStudioV6RecipeSeed("v7-laid-conte-hatch", "레이드 콩테 해치", "판화·해칭", "제지망의 laid line을 타며 끊기고 다시 붙는 콩테 해칭", {
    slots: { carrier: "carrier-webgpu-centerline", tip: "tip-grain-exemplar", surface: "surface-v7-laid-paper", deposition: "deposit-dry", pigment: "pigment-spectral", physics: ["physics-dry-contact"], pattern: "pattern-cross-hatch", finish: ["finish-grain"] },
    tuning: { size: 10, flow: 0.72, spacing: 0.05, surfaceTooth: 0.84, granulation: 0.7, patternDensity: 0.48, patternScale: 0.78, patternJitter: 0.08 },
  }),
  defineBrushStudioV6RecipeSeed("v7-laid-letterpress-ink", "레이드 레터프레스 잉크", "종이·잉크", "체인 라인과 제지망 결이 비치는 빈티지 인쇄 잉크", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-chisel-sdf", surface: "surface-v7-laid-paper", deposition: "deposit-marker", pigment: "pigment-spectral", physics: ["physics-porous-paper"], finish: ["finish-edge-bloom"] },
    tuning: { size: 19, opacity: 0.9, flow: 0.72, absorbency: 0.54, edgeDarkening: 0.28, surfaceTooth: 0.58 },
  }),
  defineBrushStudioV6RecipeSeed("v7-washi-sumi-fiber", "코조 화지 섬유 수묵", "수묵·섬유", "닥 섬유를 따라 먹이 길게 번지고 가장자리에 농담이 남는 수묵", {
    slots: { carrier: "carrier-hokusai-dabs", tip: "tip-chisel-sdf", surface: "surface-v7-washi-kozo", deposition: "deposit-wet", pigment: "pigment-inkwash-density", physics: ["physics-porous-paper", "physics-inkwash"], finish: ["finish-edge-bloom", "finish-wet-sheen"] },
    tuning: { size: 28, flow: 0.66, wetness: 0.8, absorbency: 0.92, diffusion: 0.64, granulation: 0.5, edgeDarkening: 0.76 },
  }),
  defineBrushStudioV6RecipeSeed("v7-washi-dry-calligraphy", "코조 화지 갈필", "서예·갈필", "긴 닥 섬유 때문에 먹선이 갈라지고 마르는 갈필 캘리그래피", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-libmypaint-dabs", tip: "tip-chisel-sdf", surface: "surface-v7-washi-kozo", deposition: "deposit-dry", pigment: "pigment-spectral", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 25, flow: 0.72, surfaceTooth: 0.76, friction: 0.78, granulation: 0.72 },
  }),
  defineBrushStudioV6RecipeSeed("v7-sanded-charcoal-velour", "샌디드 벨루어 목탄", "목탄·파스텔", "연마 그릿에 목탄 가루가 두껍게 걸리는 벨벳 질감", {
    slots: { carrier: "carrier-libmypaint-dabs", tip: "tip-grain-exemplar", surface: "surface-v7-sanded-pastel", deposition: "deposit-dry", pickup: "pickup-pigment-reservoir", pigment: "pigment-spectral", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 35, opacity: 0.88, flow: 0.72, surfaceTooth: 0.98, friction: 0.7, pickup: 0.16, granulation: 0.94 },
  }),
  defineBrushStudioV6RecipeSeed("v7-sanded-soft-pastel", "샌디드 소프트 파스텔", "목탄·파스텔", "큰 그릿과 미세 사포 결 사이를 부드러운 파스텔이 불균일하게 메움", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-grain-exemplar", surface: "surface-v7-sanded-pastel", deposition: "deposit-dry", pigment: "pigment-open-km", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 23, opacity: 0.9, flow: 0.76, surfaceTooth: 0.84, friction: 0.58, granulation: 0.84 },
  }),
  defineBrushStudioV6RecipeSeed("v7-vellum-color-pencil", "벨럼 색연필", "연필·세필", "벨럼의 막질 미세결을 따라 납 성분이 얇고 방향성 있게 쌓이는 색연필", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-grain-exemplar", surface: "surface-v7-vellum", deposition: "deposit-dry", pigment: "pigment-spectral", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 6, opacity: 0.72, flow: 0.44, spacing: 0.12, surfaceTooth: 0.68, friction: 0.52, granulation: 0.52 },
  }),
  defineBrushStudioV6RecipeSeed("v7-vellum-fine-ink", "벨럼 파인 잉크", "종이·잉크", "매끈하지만 완전히 균일하지 않은 벨럼용 세필 잉크", {
    slots: { motion: "motion-adaptive-ema", carrier: "carrier-perfect-outline", tip: "tip-chisel-sdf", surface: "surface-v7-vellum", deposition: "deposit-ink", pigment: "pigment-spectral" },
    tuning: { size: 4, opacity: 0.98, flow: 0.9, spacing: 0.03, stabilization: 0.28, surfaceTooth: 0.26 },
  }),
  defineBrushStudioV6RecipeSeed("v7-gesso-scrape-oil", "젯소 스크레이프 오일", "유화·임파스토", "젯소 붓자국을 가로질러 물감이 산마루에 걸리고 골에서 긁히는 유화 스크레이프", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-webgpu-ribbon", tip: "tip-chisel-sdf", surface: "surface-v7-gesso-brush", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir", pigment: "pigment-open-km", physics: ["physics-height"], finish: ["finish-relief"] },
    tuning: { size: 62, flow: 0.82, surfaceTooth: 0.72, pickup: 0.34, reservoir: 0.72, viscosity: 0.88, plasticity: 0.78, relief: 0.76, gloss: 0.46 },
  }),
  defineBrushStudioV6RecipeSeed("v7-gesso-dry-brush", "젯소 릿지 드라이브러시", "유화·건식", "젯소의 긴 붓 릿지만 선택적으로 훑는 마른 페인트 브러시", {
    slots: { carrier: "carrier-libmypaint-dabs", tip: "tip-grain-exemplar", surface: "surface-v7-gesso-brush", deposition: "deposit-dry", pigment: "pigment-open-km", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 43, opacity: 0.94, flow: 0.78, surfaceTooth: 0.8, friction: 0.72, granulation: 0.76 },
  }),
  defineBrushStudioV6RecipeSeed("v7-heavy-canvas-impasto", "헤비 캔버스 임파스토", "유화·임파스토", "굵은 날실·씨실 사이를 높은 물감 능선이 채우는 두꺼운 임파스토", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-chisel-sdf", surface: "surface-v7-canvas-heavy", deposition: "deposit-oil", pickup: "pickup-pigment-reservoir", pigment: "pigment-open-km", physics: ["physics-height"], finish: ["finish-relief"] },
    tuning: { size: 74, opacity: 0.98, flow: 0.9, surfaceTooth: 0.8, pickup: 0.4, reservoir: 0.86, viscosity: 0.94, plasticity: 0.9, relief: 0.96, gloss: 0.62 },
  }),
  defineBrushStudioV6RecipeSeed("v7-heavy-canvas-scumble", "헤비 캔버스 스컴블", "유화·건식", "캔버스 융기만 가볍게 건드리는 반투명 스컴블링", {
    slots: { carrier: "carrier-libmypaint-dabs", tip: "tip-grain-exemplar", surface: "surface-v7-canvas-heavy", deposition: "deposit-dry", pigment: "pigment-spectral", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 48, opacity: 0.76, flow: 0.66, surfaceTooth: 0.78, friction: 0.62, granulation: 0.76 },
  }),
  defineBrushStudioV6RecipeSeed("v7-newsprint-bleed-marker", "뉴스프린트 블리드 마커", "마커·흡수", "값싼 펄프지에서 잉크가 빠르게 먹고 외곽이 퍼지는 블리드 마커", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-chisel-sdf", surface: "surface-v7-newsprint", deposition: "deposit-marker", pigment: "pigment-spectral", physics: ["physics-porous-paper"], finish: ["finish-edge-bloom"] },
    tuning: { size: 29, opacity: 0.82, flow: 0.74, absorbency: 0.96, wetness: 0.48, diffusion: 0.54, edgeDarkening: 0.5, surfaceTooth: 0.46 },
  }),
  defineBrushStudioV6RecipeSeed("v7-newsprint-comic-ink", "뉴스프린트 코믹 잉크", "만화·잉크", "펄프 섬유 때문에 가장자리가 미세하게 깨지는 빈티지 코믹 선화", {
    slots: { carrier: "carrier-perfect-outline", tip: "tip-round-sdf", surface: "surface-v7-newsprint", deposition: "deposit-marker", pigment: "pigment-spectral", physics: ["physics-porous-paper"], finish: ["finish-edge-bloom"] },
    tuning: { size: 8, opacity: 0.94, flow: 0.84, spacing: 0.035, stabilization: 0.18, surfaceTooth: 0.58, absorbency: 0.92, edgeDarkening: 0.5 },
  }),
  defineBrushStudioV6RecipeSeed("v7-kraft-graphite", "크라프트 섬유 흑연", "연필·세필", "길게 눕는 크라프트 섬유에 흑연이 방향성 있게 걸리는 스케치 연필", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-grain-exemplar", surface: "surface-v7-kraft-fiber", deposition: "deposit-dry", pigment: "pigment-spectral", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 9, opacity: 0.8, flow: 0.6, surfaceTooth: 0.78, friction: 0.62, granulation: 0.64 },
  }),
  defineBrushStudioV6RecipeSeed("v7-kraft-brush-ink", "크라프트 브러시 잉크", "종이·잉크", "크라프트의 긴 결을 따라 농도가 흔들리는 포스터용 브러시 잉크", {
    slots: { motion: "motion-brush-inertia", carrier: "carrier-libmypaint-dabs", tip: "tip-chisel-sdf", surface: "surface-v7-kraft-fiber", deposition: "deposit-marker", pigment: "pigment-spectral", physics: ["physics-porous-paper"] },
    tuning: { size: 26, opacity: 0.9, flow: 0.72, surfaceTooth: 0.66, absorbency: 0.68, edgeDarkening: 0.22 },
  }),
  defineBrushStudioV6RecipeSeed("v7-woodgrain-drybrush", "우드그레인 드라이브러시", "자연·텍스처", "목리를 따라 색이 길게 끊기며 실제 나뭇결처럼 흐르는 드라이브러시", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-grain-exemplar", surface: "surface-v7-woodgrain", deposition: "deposit-dry", pigment: "pigment-open-km", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 37, opacity: 0.9, flow: 0.76, surfaceTooth: 0.72, friction: 0.74, granulation: 0.66 },
  }),
  defineBrushStudioV6RecipeSeed("v7-woodgrain-stain", "우드그레인 스테인", "자연·습식", "목리 골을 따라 반투명 안료가 번지는 스테인·워시", {
    slots: { carrier: "carrier-hokusai-dabs", surface: "surface-v7-woodgrain", deposition: "deposit-wet", pigment: "pigment-open-km", physics: ["physics-porous-paper", "physics-inkwash"], finish: ["finish-edge-bloom"] },
    tuning: { size: 42, opacity: 0.56, flow: 0.42, wetness: 0.74, absorbency: 0.34, diffusion: 0.58, granulation: 0.36, edgeDarkening: 0.32 },
  }),
  defineBrushStudioV6RecipeSeed("v7-stone-grit-pastel", "스톤 그릿 파스텔", "목탄·파스텔", "석분 결정의 높낮이에 따라 불규칙하게 걸리는 하드 파스텔", {
    slots: { carrier: "carrier-webgpu-ribbon", tip: "tip-grain-exemplar", surface: "surface-v7-stone-grit", deposition: "deposit-dry", pigment: "pigment-spectral", physics: ["physics-dry-contact"], finish: ["finish-grain"] },
    tuning: { size: 17, opacity: 0.9, flow: 0.72, surfaceTooth: 0.84, friction: 0.72, granulation: 0.88 },
  }),
  defineBrushStudioV6RecipeSeed("v7-stone-grit-speckle", "스톤 그릿 스페클", "FX·입자", "석분의 고주파 결정 위에 광물 안료 입자가 튀는 스페클 텍스처", {
    slots: { carrier: "carrier-webgpu-particles", tip: "tip-grain-exemplar", surface: "surface-v7-stone-grit", deposition: "deposit-particles", pigment: "pigment-open-km", physics: ["physics-particles"] },
    tuning: { size: 21, opacity: 0.8, flow: 0.52, particleCount: 1760, patternJitter: 0.76, surfaceTooth: 0.84, granulation: 0.9 },
  }),
]);