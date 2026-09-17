import type { StudioScene3dDocumentV1 } from "./studio-scene3d-document";
import {
  inferStudioScene3dRuntimeNeeds,
  resolveStudioScene3dRuntimePlan,
  type StudioScene3dDeviceCapabilities,
  type StudioScene3dPrimaryRenderer,
  type StudioScene3dRuntimePlan,
} from "./studio-scene3d-runtime-policy";

export const STUDIO_SCENE3D_NPR_PASS_IDS = Object.freeze([
  "beauty-base",
  "transparent-beauty",
  "depth",
  "normal",
  "object-id",
  "material-id",
  "shadow",
  "ao",
  "emission",
  "velocity",
  "fx-overlay",
  "beauty",
  "line",
  "tone",
] as const);

export type StudioScene3dNprPassId = (typeof STUDIO_SCENE3D_NPR_PASS_IDS)[number];
export type StudioScene3dNprExecutor =
  | "three-primary"
  | "babylon-specialist"
  | "compositor";

export interface StudioScene3dNprFxRequest {
  readonly rain?: boolean;
  readonly snow?: boolean;
  readonly petals?: boolean;
  readonly speedLines?: boolean;
  readonly depthAtmosphere?: boolean;
  readonly bloom?: boolean;
}

export interface StudioScene3dNprRenderPass {
  readonly id: StudioScene3dNprPassId;
  readonly label: string;
  readonly dependencies: readonly StudioScene3dNprPassId[];
  readonly executor: StudioScene3dNprExecutor;
  readonly runtime: StudioScene3dPrimaryRenderer | "babylon" | "compositor";
  readonly fallbackRuntime: "three-webgl2" | null;
  readonly format: "rgba8" | "r32f" | "rgba16f" | "uint32" | "mask8";
  readonly enabled: boolean;
  readonly required: boolean;
}

export interface StudioScene3dNprRenderGraph {
  readonly version: 1;
  readonly runtimePlan: StudioScene3dRuntimePlan;
  readonly passes: readonly StudioScene3dNprRenderPass[];
  readonly executionOrder: readonly StudioScene3dNprPassId[];
  readonly requestedPasses: readonly StudioScene3dNprPassId[];
  readonly warnings: readonly string[];
  readonly fxRequested: boolean;
  readonly fxSpecialistEnabled: boolean;
}

const PASS_LABELS: Readonly<Record<StudioScene3dNprPassId, string>> = Object.freeze({
  "beauty-base": "기본 컬러",
  "transparent-beauty": "투명 컬러",
  depth: "깊이",
  normal: "노멀",
  "object-id": "오브젝트 ID",
  "material-id": "재질 ID",
  shadow: "그림자",
  ao: "앰비언트 오클루전",
  emission: "발광",
  velocity: "모션 벡터",
  "fx-overlay": "공간 FX",
  beauty: "최종 컬러",
  line: "선화",
  tone: "톤·해칭",
});

const DEFAULT_REQUESTED: readonly StudioScene3dNprPassId[] = Object.freeze([
  "beauty",
  "depth",
  "normal",
  "object-id",
  "material-id",
  "shadow",
  "line",
  "tone",
]);

function fxRequested(fx: StudioScene3dNprFxRequest | undefined): boolean {
  return Boolean(fx && Object.values(fx).some(Boolean));
}

function dependencyMap(input: {
  readonly transparent: boolean;
  readonly fx: boolean;
}): Readonly<Record<StudioScene3dNprPassId, readonly StudioScene3dNprPassId[]>> {
  const beautyDependencies: StudioScene3dNprPassId[] = ["beauty-base"];
  if (input.transparent) beautyDependencies.push("transparent-beauty");
  if (input.fx) beautyDependencies.push("fx-overlay");
  return Object.freeze({
    "beauty-base": Object.freeze([]),
    "transparent-beauty": Object.freeze([]),
    depth: Object.freeze([]),
    normal: Object.freeze([]),
    "object-id": Object.freeze([]),
    "material-id": Object.freeze([]),
    shadow: Object.freeze([]),
    ao: Object.freeze(["depth", "normal"]),
    emission: Object.freeze([]),
    velocity: Object.freeze([]),
    "fx-overlay": Object.freeze(["depth", "normal", "object-id"]),
    beauty: Object.freeze(beautyDependencies),
    line: Object.freeze(["depth", "normal", "object-id", "material-id"]),
    tone: Object.freeze(["beauty", "shadow", "ao"]),
  });
}

function expandDependencies(
  requested: readonly StudioScene3dNprPassId[],
  dependencies: Readonly<Record<StudioScene3dNprPassId, readonly StudioScene3dNprPassId[]>>,
): ReadonlySet<StudioScene3dNprPassId> {
  const expanded = new Set<StudioScene3dNprPassId>();
  const visit = (pass: StudioScene3dNprPassId) => {
    if (expanded.has(pass)) return;
    expanded.add(pass);
    for (const dependency of dependencies[pass]) visit(dependency);
  };
  for (const pass of requested) visit(pass);
  return expanded;
}

