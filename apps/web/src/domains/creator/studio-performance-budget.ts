export const STUDIO_PERFORMANCE_RESOURCE_KINDS = [
  "raster",
  "vector",
  "brush",
  "3d",
  "video",
  "effect",
] as const;

export type StudioPerformanceResourceKind =
  (typeof STUDIO_PERFORMANCE_RESOURCE_KINDS)[number];
export type StudioPerformanceSeverity = "info" | "warning" | "error";
export type StudioPerformanceActionId =
  | "keep-original"
  | "generate-proxy"
  | "generate-lod"
  | "defer-offscreen"
  | "reduce-preview-quality"
  | "pause-live-effect";

export interface StudioPerformanceResource {
  readonly id: string;
  readonly kind: StudioPerformanceResourceKind;
  readonly estimatedMemoryBytes: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly liveEffectCount: number;
  readonly visible: boolean;
  readonly editable: boolean;
}

export interface StudioPerformanceDeviceProfile {
  readonly memoryBudgetBytes: number;
  readonly drawCallBudget: number;
  readonly triangleBudget: number;
  readonly liveEffectBudget: number;
  readonly webGpuAvailable: boolean;
  readonly reducedMotion: boolean;
}

export interface StudioPerformanceFinding {
  readonly code: string;
  readonly severity: StudioPerformanceSeverity;
  readonly affectedIds: readonly string[];
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioPerformanceAction {
  readonly id: StudioPerformanceActionId;
  readonly resourceIds: readonly string[];
  readonly automatic: boolean;
  readonly preservesOriginal: true;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioPerformancePlan {
  readonly status: "healthy" | "optimized" | "limited";
  readonly estimatedMemoryBytes: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly liveEffectCount: number;
  readonly findings: readonly StudioPerformanceFinding[];
  readonly actions: readonly StudioPerformanceAction[];
}

function validNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function finding(
  code: string,
  severity: StudioPerformanceSeverity,
  affectedIds: readonly string[],
  messageKo: string,
  messageEn: string,
): StudioPerformanceFinding {
  return Object.freeze({
    code,
    severity,
    affectedIds: Object.freeze([...affectedIds]),
    messageKo,
    messageEn,
  });
}

function action(
  id: StudioPerformanceActionId,
  resourceIds: readonly string[],
  automatic: boolean,
  labelKo: string,
  labelEn: string,
): StudioPerformanceAction {
  return Object.freeze({
    id,
    resourceIds: Object.freeze([...resourceIds]),
    automatic,
    preservesOriginal: true,
    labelKo,
    labelEn,
  });
}

export function planStudioPerformance(
  resources: readonly StudioPerformanceResource[],
  device: StudioPerformanceDeviceProfile,
): StudioPerformancePlan {
  for (const [label, value] of [
    ["memory budget", device.memoryBudgetBytes],
    ["draw-call budget", device.drawCallBudget],
    ["triangle budget", device.triangleBudget],
    ["live-effect budget", device.liveEffectBudget],
  ] as const) {
    if (!validNonNegative(value) || value === 0) throw new Error(`Invalid ${label}.`);
  }
  const ids = resources.map((resource) => resource.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) {
    throw new Error("Performance resource ids must be non-empty and unique.");
  }
  for (const resource of resources) {
    if (
      !validNonNegative(resource.estimatedMemoryBytes)
      || !validNonNegative(resource.drawCalls)
      || !validNonNegative(resource.triangles)
      || !validNonNegative(resource.liveEffectCount)
    ) {
      throw new Error("Performance resource metrics must be non-negative.");
    }
  }

  const estimatedMemoryBytes = resources.reduce(
    (sum, resource) => sum + resource.estimatedMemoryBytes,
    0,
  );
  const drawCalls = resources.reduce((sum, resource) => sum + resource.drawCalls, 0);
  const triangles = resources.reduce((sum, resource) => sum + resource.triangles, 0);
  const liveEffectCount = resources.reduce(
    (sum, resource) => sum + resource.liveEffectCount,
    0,
  );
  const findings: StudioPerformanceFinding[] = [];
  const actions: StudioPerformanceAction[] = [];
  const hiddenIds = resources.filter((resource) => !resource.visible).map((resource) => resource.id);
  const rasterOrVideoIds = resources
    .filter((resource) => resource.visible && ["raster", "video"].includes(resource.kind))
    .sort((left, right) => right.estimatedMemoryBytes - left.estimatedMemoryBytes)
    .map((resource) => resource.id);
  const threeDIds = resources
    .filter((resource) => resource.visible && resource.kind === "3d")
    .map((resource) => resource.id);
  const effectIds = resources
    .filter((resource) => resource.visible && resource.liveEffectCount > 0)
    .map((resource) => resource.id);

  if (hiddenIds.length > 0) {
    actions.push(action(
      "defer-offscreen",
      hiddenIds,
      true,
      "보이지 않는 항목은 필요할 때 렌더링",
      "Render hidden items only when needed",
    ));
  }
  if (estimatedMemoryBytes > device.memoryBudgetBytes) {
    findings.push(finding(
      "memory-budget",
      estimatedMemoryBytes > device.memoryBudgetBytes * 1.5 ? "error" : "warning",
      rasterOrVideoIds,
      "미리보기 메모리 사용량이 기기 권장 범위를 넘습니다.",
      "Preview memory exceeds the recommended device budget.",
    ));
    if (rasterOrVideoIds.length > 0) {
      actions.push(action(
        "generate-proxy",
        rasterOrVideoIds,
        true,
        "편집용 프록시 자동 생성",
        "Generate editing proxies automatically",
      ));
    }
    actions.push(action(
      "reduce-preview-quality",
      ids,
      true,
      "미리보기만 가볍게 표시",
      "Reduce preview quality only",
    ));
  }
  if (drawCalls > device.drawCallBudget || triangles > device.triangleBudget) {
    findings.push(finding(
      "scene-complexity",
      !device.webGpuAvailable && triangles > device.triangleBudget * 1.5 ? "error" : "warning",
      threeDIds,
      "3D 장면이 현재 기기에서 무거울 수 있습니다.",
      "The 3D scene may be too complex for this device.",
    ));
    if (threeDIds.length > 0) {
      actions.push(action(
        "generate-lod",
        threeDIds,
        true,
        "화면 거리별 가벼운 3D 표시 생성",
        "Generate level-of-detail previews",
      ));
    }
  }
  if (liveEffectCount > device.liveEffectBudget) {
    findings.push(finding(
      "live-effect-budget",
      "warning",
      effectIds,
      "실시간 효과가 많아 조작이 느려질 수 있습니다.",
      "Too many live effects may reduce interaction performance.",
    ));
    actions.push(action(
      "pause-live-effect",
      effectIds,
      false,
      "선택한 실시간 효과 잠시 멈추기",
      "Pause selected live effects",
    ));
  }
  if (device.reducedMotion) {
    findings.push(finding(
      "reduced-motion",
      "info",
      [],
      "움직임 줄이기 설정에 맞춰 미리보기 전환을 단순화합니다.",
      "Preview transitions are simplified for reduced-motion preferences.",
    ));
  }
  actions.unshift(action(
    "keep-original",
    ids,
    true,
    "원본 품질 유지",
    "Keep original quality",
  ));

  const errors = findings.filter((item) => item.severity === "error").length;
  return Object.freeze({
    status: errors > 0 ? "limited" : findings.some((item) => item.severity === "warning")
      ? "optimized"
      : "healthy",
    estimatedMemoryBytes,
    drawCalls,
    triangles,
    liveEffectCount,
    findings: Object.freeze(findings),
    actions: Object.freeze(actions),
  });
}
