import { normalizeProgram } from "./program-schema";

import type { BrushFamily, BrushProgram, BrushProgramInput } from "./program-schema";

/**
 * 프리셋 카탈로그 30종(스펙 §15 표). 모두 절차적이며 외부 에셋·경쟁 제품 브러시 파일을
 * 참조하지 않는다. 모든 팁 생성기(8종)·도포 모델(9종)이 최소 1회 쓰이고, 매체 가족 20종이
 * 각각 1개 이상 존재한다. 수치는 자체 정의 추정값이다(베타).
 */

const PRESSURE_SIZE = (lo: number): BrushProgramInput["strokeDynamics"] => ({
  size: [{ input: "pressure", curve: [lo, 1], min: 0, max: 1 }],
});

const PRESSURE_SIZE_FLOW = (
  sizeLo: number,
  flowLo: number,
): BrushProgramInput["strokeDynamics"] => ({
  size: [{ input: "pressure", curve: [sizeLo, 1], min: 0, max: 1 }],
  flow: [{ input: "pressure", curve: [flowLo, 1], min: 0, max: 1 }],
});

/** 토이 종이: 가족 공통 그레인 설정. */
const GRAIN_PAPER = (roughness: number, pressureInfluence: number): BrushProgramInput["paper"] => ({
  enabled: true,
  scale: 1,
  roughness,
  absorbency: 0.5,
  pressureInfluence,
  filter: "bilinear",
  seed: 7,
});

const NO_PAPER: BrushProgramInput["paper"] = { enabled: false };

