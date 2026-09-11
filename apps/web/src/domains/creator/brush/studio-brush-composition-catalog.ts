/** Brush Studio V5 composition planning, validation and runtime compilation. */

import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  studioBrushEngineProgramSetWithoutComposition,
  studioBrushEngineProgramSetWithoutOil,
  studioBrushEngineProgramSetWithoutWatercolor,
  studioOilProgramSetForBrush,
  type StudioBrushCompositionProgramSet,
  type StudioBrushCompositionSlotId,
  type StudioBrushEngineProgramSet,
} from "./studio-brush-engine-program-set";
import { compileStudioBrushCompositionRuntimeProgramSet } from "./studio-brush-composition-runtime";
import { STUDIO_BRUSH_COMPOSITION_NODES_A } from "./studio-brush-composition-nodes-a";
import { STUDIO_BRUSH_COMPOSITION_NODES_B } from "./studio-brush-composition-nodes-b";
import {
  STUDIO_BRUSH_COMPOSITION_SLOT_LABELS,
  type StudioBrushCompositionCost,
  type StudioBrushCompositionIntegration,
  type StudioBrushCompositionNode,
} from "./studio-brush-composition-types";

export {
  STUDIO_BRUSH_COMPOSITION_SLOT_LABELS,
  type StudioBrushCompositionCost,
  type StudioBrushCompositionIntegration,
  type StudioBrushCompositionNode,
  type StudioBrushCompositionRights,
} from "./studio-brush-composition-types";

export const STUDIO_BRUSH_COMPOSITION_NODES: readonly StudioBrushCompositionNode[] =
  Object.freeze([
    ...STUDIO_BRUSH_COMPOSITION_NODES_A,
    ...STUDIO_BRUSH_COMPOSITION_NODES_B,
  ]);

const NODE_BY_ID = new Map(STUDIO_BRUSH_COMPOSITION_NODES.map((entry) => [entry.id, entry]));

export function studioBrushCompositionNodeById(
  id: string | null | undefined,
): StudioBrushCompositionNode | null {
  return id ? NODE_BY_ID.get(id) ?? null : null;
}

export function listStudioBrushCompositionNodesForSlot(
  slot: StudioBrushCompositionSlotId,
): readonly StudioBrushCompositionNode[] {
  return STUDIO_BRUSH_COMPOSITION_NODES.filter((entry) => entry.slot === slot);
}

export type CompleteStudioBrushComposition = Readonly<
  Record<StudioBrushCompositionSlotId, string>
>;

function completeComposition(
  input: Record<StudioBrushCompositionSlotId, string>,
): CompleteStudioBrushComposition {
  return Object.freeze({ ...input });
}

const DEFAULT_COMPOSITION = completeComposition({
  motion: "adaptive-ema",
  carrier: "webgpu-causal-ink",
  tip: "round-sdf",
  surface: "smooth-paper",
  deposition: "ink-deposit",
  pigment: "rgb-color",
  pickup: "no-pickup",
  physics: "no-physics",
  pattern: "no-pattern",
  feedback: "visual-only",
  output: "vector-path",
});

