export type StudioScene3dRuntimeFailureKind =
  | "webgpu-initialization"
  | "webgpu-device-lost"
  | "webgl-context-lost"
  | "babylon-specialist"
  | "capture-timeout";

export type StudioScene3dRuntimeRecoveryAction =
  | "retry-selected-runtime"
  | "await-webgl-context-restore"
  | "recreate-webgl-runtime"
  | "offer-explicit-webgl2-switch"
  | "disable-specialist-and-continue"
  | "abort-capture-preserve-document";

export interface StudioScene3dRuntimeFailure {
  readonly kind: StudioScene3dRuntimeFailureKind;
  readonly selectedRuntime: "three-webgpu" | "three-webgl2";
  readonly attempt: number;
  readonly documentId: string;
  readonly documentRevision: number;
  readonly documentSourceHash: `sha256:${string}`;
  readonly recoverable: boolean;
  readonly contextRestored?: boolean;
}

export interface StudioScene3dRuntimeRecoveryPlan {
  readonly version: 1;
  readonly action: StudioScene3dRuntimeRecoveryAction;
  readonly preservesDocumentAuthority: true;
  readonly requiresUserConfirmation: boolean;
  readonly mayChangeSelectedRuntime: boolean;
  readonly retryAfterMs: number | null;
  readonly message: string;
}

function recoveryPlan(
  action: StudioScene3dRuntimeRecoveryAction,
  options: {
    readonly requiresUserConfirmation?: boolean;
    readonly mayChangeSelectedRuntime?: boolean;
    readonly retryAfterMs?: number | null;
    readonly message: string;
  },
): StudioScene3dRuntimeRecoveryPlan {
  return Object.freeze({
    version: 1 as const,
    action,
    preservesDocumentAuthority: true as const,
    requiresUserConfirmation: options.requiresUserConfirmation ?? false,
    mayChangeSelectedRuntime: options.mayChangeSelectedRuntime ?? false,
    retryAfterMs: options.retryAfterMs ?? null,
    message: options.message,
  });
}

export function planStudioScene3dRuntimeRecovery(
  failure: StudioScene3dRuntimeFailure,
): StudioScene3dRuntimeRecoveryPlan {
  if (!failure.documentId || failure.documentRevision < 0 || !failure.documentSourceHash) {
    throw new Error("Runtime recovery requires a canonical SceneDocument authority receipt.");
  }
  if (failure.kind === "babylon-specialist") {
    return recoveryPlan("disable-specialist-and-continue", {
      message: "Babylon FX 작업만 중단하고 Three 편집 장면과 문서는 유지합니다.",
    });
  }
  if (failure.kind === "webgl-context-lost") {
    return recoveryPlan(
      failure.contextRestored === true
        ? "recreate-webgl-runtime"
        : "await-webgl-context-restore",
      {
        retryAfterMs: failure.contextRestored === true ? 0 : 250,
        message: failure.contextRestored === true
          ? "복구된 WebGL context로 렌더 자원만 다시 만들고 SceneDocument를 재투영합니다."
          : "브라우저의 WebGL context 복구 이벤트를 기다리며 편집 문서는 메모리에 유지합니다.",
      },
    );
  }
  if (failure.kind === "capture-timeout") {
    return recoveryPlan("abort-capture-preserve-document", {
      message: "시간을 초과한 출력 작업만 취소하고 장면·undo·Linked 3D 관계는 유지합니다.",
    });
  }
  if (
    failure.selectedRuntime === "three-webgpu" &&
    failure.attempt < 1 &&
    failure.recoverable
  ) {
    return recoveryPlan("retry-selected-runtime", {
      retryAfterMs: 250,
      message: "동일한 WebGPU 선택과 동일 SceneDocument snapshot으로 한 번 다시 시작합니다.",
    });
  }
  return recoveryPlan("offer-explicit-webgl2-switch", {
    requiresUserConfirmation: true,
    mayChangeSelectedRuntime: true,
    message: "WebGPU 재시작이 실패했습니다. 자동으로 엔진을 바꾸지 않고 WebGL2 전환을 사용자에게 제안합니다.",
  });
}

export interface StudioScene3dSoakSample {
  readonly elapsedMs: number;
  readonly frameTimeMs: number;
  readonly jsHeapBytes: number | null;
  readonly gpuResourceCount: number | null;
  readonly documentRevision: number;
}

export interface StudioScene3dSoakEvaluation {
  readonly passed: boolean;
  readonly durationMs: number;
  readonly frameP95Ms: number;
  readonly heapGrowthBytes: number | null;
  readonly gpuResourceGrowth: number | null;
  readonly revisionMovedBackwards: boolean;
  readonly failures: readonly string[];
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
    ?? Number.POSITIVE_INFINITY;
}

function growth(values: readonly (number | null)[]): number | null {
  const numbers = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return numbers.length >= 2 ? numbers[numbers.length - 1]! - numbers[0]! : null;
}
export function evaluateStudioScene3dSoak(input: {
  readonly samples: readonly StudioScene3dSoakSample[];
  readonly minimumDurationMs?: number;
  readonly maximumFrameP95Ms?: number;
  readonly maximumHeapGrowthBytes?: number;
  readonly maximumGpuResourceGrowth?: number;
}): StudioScene3dSoakEvaluation {
  const samples = [...input.samples].sort((left, right) => left.elapsedMs - right.elapsedMs);
  const durationMs = samples.length > 0
    ? samples[samples.length - 1]!.elapsedMs - samples[0]!.elapsedMs
    : 0;
  const frameP95Ms = percentile95(samples.map(({ frameTimeMs }) => frameTimeMs));
  const heapGrowthBytes = growth(samples.map(({ jsHeapBytes }) => jsHeapBytes));
  const gpuResourceGrowth = growth(samples.map(({ gpuResourceCount }) => gpuResourceCount));
  const revisionMovedBackwards = samples.some((sample, index) =>
    index > 0 && sample.documentRevision < samples[index - 1]!.documentRevision);
  const failures: string[] = [];

  if (durationMs < (input.minimumDurationMs ?? 30 * 60 * 1_000)) {
    failures.push("soak-duration-too-short");
  }
  if (frameP95Ms > (input.maximumFrameP95Ms ?? 33.3)) {
    failures.push("frame-p95-exceeded");
  }
  if (
    heapGrowthBytes !== null &&
    heapGrowthBytes > (input.maximumHeapGrowthBytes ?? 32 * 1024 * 1024)
  ) {
    failures.push("heap-growth-exceeded");
  }
  if (
    gpuResourceGrowth !== null &&
    gpuResourceGrowth > (input.maximumGpuResourceGrowth ?? 8)
  ) {
    failures.push("gpu-resource-growth-exceeded");
  }
  if (revisionMovedBackwards) failures.push("document-revision-moved-backwards");

  return Object.freeze({
    passed: failures.length === 0,
    durationMs,
    frameP95Ms,
    heapGrowthBytes,
    gpuResourceGrowth,
    revisionMovedBackwards,
    failures: Object.freeze(failures),
  });
}