const PRESET_INPUTS: readonly BrushProgramInput[] = [
  // ---- 연필 ----
  {
    id: "pencil-hb",
    name: "연필 HB",
    family: "pencil",
    description: "노이즈 팁 + 흑연 침착(contactGain 1.0). 종이 그레인이 압력에 따라 메워진다.",
    tip: { kind: "noise", sizePx: 6, hardness: 0.7, params: { hardness: 0.7, aspect: 1, density: 0.65, frequency: 10 } },
    paper: GRAIN_PAPER(0.6, 0.5),
    deposition: { model: "dry-stamp", flow: 0.55, opacity: 1, spacing: 0.12, blend: "normal" },
    edge: { taperStartPx: 2, taperEndPx: 4 },
    strokeDynamics: PRESSURE_SIZE_FLOW(0.6, 0.35),
    physics: { contact: "graphite", baseRadius: 1, graphite: { contactGain: 1.0, bumpThreshold: 0.3 } },
  },
  {
    id: "pencil-6b",
    name: "연필 6B",
    family: "pencil",
    description: "큰 반경 노이즈 팁, 흑연 contactGain 1.6, 높은 flow로 진하게 깔린다.",
    tip: { kind: "noise", sizePx: 10, hardness: 0.5, seed: 3, params: { hardness: 0.5, aspect: 1, density: 0.8, frequency: 7 } },
    paper: GRAIN_PAPER(0.7, 0.6),
    deposition: { model: "dry-stamp", flow: 0.85, opacity: 1, spacing: 0.1, blend: "normal" },
    edge: { taperStartPx: 3, taperEndPx: 6 },
    strokeDynamics: PRESSURE_SIZE_FLOW(0.5, 0.5),
    physics: { contact: "graphite", baseRadius: 1, graphite: { contactGain: 1.6, bumpThreshold: 0.25 } },
  },
  {
    id: "pencil-mechanical",
    name: "샤프펜슬",
    family: "pencil",
    description: "0.6 px 고정폭 round 팁(접촉 모델 none), 흑연 그레인만 압력에 반응, hardness 0.9.",
    tip: { kind: "round", sizePx: 1.2, hardness: 0.9 },
    paper: GRAIN_PAPER(0.5, 0.4),
    deposition: { model: "dry-stamp", flow: 0.9, opacity: 1, spacing: 0.3, blend: "normal" },
    strokeDynamics: { flow: [{ input: "pressure", curve: [0.4, 1], min: 0, max: 1 }] },
    physics: { contact: "none", baseRadius: 1, graphite: { contactGain: 1.4, bumpThreshold: 0.2 } },
  },
  // ---- 볼펜 ----
  {
    id: "ballpoint",
    name: "볼펜",
    family: "ballpoint",
    description: "round 팁, Hertz 접촉(n=4), 속도 의존 농담과 미세 끊김.",
    tip: { kind: "round", sizePx: 2.4, hardness: 0.95 },
    paper: GRAIN_PAPER(0.3, 0.8),
    deposition: { model: "dry-stamp", flow: 0.9, opacity: 1, spacing: 0.12, timeDabsPerSecond: 30, blend: "normal" },
    edge: { dryBreakup: 0.15, taperEndPx: 3 },
    strokeDynamics: PRESSURE_SIZE_FLOW(0.7, 0.5),
    physics: {
      contact: "hertz",
      exponent: 4,
      baseRadius: 1,
      velocity: { vMax: 8, vBreak: 3, vSlow: 0.3, gamma: 0.5, waterBase: 0, slowGain: 0 },
    },
  },
  // ---- 잉크 ----
  {
    id: "ink-g-pen",
    name: "G펜",
    family: "ink",
    description: "닙 2차계(ωn 180 rad/s, threshold 0.05, gapMax 6), hardness 1 해석적 AA, 긴 끝 테이퍼.",
    tip: { kind: "round", sizePx: 8, hardness: 1 },
    paper: NO_PAPER,
    deposition: { model: "dry-stamp", flow: 1, opacity: 1, spacing: 0.08, timeDabsPerSecond: 30, blend: "normal" },
    edge: { taperStartPx: 4, taperEndPx: 24 },
    physics: {
      contact: "nib",
      baseRadius: 1,
      nib: { stiffness: 180, damping: 0.65, threshold: 0.05, gapMax: 6, widthGain: 1, baseWidth: 0.6, aspect: 1 },
    },
  },
  {
    id: "ink-maru-pen",
    name: "마루펜",
    family: "ink",
    description: "닙 ωn 320 rad/s, gapMax 2의 균일 세선.",
    tip: { kind: "round", sizePx: 3, hardness: 1 },
    paper: NO_PAPER,
    deposition: { model: "dry-stamp", flow: 1, opacity: 1, spacing: 0.1, timeDabsPerSecond: 30, blend: "normal" },
    edge: { taperStartPx: 2, taperEndPx: 8 },
    physics: {
      contact: "nib",
      baseRadius: 1,
      nib: { stiffness: 320, damping: 0.9, threshold: 0.03, gapMax: 2, widthGain: 1, baseWidth: 0.4, aspect: 1 },
    },
  },
  {
    id: "ink-brush-pen",
    name: "붓펜",
    family: "ink",
    description: "붓모 팁 + 붓모 접촉(spreadGain 2.2): 압력에 따라 폭이 급변하고 끝이 가늘어진다.",
    tip: { kind: "bristle-strands", sizePx: 14, hardness: 0.85, params: { hardness: 0.85, aspect: 1, strands: 18 } },
    paper: NO_PAPER,
    deposition: { model: "bristle", flow: 0.95, opacity: 1, spacing: 0.08, timeDabsPerSecond: 30, blend: "normal" },
    edge: { taperStartPx: 6, taperEndPx: 30 },
    strokeDynamics: PRESSURE_SIZE(0.15),
    physics: { contact: "bristle", baseRadius: 1, bristle: { spreadGain: 2.2, tiltGain: 0.6, followTauMs: 30, strands: 18 } },
  },
  // ---- 마커 ----
  {
    id: "marker-alcohol",
    name: "알코올 마커",
    family: "marker",
    description: "납작 팁(aspect 0.4) 펠트 접촉, multiply 합성으로 중첩 농담.",
    tip: { kind: "flat", sizePx: 18, hardness: 0.85, aspect: 0.4, angleRad: 0.5, params: { hardness: 0.85, aspect: 0.4 } },
    paper: NO_PAPER,
    deposition: { model: "dry-stamp", flow: 0.5, opacity: 0.6, spacing: 0.1, blend: "multiply" },
    physics: { contact: "felt", baseRadius: 1 },
  },
  // ---- 분필·파스텔 ----
  {
    id: "chalk-pastel",
    name: "분필 파스텔",
    family: "chalk",
    description: "질감 스탬프 팁, hardness 0.3, 강한 종이 그레인.",
    tip: { kind: "texture-stamp", sizePx: 16, hardness: 0.3, seed: 11, params: { hardness: 0.3, aspect: 1, density: 0.8, frequency: 6 } },
    paper: GRAIN_PAPER(0.9, 0.3),
    deposition: { model: "dry-stamp", flow: 0.7, opacity: 1, spacing: 0.15, blend: "normal" },
    strokeDynamics: PRESSURE_SIZE_FLOW(0.7, 0.4),
    physics: { contact: "felt", baseRadius: 1 },
  },
  // ---- 목탄 ----
  {
    id: "charcoal",
    name: "목탄",
    family: "charcoal",
    description: "노이즈 팁, 흑연 contactGain 2.0으로 요철이 빨리 메워지는 짙은 침착.",
    tip: { kind: "noise", sizePx: 14, hardness: 0.4, seed: 5, params: { hardness: 0.4, aspect: 1, density: 0.9, frequency: 5 } },
    paper: GRAIN_PAPER(0.8, 0.7),
    deposition: { model: "dry-stamp", flow: 0.9, opacity: 1, spacing: 0.1, blend: "normal" },
    strokeDynamics: PRESSURE_SIZE_FLOW(0.5, 0.6),
    physics: { contact: "graphite", baseRadius: 1, graphite: { contactGain: 2.0, bumpThreshold: 0.25 } },
  },
  // ---- 콩테 ----
  {
    id: "conte",
    name: "콩테",
    family: "conte",
    description: "각도 고정 납작 팁, 흑연 침착, 색 고정.",
    tip: { kind: "flat", sizePx: 10, hardness: 0.6, aspect: 0.5, angleRad: 0.785, params: { hardness: 0.6, aspect: 0.5 } },
    paper: GRAIN_PAPER(0.7, 0.5),
    deposition: { model: "dry-stamp", flow: 0.8, opacity: 1, spacing: 0.12, blend: "normal" },
    strokeDynamics: PRESSURE_SIZE_FLOW(0.6, 0.5),
    physics: { contact: "graphite", baseRadius: 1, graphite: { contactGain: 1.2, bumpThreshold: 0.3 } },
  },
  // ---- 크레용 ----
  {
    id: "crayon",
    name: "크레용",
    family: "crayon",
    description: "왁스 그레인 질감 스탬프, 압력 포화 곡선.",
    tip: { kind: "texture-stamp", sizePx: 12, hardness: 0.5, seed: 23, params: { hardness: 0.5, aspect: 1, density: 0.9, frequency: 9 } },
    paper: GRAIN_PAPER(0.7, 0.9),
    deposition: { model: "dry-stamp", flow: 0.8, opacity: 1, spacing: 0.12, blend: "normal" },
    strokeDynamics: {
      size: [{ input: "pressure", curve: [0.6, 0.9, 1, 1, 1], min: 0, max: 1 }],
      flow: [{ input: "pressure", curve: [0.5, 0.95, 1, 1, 1], min: 0, max: 1 }],
    },
    physics: { contact: "felt", baseRadius: 1 },
  },
  // ---- 수채 ----
  {
    id: "watercolor-wet",
    name: "수채(젖은 붓)",
    family: "watercolor",
    description: "부드러운 round 팁, wet-flow, 에지 다크닝 1.0·그래뉼레이션 0.5, KM 혼색.",
    tip: { kind: "round", sizePx: 20, hardness: 0.15 },
    paper: GRAIN_PAPER(0.6, 0.3),
    deposition: { model: "wet-flow", flow: 0.5, opacity: 0.9, spacing: 0.2, timeDabsPerSecond: 15, blend: "normal" },
    edge: { wetEdge: 0.8 },
    colorDynamics: { kmMixing: true },
    strokeDynamics: PRESSURE_SIZE(0.5),
    physics: {
      contact: "felt",
      baseRadius: 1,
      velocity: { vMax: 6, vBreak: 2.5, vSlow: 0.5, gamma: 0.6, waterBase: 0.6, slowGain: 0.4 },
    },
    wet: { diffusion: 0.35, evaporation: 0.003, capillary: 0.3, edgeDarkening: 1.0, granulation: 0.5, dryingMs: 3000 },
  },
  {
    id: "watercolor-dry",
    name: "수채(마른 붓)",
    family: "watercolor",
    description: "붓모 팁, 물이 적은 wet-flow, dryBreakup 0.6의 갈필.",
    tip: { kind: "bristle-strands", sizePx: 16, hardness: 0.6, seed: 9, params: { hardness: 0.6, aspect: 1, strands: 20 } },
    paper: GRAIN_PAPER(0.7, 0.4),
    deposition: { model: "wet-flow", flow: 0.6, opacity: 0.95, spacing: 0.12, blend: "normal" },
    edge: { dryBreakup: 0.6, taperEndPx: 10 },
    strokeDynamics: PRESSURE_SIZE(0.4),
    physics: {
      contact: "bristle",
      baseRadius: 1,
      bristle: { spreadGain: 1.2, tiltGain: 0.5, followTauMs: 30, strands: 20 },
      velocity: { vMax: 5, vBreak: 1.2, vSlow: 0.3, gamma: 0.6, waterBase: 0.15, slowGain: 0.1 },
    },
    wet: { diffusion: 0.1, evaporation: 0.006, capillary: 0.5, edgeDarkening: 0.4, granulation: 0.3, dryingMs: 1500 },
  },
  // ---- 구아슈 ----
  {
    id: "gouache",
    name: "구아슈",
    family: "gouache",
    description: "납작 팁, 불투명 wet-flow(diffusion 0.05), opacity 0.95.",
    tip: { kind: "flat", sizePx: 16, hardness: 0.6, aspect: 0.6, params: { hardness: 0.6, aspect: 0.6 } },
    paper: GRAIN_PAPER(0.4, 0.5),
    deposition: { model: "wet-flow", flow: 0.8, opacity: 0.95, spacing: 0.12, blend: "normal" },
    strokeDynamics: { rotationFollow: "direction" },
    physics: {
      contact: "felt",
      baseRadius: 1,
      velocity: { vMax: 6, vBreak: 3, vSlow: 0.3, gamma: 0.6, waterBase: 0.3, slowGain: 0.1 },
    },
    wet: { diffusion: 0.05, evaporation: 0.005, capillary: 0.2, edgeDarkening: 0.1, granulation: 0.05, dryingMs: 2000 },
  },
  // ---- 유화 ----
  {
    id: "oil-impasto",
    name: "유화 임파스토",
    family: "oil",
    description: "붓모 팁, 높이 누적 impasto + 릴리프 조명(베타).",
    tip: { kind: "bristle-strands", sizePx: 18, hardness: 0.8, seed: 17, params: { hardness: 0.8, aspect: 1, strands: 28 } },
    paper: GRAIN_PAPER(0.5, 0.5),
    deposition: { model: "impasto", flow: 0.9, opacity: 1, spacing: 0.1, blend: "normal" },
    strokeDynamics: PRESSURE_SIZE(0.5),
    physics: { contact: "bristle", baseRadius: 1, bristle: { spreadGain: 1.4, tiltGain: 0.6, followTauMs: 30, strands: 28 } },
    wet: { diffusion: 0, evaporation: 0, capillary: 0, edgeDarkening: 0, granulation: 0, viscosity: 0.6, dryingMs: 20000, substeps: 1 },
  },
  // ---- 아크릴 ----
  {
    id: "acrylic",
    name: "아크릴",
    family: "acrylic",
    description: "납작 팁 dry-stamp, 반건식 wetEdge 0.3.",
    tip: { kind: "flat", sizePx: 14, hardness: 0.7, aspect: 0.7, params: { hardness: 0.7, aspect: 0.7 } },
    paper: GRAIN_PAPER(0.4, 0.6),
    deposition: { model: "dry-stamp", flow: 0.9, opacity: 1, spacing: 0.12, blend: "normal" },
    edge: { wetEdge: 0.3 },
    strokeDynamics: { rotationFollow: "direction", size: [{ input: "pressure", curve: [0.6, 1], min: 0, max: 1 }] },
    physics: { contact: "felt", baseRadius: 1 },
  },
  // ---- 에어브러시 ----
  {
    id: "airbrush",
    name: "에어브러시",
    family: "airbrush",
    description: "hardness 0 round 팁, 가우시안 밀도 도포, flow 0.05.",
    tip: { kind: "round", sizePx: 30, hardness: 0 },
    paper: NO_PAPER,
    deposition: { model: "airbrush", flow: 0.05, opacity: 1, spacing: 0.05, timeDabsPerSecond: 60, blend: "normal" },
    strokeDynamics: PRESSURE_SIZE_FLOW(0.5, 0.2),
    physics: { contact: "none", baseRadius: 1 },
  },
  // ---- 스프레이 ----
  {
    id: "spray-splatter",
    name: "스프레이 스플래터",
    family: "spray",
    description: "입자 팁, spray 도포, 큰 위치 산포와 개수 지터.",
    tip: { kind: "particle", sizePx: 24, hardness: 0.9, seed: 31, params: { hardness: 0.9, aspect: 1, density: 0.6 } },
    paper: NO_PAPER,
    deposition: { model: "spray", flow: 0.8, opacity: 1, spacing: 0.3, blend: "normal" },
    strokeDynamics: { scatter: { positionPx: 10, angleRad: 3.14, scale: 0.4, countJitter: 0.5 } },
    physics: { contact: "none", baseRadius: 1 },
  },
  // ---- 해칭 ----
  {
    id: "hatch-pen",
    name: "해칭 펜",
    family: "hatch",
    description: "해치 팁(frequency 6), 진행 방향 추종 회전.",
    tip: { kind: "hatch", sizePx: 16, hardness: 0.9, params: { hardness: 0.9, aspect: 1, frequency: 6, angle: 0 } },
    paper: NO_PAPER,
    deposition: { model: "dry-stamp", flow: 0.9, opacity: 1, spacing: 0.1, blend: "normal" },
    strokeDynamics: { rotationFollow: "direction", size: [{ input: "pressure", curve: [0.6, 1], min: 0, max: 1 }] },
    physics: { contact: "hertz", exponent: 3, baseRadius: 1 },
  },
  // ---- 스크린톤 ----
  {
    id: "screentone-halftone",
    name: "스크린톤(망점)",
    family: "halftone",
    description: "스티플 팁 격자 위상을 월드 좌표에 고정한 hatch-halftone 도포.",
    tip: { kind: "stipple", sizePx: 16, hardness: 1, params: { hardness: 1, aspect: 1, frequency: 4, density: 0.5 } },
    paper: NO_PAPER,
    deposition: { model: "hatch-halftone", flow: 1, opacity: 1, spacing: 0.1, blend: "normal" },
    physics: { contact: "none", baseRadius: 1 },
  },
  // ---- 텍스처 스탬프 ----
  {
    id: "texture-canvas-stamp",
    name: "캔버스 직조 스탬프",
    family: "texture",
    description: "캔버스 직조 질감 스탬프(frequency 8), dry-stamp.",
    tip: { kind: "texture-stamp", sizePx: 20, hardness: 0.6, seed: 101, params: { hardness: 0.6, aspect: 1, density: 0.6, frequency: 8 } },
    paper: NO_PAPER,
    deposition: { model: "dry-stamp", flow: 0.7, opacity: 1, spacing: 0.25, blend: "normal" },
    physics: { contact: "felt", baseRadius: 1 },
  },
  {
    id: "texture-fabric-stamp",
    name: "패브릭 결 스탬프",
    family: "texture",
    description: "패브릭 결 질감 스탬프(frequency 12, aspect 0.7), dry-stamp.",
    tip: { kind: "texture-stamp", sizePx: 20, hardness: 0.5, aspect: 0.7, seed: 202, params: { hardness: 0.5, aspect: 0.7, density: 0.5, frequency: 12 } },
    paper: NO_PAPER,
    deposition: { model: "dry-stamp", flow: 0.75, opacity: 1, spacing: 0.25, blend: "normal" },
    strokeDynamics: { rotationFollow: "direction" },
    physics: { contact: "felt", baseRadius: 1 },
  },
  {
    id: "texture-paper-stamp",
    name: "종이 섬유 스탬프",
    family: "texture",
    description: "종이 섬유 질감 스탬프(frequency 5, 6옥타브), dry-stamp.",
    tip: { kind: "texture-stamp", sizePx: 20, hardness: 0.4, seed: 303, params: { hardness: 0.4, aspect: 1, density: 0.8, frequency: 5, octaves: 6 } },
    paper: NO_PAPER,
    deposition: { model: "dry-stamp", flow: 0.65, opacity: 1, spacing: 0.25, blend: "normal" },
    physics: { contact: "felt", baseRadius: 1 },
  },
  // ---- smudge ----
  {
    id: "smudge-blend",
    name: "문지르기(블렌드)",
    family: "smudge",
    description: "부드러운 round 팁, 문서 픽업 강도 0.7의 smudge.",
    tip: { kind: "round", sizePx: 18, hardness: 0.1 },
    paper: NO_PAPER,
    deposition: { model: "smudge", flow: 0.7, opacity: 1, spacing: 0.1, blend: "normal" },
    physics: { contact: "felt", baseRadius: 1 },
  },
  // ---- 지우개 ----
  {
    id: "eraser-soft",
    name: "지우개(부드러움)",
    family: "eraser",
    description: "hardness 0.2 round 팁, 알파만 깎는 eraser.",
    tip: { kind: "round", sizePx: 16, hardness: 0.2 },
    paper: NO_PAPER,
    deposition: { model: "eraser", flow: 0.8, opacity: 1, spacing: 0.12, blend: "erase" },
    strokeDynamics: PRESSURE_SIZE(0.5),
    physics: { contact: "felt", baseRadius: 1 },
  },
  {
    id: "eraser-hard",
    name: "지우개(단단함)",
    family: "eraser",
    description: "hardness 1 round 팁, 완전 소거 eraser.",
    tip: { kind: "round", sizePx: 12, hardness: 1 },
    paper: NO_PAPER,
    deposition: { model: "eraser", flow: 1, opacity: 1, spacing: 0.1, blend: "erase" },
    physics: { contact: "none", baseRadius: 1 },
  },
  // ---- 특수 ----
  {
    id: "fx-glitter",
    name: "글리터",
    family: "special",
    description: "입자 팁, 큰 명도 지터(dab마다), 산포.",
    tip: { kind: "particle", sizePx: 20, hardness: 0.9, seed: 41, params: { hardness: 0.9, aspect: 1, density: 0.9 } },
    paper: NO_PAPER,
    deposition: { model: "dry-stamp", flow: 0.9, opacity: 1, spacing: 0.4, blend: "normal" },
    colorDynamics: { hueJitter: 0.05, satJitter: 0.3, valJitter: 0.8, perDab: true },
    strokeDynamics: { scatter: { positionPx: 6, angleRad: 3.14, scale: 0.5, countJitter: 0.3 } },
    physics: { contact: "none", baseRadius: 1 },
  },
  {
    id: "fx-fur-grass",
    name: "털·풀",
    family: "special",
    description: "긴 붓모 팁(strands 40, aspect 2), 방향 산포, 색상 지터.",
    tip: { kind: "bristle-strands", sizePx: 24, hardness: 0.7, aspect: 2, seed: 53, params: { hardness: 0.7, aspect: 2, strands: 40 } },
    paper: NO_PAPER,
    deposition: { model: "bristle", flow: 0.8, opacity: 1, spacing: 0.15, blend: "normal" },
    edge: { taperEndPx: 12 },
    colorDynamics: { hueJitter: 0.08, satJitter: 0.1, valJitter: 0.2, perDab: true },
    strokeDynamics: { rotationFollow: "direction", scatter: { positionPx: 2, angleRad: 0.6, scale: 0.3, countJitter: 0 } },
    physics: { contact: "hertz", exponent: 3, baseRadius: 1 },
  },
  {
    id: "fx-cloud-smoke",
    name: "구름·연기",
    family: "special",
    description: "fBm 5옥타브 노이즈 팁, 에어브러시 도포, flow 0.03.",
    tip: { kind: "noise", sizePx: 40, hardness: 0, seed: 61, params: { hardness: 0, aspect: 1, density: 0.5, frequency: 3, octaves: 5 } },
    paper: NO_PAPER,
    deposition: { model: "airbrush", flow: 0.03, opacity: 1, spacing: 0.1, timeDabsPerSecond: 60, blend: "normal" },
    strokeDynamics: PRESSURE_SIZE(0.6),
    physics: { contact: "none", baseRadius: 1 },
  },
];

/** 정규화된 프리셋 30종(선언 순서). */
export const PRESET_CATALOG: readonly BrushProgram[] = PRESET_INPUTS.map((input) => normalizeProgram(input));

const BY_ID: ReadonlyMap<string, BrushProgram> = new Map(PRESET_CATALOG.map((p) => [p.id, p]));

export const PRESET_IDS: readonly string[] = PRESET_CATALOG.map((p) => p.id);

export const DEFAULT_PRESET_ID = "pencil-hb";

/** id로 프리셋을 찾는다. 없으면 RangeError(무음 대체 없음). */
export function presetById(id: string): BrushProgram {
  const hit = BY_ID.get(id);
  if (!hit) throw new RangeError(`unknown brush preset: ${id}`);
  return hit;
}

/** 존재 여부. */
export function hasPreset(id: string): boolean {
  return BY_ID.has(id);
}

/** 가족별 프리셋(선언 순서). */
export function presetsByFamily(family: BrushFamily): BrushProgram[] {
  return PRESET_CATALOG.filter((p) => p.family === family);
}