function executionOrder(
  enabled: ReadonlySet<StudioScene3dNprPassId>,
  dependencies: Readonly<Record<StudioScene3dNprPassId, readonly StudioScene3dNprPassId[]>>,
): readonly StudioScene3dNprPassId[] {
  const visiting = new Set<StudioScene3dNprPassId>();
  const visited = new Set<StudioScene3dNprPassId>();
  const ordered: StudioScene3dNprPassId[] = [];
  const visit = (pass: StudioScene3dNprPassId) => {
    if (!enabled.has(pass) || visited.has(pass)) return;
    if (visiting.has(pass)) throw new Error(`NPR render graph cycle: ${pass}`);
    visiting.add(pass);
    for (const dependency of dependencies[pass]) visit(dependency);
    visiting.delete(pass);
    visited.add(pass);
    ordered.push(pass);
  };
  for (const pass of STUDIO_SCENE3D_NPR_PASS_IDS) visit(pass);
  return Object.freeze(ordered);
}

function executorFor(
  pass: StudioScene3dNprPassId,
  primary: StudioScene3dPrimaryRenderer,
): Pick<StudioScene3dNprRenderPass, "executor" | "runtime" | "fallbackRuntime" | "format"> {
  const fallbackRuntime = primary === "three-webgpu" ? "three-webgl2" : null;
  if (pass === "fx-overlay") {
    return { executor: "babylon-specialist", runtime: "babylon", fallbackRuntime: null, format: "rgba16f" };
  }
  if (pass === "beauty" || pass === "line" || pass === "tone" || pass === "ao") {
    return { executor: "compositor", runtime: "compositor", fallbackRuntime: null, format: "rgba8" };
  }
  if (pass === "depth") {
    return { executor: "three-primary", runtime: primary, fallbackRuntime, format: "r32f" };
  }
  if (pass === "normal" || pass === "emission" || pass === "velocity") {
    return { executor: "three-primary", runtime: primary, fallbackRuntime, format: "rgba16f" };
  }
  if (pass === "object-id" || pass === "material-id") {
    return { executor: "three-primary", runtime: primary, fallbackRuntime, format: "uint32" };
  }
  if (pass === "shadow") {
    return { executor: "three-primary", runtime: primary, fallbackRuntime, format: "mask8" };
  }
  return { executor: "three-primary", runtime: primary, fallbackRuntime, format: "rgba8" };
}

export function buildStudioScene3dNprRenderGraph(input: {
  readonly document: StudioScene3dDocumentV1;
  readonly capabilities: StudioScene3dDeviceCapabilities;
  readonly requestedPasses?: readonly StudioScene3dNprPassId[];
  readonly fx?: StudioScene3dNprFxRequest;
  readonly babylonSpecialistAvailable?: boolean;
}): StudioScene3dNprRenderGraph {
  const needs = inferStudioScene3dRuntimeNeeds(input.document);
  const runtimePlan = resolveStudioScene3dRuntimePlan(input.capabilities, needs);
  const requested = Object.freeze([...(input.requestedPasses ?? DEFAULT_REQUESTED)]);
  const wantsFx = fxRequested(input.fx);
  const fxEnabled = wantsFx && input.babylonSpecialistAvailable === true;
  const transparent = input.document.output.transparent;
  const dependencies = dependencyMap({ transparent, fx: fxEnabled });
  const requestedWithFx = fxEnabled && requested.includes("beauty")
    ? Object.freeze([...requested, "fx-overlay"] as StudioScene3dNprPassId[])
    : requested;
  const expanded = expandDependencies(requestedWithFx, dependencies);
  const order = executionOrder(expanded, dependencies);
  const warnings: string[] = [];
  if (wantsFx && !fxEnabled) {
    warnings.push("Babylon FX specialist를 사용할 수 없어 공간 FX 패스를 생략했습니다. 장면 권한은 Three에 유지됩니다.");
  }
  if (runtimePlan.primaryRenderer === "three-webgl2") {
    warnings.push("WebGPU를 사용할 수 없어 Three WebGL2 호환 렌더러로 동일 패스 계약을 실행합니다.");
  }
  const passes = STUDIO_SCENE3D_NPR_PASS_IDS.map((id) => {
    const enabled = expanded.has(id);
    const required = requested.includes(id) || (id === "fx-overlay" && fxEnabled);
    return Object.freeze({
      id,
      label: PASS_LABELS[id],
      dependencies: dependencies[id],
      ...executorFor(id, runtimePlan.primaryRenderer),
      enabled,
      required,
    });
  });
  return Object.freeze({
    version: 1 as const,
    runtimePlan,
    passes: Object.freeze(passes),
    executionOrder: order,
    requestedPasses: requested,
    warnings: Object.freeze(warnings),
    fxRequested: wantsFx,
    fxSpecialistEnabled: fxEnabled,
  });
}