export function createStudioBrushCompositionBaseline(
  brushId: string,
  family: string,
): CompleteStudioBrushComposition {
  if (family === "oil" || family === "brush") {
    const oil = studioOilProgramSetForBrush(brushId);
    return completeComposition({
      motion: "brush-inertia",
      carrier: "webgpu-bristle-ribbon",
      tip: "bristle-tuft",
      surface: "canvas-weave",
      deposition: oil.impastoRelief ? "height-paint" : "loaded-paint",
      pigment: "spectral-wgsl",
      pickup: oil.bristleLoadDynamics ? "simple-reservoir" : "no-pickup",
      physics: oil.bristlePhysics ? "bristle-webgpu" : "no-physics",
      pattern: "no-pattern",
      feedback: "hover-footprint",
      output: "raster-tiles",
    });
  }
  if (family === "watercolor") {
    const living = /inkwash|ink-wash|living/u.test(brushId);
    return completeComposition({
      motion: "adaptive-ema",
      carrier: "webgpu-wet-dabs",
      tip: /sumi|ink/u.test(brushId) ? "bristle-tuft" : "sponge-sdf",
      surface: /fiber/u.test(brushId) ? "paper-fiber-field" : "watercolor-paper",
      deposition: /water-brush/u.test(brushId) ? "water-only" : "wet-pigment",
      pigment: living ? "inkwash-optical-density" : "spectral-wgsl",
      pickup: /water-brush/u.test(brushId) ? "simple-reservoir" : "no-pickup",
      physics: living ? "inkwash-fluid" : "wet-diffusion-webgpu",
      pattern: "no-pattern",
      feedback: "hover-footprint",
      output: "raster-tiles",
    });
  }
  if (family === "pencil" || family === "pastel" || family === "dry-media") {
    return completeComposition({
      motion: "adaptive-ema",
      carrier: "webgpu-stamp-carrier",
      tip: "image-alpha-stamp",
      surface: "paper-height-field",
      deposition: "dry-pigment",
      pigment: "rgb-color",
      pickup: "no-pickup",
      physics: "dry-contact-webgpu",
      pattern: "no-pattern",
      feedback: "scratch-audio",
      output: "raster-tiles",
    });
  }
  if (family === "airbrush") {
    return completeComposition({
      motion: "direct-input",
      carrier: "webgpu-stamp-carrier",
      tip: "round-sdf",
      surface: "smooth-paper",
      deposition: "aerosol-particle",
      pigment: "rgb-color",
      pickup: "no-pickup",
      physics: "particle-webgpu",
      pattern: "blue-noise-scatter",
      feedback: "visual-only",
      output: "raster-tiles",
    });
  }
  if (family === "screentone" || family === "stamp") {
    return completeComposition({
      motion: "direct-input",
      carrier: "webgpu-stamp-carrier",
      tip: "image-alpha-stamp",
      surface: "smooth-paper",
      deposition: "motif-deposit",
      pigment: "rgb-color",
      pickup: "no-pickup",
      physics: "no-physics",
      pattern: "document-grid",
      feedback: "visual-only",
      output: "hybrid-proxy",
    });
  }
  if (family === "gpen" || family === "perfect") {
    return completeComposition({
      ...DEFAULT_COMPOSITION,
      carrier: "perfect-freehand-outline",
    });
  }
  if (family === "calligraphy") {
    return completeComposition({
      ...DEFAULT_COMPOSITION,
      motion: "spring-modeler",
      carrier: "perfect-freehand-outline",
      tip: "chisel-ribbon",
    });
  }
  return DEFAULT_COMPOSITION;
}

export interface StudioBrushCompositionRecipe {
  readonly id: string;
  readonly families: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly composition: CompleteStudioBrushComposition;
}

export const STUDIO_BRUSH_COMPOSITION_RECIPES: readonly StudioBrushCompositionRecipe[] =
  Object.freeze([
    Object.freeze({ id: "clean-ink", families: Object.freeze(["pen", "gpen", "perfect", "calligraphy"]), name: "클린 WebGPU 잉크", description: "낮은 지연과 편집 가능한 선화", composition: DEFAULT_COMPOSITION }),
    Object.freeze({ id: "living-chroma", families: Object.freeze(["watercolor"]), name: "리빙 크로마 잉크", description: "Inkwash 유체와 섬유·색분리", composition: completeComposition({ motion: "adaptive-ema", carrier: "webgpu-wet-dabs", tip: "bristle-tuft", surface: "paper-fiber-field", deposition: "wet-pigment", pigment: "inkwash-optical-density", pickup: "simple-reservoir", physics: "inkwash-fluid", pattern: "no-pattern", feedback: "hover-footprint", output: "raster-tiles" }) }),
    Object.freeze({ id: "mineral-wash", families: Object.freeze(["watercolor"]), name: "미네랄 수채", description: "과립 종이와 스펙트럼 안료 워시", composition: completeComposition({ motion: "adaptive-ema", carrier: "webgpu-wet-dabs", tip: "sponge-sdf", surface: "watercolor-paper", deposition: "wet-pigment", pigment: "spectral-wgsl", pickup: "no-pickup", physics: "wet-diffusion-webgpu", pattern: "no-pattern", feedback: "hover-footprint", output: "raster-tiles" }) }),
    Object.freeze({ id: "natural-graphite", families: Object.freeze(["pencil", "pastel", "dry-media"]), name: "천연 흑연", description: "종이 높이·마찰·실물형 그레인", composition: completeComposition({ motion: "adaptive-ema", carrier: "webgpu-stamp-carrier", tip: "image-alpha-stamp", surface: "paper-height-field", deposition: "dry-pigment", pigment: "rgb-color", pickup: "no-pickup", physics: "dry-contact-webgpu", pattern: "no-pattern", feedback: "scratch-audio", output: "raster-tiles" }) }),
    Object.freeze({ id: "impasto-mixer", families: Object.freeze(["oil", "brush"]), name: "강모 임파스토 믹서", description: "강모·reservoir·높이 안료 도포", composition: completeComposition({ motion: "brush-inertia", carrier: "webgpu-bristle-ribbon", tip: "bristle-tuft", surface: "canvas-weave", deposition: "height-paint", pigment: "rgb-color", pickup: "simple-reservoir", physics: "bristle-webgpu", pattern: "no-pattern", feedback: "hover-footprint", output: "raster-tiles" }) }),
    Object.freeze({ id: "dripping-neon", families: Object.freeze(["watercolor"]), name: "드리핑 네온", description: "얇은 물감막과 중력 드립", composition: completeComposition({ motion: "spring-modeler", carrier: "webgpu-wet-dabs", tip: "round-sdf", surface: "smooth-paper", deposition: "wet-pigment", pigment: "rainbow-arc-length", pickup: "no-pickup", physics: "thin-film-drip", pattern: "no-pattern", feedback: "visual-only", output: "raster-tiles" }) }),
    Object.freeze({ id: "foliage-flow", families: Object.freeze(["stamp", "screentone"]), name: "폴리지 플로우", description: "플로우필드와 잎 군집 문양", composition: completeComposition({ motion: "adaptive-ema", carrier: "p5-flow-field-generator", tip: "image-alpha-stamp", surface: "smooth-paper", deposition: "motif-deposit", pigment: "rainbow-arc-length", pickup: "no-pickup", physics: "particle-webgpu", pattern: "foliage-cluster", feedback: "visual-only", output: "settled-generator" }) }),
  ]);

export function studioBrushCompositionRecipeById(
  id: string,
): StudioBrushCompositionRecipe | null {
  return STUDIO_BRUSH_COMPOSITION_RECIPES.find((recipe) => recipe.id === id) ?? null;
}

export interface StudioBrushCompositionIssue {
  readonly id: string;
  readonly severity: "error" | "warning" | "info";
  readonly title: string;
  readonly description: string;
}

export interface StudioBrushCompositionPlan {
  readonly composition: CompleteStudioBrushComposition;
  readonly nodes: readonly StudioBrushCompositionNode[];
  readonly issues: readonly StudioBrushCompositionIssue[];
  readonly costScore: number;
  readonly complexity: "light" | "balanced" | "intensive";
  readonly integrationCounts: Readonly<Record<StudioBrushCompositionIntegration, number>>;
  readonly rights: Readonly<{
    permissive: boolean;
    copyleft: boolean;
    privateGrant: boolean;
    label: "상업 안전" | "GPL 포함" | "허가 필요" | "GPL·허가 혼합";
  }>;
  readonly canSave: boolean;
  readonly canRunConnectedPath: boolean;
}

function supportsFamily(node: StudioBrushCompositionNode, family: string): boolean {
  return node.supportedFamilies === "all" || node.supportedFamilies.includes(family);
}

function issue(
  id: string,
  severity: StudioBrushCompositionIssue["severity"],
  title: string,
  description: string,
): StudioBrushCompositionIssue {
  return Object.freeze({ id, severity, title, description });
}

function completeSelection(
  brushId: string,
  family: string,
  selection: StudioBrushCompositionProgramSet | null | undefined,
): CompleteStudioBrushComposition {
  const baseline = createStudioBrushCompositionBaseline(brushId, family);
  const merged = { ...baseline } as Record<StudioBrushCompositionSlotId, string>;
  if (selection) {
    for (const slot of STUDIO_BRUSH_COMPOSITION_SLOT_IDS) {
      const selected = selection[slot];
      if (selected) merged[slot] = selected;
    }
  }
  return completeComposition(merged);
}

export function planStudioBrushComposition(input: {
  readonly brushId: string;
  readonly family: string;
  readonly composition?: StudioBrushCompositionProgramSet | null;
}): StudioBrushCompositionPlan {
  const composition = completeSelection(input.brushId, input.family, input.composition);
  const issues: StudioBrushCompositionIssue[] = [];
  const nodes: StudioBrushCompositionNode[] = [];
  const integrationCounts: Record<StudioBrushCompositionIntegration, number> = {
    connected: 0,
    "adapter-ready": 0,
    lab: 0,
  };
  const rightsFlags = { permissive: false, copyleft: false, privateGrant: false };
  const costWeight: Record<StudioBrushCompositionCost, number> = {
    light: 1,
    balanced: 2,
    intensive: 4,
  };
  let costScore = 0;

  for (const slot of STUDIO_BRUSH_COMPOSITION_SLOT_IDS) {
    const selectedId = composition[slot];
    const selected = studioBrushCompositionNodeById(selectedId);
    if (!selected) {
      issues.push(issue(`unknown-${slot}`, "error", `${STUDIO_BRUSH_COMPOSITION_SLOT_LABELS[slot]} 노드 없음`, `등록되지 않은 프로그램 ${selectedId}`));
      continue;
    }
    if (selected.slot !== slot) {
      issues.push(issue(`slot-${slot}`, "error", "노드 슬롯 불일치", `${selected.label}은 ${selected.slot} 슬롯용입니다.`));
      continue;
    }
    nodes.push(selected);
    integrationCounts[selected.integration] += 1;
    costScore += costWeight[selected.cost];
    rightsFlags.permissive ||= selected.rights === "permissive";
    rightsFlags.copyleft ||= selected.rights === "copyleft";
    rightsFlags.privateGrant ||= selected.rights === "private-grant";
    if (!supportsFamily(selected, input.family)) {
      issues.push(issue(`family-${slot}`, "warning", "현재 캐리어와 실험적 조합", `${selected.label}은 ${input.family} 계열의 기본 검증 범위 밖입니다.`));
    }
    if (selected.integration === "lab") {
      issues.push(issue(`lab-${slot}`, "info", `${selected.label}은 Lab 노드`, "그래프와 권리는 저장되지만 제품 픽셀 경로 승격 전에는 비교·연구 용도입니다."));
    }
  }

  const c = composition;
  if (c.pigment === "inkwash-optical-density" && c.physics !== "inkwash-fluid") {
    issues.push(issue("inkwash-authority", "error", "Inkwash 색상에는 Inkwash 유체가 필요", "광학 밀도 모델과 이동·고정 안료 필드는 같은 authority여야 합니다."));
  }
  if (c.physics === "inkwash-fluid" && !["wet-pigment", "water-only"].includes(c.deposition)) {
    issues.push(issue("inkwash-deposition", "error", "Inkwash 유체와 도포가 맞지 않음", "습식 안료 또는 순수 물 도포를 선택하세요."));
  }
  if (c.physics === "dry-contact-webgpu" && c.deposition !== "dry-pigment") {
    issues.push(issue("dry-deposition", "error", "건식 접촉에는 건식 안료가 필요", "흑연·목탄·초크·파스텔 도포를 선택하세요."));
  }
  if (c.physics === "bristle-webgpu" && !["webgpu-bristle-ribbon", "krita-hairy-carrier", "libmypaint-natural-media", "hokusai-myb-worker"].includes(c.carrier)) {
    issues.push(issue("bristle-carrier", "error", "강모 물리에 강모 캐리어가 없음", "강모 리본·Krita Hairy·자연매체 캐리어 중 하나를 선택하세요."));
  }
  if (c.physics === "thin-film-drip" && !["wet-pigment", "loaded-paint", "height-paint"].includes(c.deposition)) {
    issues.push(issue("thin-film-deposition", "error", "드립할 재료가 없음", "습식 안료·적재 물감·높이 물감을 선택하세요."));
  }
  if (["inkwash-fluid", "thin-film-drip", "reaction-diffusion", "bristle-webgpu"].includes(c.physics) && c.output === "vector-path") {
    issues.push(issue("physics-vector-output", "error", "물리 필드는 벡터 경로로만 저장할 수 없음", "래스터 타일 또는 하이브리드 프록시를 선택하세요."));
  }
  if (c.carrier === "google-ink-mesh" && !["vector-mesh", "hybrid-proxy"].includes(c.output)) {
    issues.push(issue("mesh-output", "warning", "메시 캐리어가 래스터로 즉시 베이크됨", "편집 가능한 메시를 유지하려면 벡터 메시 또는 하이브리드 출력을 선택하세요."));
  }
  if (c.carrier === "p5-flow-field-generator" && c.output !== "settled-generator") {
    issues.push(issue("p5-output", "warning", "p5.brush는 정착형 출력 권장", "라이브 hot path 대신 정착형 생성기로 격리하는 편이 안정적입니다."));
  }
  if (c.pigment === "mixbox-lut" && !["flat-marker-deposit", "wet-pigment", "loaded-paint", "height-paint"].includes(c.deposition)) {
    issues.push(issue("mixbox-deposition", "warning", "Mixbox 효과가 드러나기 어려운 도포", "겹침·pickup이 있는 회화 재료에서만 별도 안료 경로가 의미 있습니다."));
  }
  if (c.pickup !== "no-pickup" && c.pigment === "rgb-color") {
    issues.push(issue("rgb-pickup", "info", "픽업은 되지만 안료 혼색은 RGB", "회화형 혼색이 필요하면 Spectral·K/S·LUT를 선택하세요."));
  }

  const rightsLabel = rightsFlags.copyleft && rightsFlags.privateGrant
    ? "GPL·허가 혼합"
    : rightsFlags.copyleft
      ? "GPL 포함"
      : rightsFlags.privateGrant
        ? "허가 필요"
        : "상업 안전";
  const complexity = costScore <= 14 ? "light" : costScore <= 25 ? "balanced" : "intensive";
  const hasError = issues.some((entry) => entry.severity === "error");
  return Object.freeze({
    composition,
    nodes: Object.freeze(nodes),
    issues: Object.freeze(issues),
    costScore,
    complexity,
    integrationCounts: Object.freeze({ ...integrationCounts }),
    rights: Object.freeze({ ...rightsFlags, label: rightsLabel }),
    canSave: !hasError,
    canRunConnectedPath: !hasError
      && integrationCounts["adapter-ready"] === 0
      && integrationCounts.lab === 0,
  });
}

/** Persist the graph and compile only choices backed by current product renderers. */
export function compileStudioBrushCompositionProgramSet(input: {
  readonly brushId: string;
  readonly family: string;
  readonly current?: StudioBrushEngineProgramSet | null;
  readonly composition: StudioBrushCompositionProgramSet;
}): StudioBrushEngineProgramSet {
  const complete = completeSelection(input.brushId, input.family, input.composition);
  return compileStudioBrushCompositionRuntimeProgramSet({ ...input, composition: complete });
}

export function resetStudioBrushCompositionProgramSet(input: {
  readonly family: string;
  readonly current?: StudioBrushEngineProgramSet | null;
}): StudioBrushEngineProgramSet | null {
  let next = studioBrushEngineProgramSetWithoutComposition(input.current);
  if (input.family === "oil" || input.family === "brush") {
    next = studioBrushEngineProgramSetWithoutOil(next);
  }
  if (input.family === "watercolor") {
    next = studioBrushEngineProgramSetWithoutWatercolor(next);
  }
  return next;
}
