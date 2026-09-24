/**
 * Browser-first execution policy for ToonSpectrum 3D authoring.
 *
 * WebAssembly is an implementation detail, not a reason to leave the web runtime. Every admitted
 * provider executes in the browser main realm, a module Worker, or a browser GPU queue. Native
 * bridges may exist as optional exporters, but they are never required for opening, editing,
 * saving, or rendering a project.
 */

export const STUDIO_WEB_AUTHORING_RUNTIME_VERSION = 1 as const;

export type StudioWebExecutionPath =
  | "browser-webgpu"
  | "browser-webgl2"
  | "browser-wasm-worker"
  | "browser-wasm-main"
  | "browser-worker"
  | "browser-main";

export type StudioWebKernelId =
  | "interactive-renderer"
  | "mesh-boolean"
  | "cad-brep"
  | "character-deformation"
  | "groom"
  | "pose-inference"
  | "persistent-storage"
  | "semantic-output";

export type StudioWebKernelStatus = "ready" | "degraded" | "unavailable";

export interface StudioWebAuthoringCapabilityEvidence {
  readonly secureContext: boolean;
  readonly webAssembly: boolean;
  readonly wasmSimd: boolean;
  readonly wasmThreads: boolean;
  readonly moduleWorker: boolean;
  readonly offscreenCanvas: boolean;
  readonly webgpu: boolean;
  readonly webgl2: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly crossOriginIsolated: boolean;
  readonly opfs: boolean;
  readonly indexedDb: boolean;
  readonly webCrypto: boolean;
  readonly mediaDevices: boolean;
  readonly fileSystemAccess: boolean;
}

export interface StudioWebKernelPlan {
  readonly id: StudioWebKernelId;
  readonly label: string;
  readonly status: StudioWebKernelStatus;
  readonly providerId: string;
  readonly execution: StudioWebExecutionPath;
  readonly nativeRequired: false;
  readonly capabilities: readonly string[];
  readonly reasons: readonly string[];
}

export interface StudioWebAuthoringRuntimePlan {
  readonly version: typeof STUDIO_WEB_AUTHORING_RUNTIME_VERSION;
  readonly primaryEnvironment: "browser";
  readonly nativeRequired: false;
  readonly browserRunnable: boolean;
  readonly offlineCapable: boolean;
  readonly evidence: StudioWebAuthoringCapabilityEvidence;
  readonly kernels: readonly StudioWebKernelPlan[];
  readonly warnings: readonly string[];
}

function frozenKernel(
  value: Omit<StudioWebKernelPlan, "nativeRequired">,
): StudioWebKernelPlan {
  return Object.freeze({
    ...value,
    nativeRequired: false as const,
    capabilities: Object.freeze([...value.capabilities]),
    reasons: Object.freeze([...value.reasons]),
  });
}

function rendererPlan(
  evidence: StudioWebAuthoringCapabilityEvidence,
): StudioWebKernelPlan {
  if (evidence.webgpu && evidence.secureContext) {
    return frozenKernel({
      id: "interactive-renderer",
      label: "Three WebGPU viewport",
      status: "ready",
      providerId: "three-webgpu",
      execution: "browser-webgpu",
      capabilities: ["interactive-editing", "semantic-capture", "compute"],
      reasons: ["WebGPU를 브라우저의 기본 3D viewport로 사용합니다."],
    });
  }
  if (evidence.webgl2) {
    return frozenKernel({
      id: "interactive-renderer",
      label: "Three WebGL2 compatibility viewport",
      status: "degraded",
      providerId: "three-webgl2",
      execution: "browser-webgl2",
      capabilities: ["interactive-editing", "semantic-capture"],
      reasons: [
        evidence.secureContext
          ? "WebGPU를 사용할 수 없어 WebGL2 호환 viewport를 사용합니다."
          : "보안 연결이 아니므로 WebGPU 대신 WebGL2를 사용합니다.",
      ],
    });
  }
  return frozenKernel({
    id: "interactive-renderer",
    label: "3D viewport",
    status: "unavailable",
    providerId: "unavailable",
    execution: "browser-main",
    capabilities: [],
    reasons: ["이 브라우저에서 WebGPU와 WebGL2를 모두 사용할 수 없습니다."],
  });
}

function wasmKernel(input: {
  readonly evidence: StudioWebAuthoringCapabilityEvidence;
  readonly id: StudioWebKernelId;
  readonly label: string;
  readonly workerProvider: string;
  readonly mainProvider: string;
  readonly capabilities: readonly string[];
}): StudioWebKernelPlan {
  if (!input.evidence.webAssembly) {
    return frozenKernel({
      id: input.id,
      label: input.label,
      status: "unavailable",
      providerId: "unavailable",
      execution: "browser-main",
      capabilities: [],
      reasons: ["이 브라우저에서 WebAssembly를 사용할 수 없습니다."],
    });
  }
  if (input.evidence.moduleWorker) {
    return frozenKernel({
      id: input.id,
      label: input.label,
      status: "ready",
      providerId: input.workerProvider,
      execution: "browser-wasm-worker",
      capabilities: input.capabilities,
      reasons: [
        input.evidence.wasmThreads
          ? "WASM 커널을 격리 Worker와 공유 메모리 경로에서 실행합니다."
          : "WASM 커널을 격리 module Worker에서 실행합니다.",
      ],
    });
  }
  return frozenKernel({
    id: input.id,
    label: input.label,
    status: "degraded",
    providerId: input.mainProvider,
    execution: "browser-wasm-main",
    capabilities: input.capabilities,
    reasons: ["Worker를 사용할 수 없어 동일한 WASM 커널을 브라우저 main realm에서 제한적으로 실행합니다."],
  });
}

function deformationPlan(
  evidence: StudioWebAuthoringCapabilityEvidence,
): StudioWebKernelPlan {
  if (evidence.webgpu && evidence.secureContext) {
    return frozenKernel({
      id: "character-deformation",
      label: "Character deformation kernel",
      status: "ready",
      providerId: "webgpu-deformation+wasm-cpu",
      execution: "browser-webgpu",
      capabilities: ["semantic-morph", "control-cage", "corrective", "skinning"],
      reasons: ["상호작용 변형은 WebGPU, 결정적 커밋은 브라우저 WASM/CPU 경로가 담당합니다."],
    });
  }
  if (evidence.moduleWorker) {
    return frozenKernel({
      id: "character-deformation",
      label: "Character deformation kernel",
      status: "degraded",
      providerId: evidence.webAssembly ? "wasm-deformation-worker" : "js-deformation-worker",
      execution: evidence.webAssembly ? "browser-wasm-worker" : "browser-worker",
      capabilities: ["semantic-morph", "control-cage", "corrective", "skinning"],
      reasons: ["GPU compute 없이 Worker 기반 CPU 변형을 사용합니다."],
    });
  }
  return frozenKernel({
    id: "character-deformation",
    label: "Character deformation kernel",
    status: "degraded",
    providerId: "js-deformation-main",
    execution: "browser-main",
    capabilities: ["semantic-morph", "control-cage", "skinning"],
    reasons: ["변형을 브라우저 main realm에서 작은 작업 단위로 실행합니다."],
  });
}

function groomPlan(
  evidence: StudioWebAuthoringCapabilityEvidence,
): StudioWebKernelPlan {
  if (evidence.webgpu && evidence.secureContext) {
    return frozenKernel({
      id: "groom",
      label: "Guide-curve groom kernel",
      status: "ready",
      providerId: "webgpu-groom-derivatives",
      execution: "browser-webgpu",
      capabilities: ["guide-curves", "ribbon-mesh", "lod", "surface-attachment"],
      reasons: ["가이드 커브는 문서에 보존하고 viewport 파생 메시만 WebGPU로 생성합니다."],
    });
  }
  return frozenKernel({
    id: "groom",
    label: "Guide-curve groom kernel",
    status: "degraded",
    providerId: evidence.moduleWorker ? "groom-worker" : "groom-main",
    execution: evidence.moduleWorker ? "browser-worker" : "browser-main",
    capabilities: ["guide-curves", "ribbon-mesh", "lod", "surface-attachment"],
    reasons: ["가이드 커브 파생 메시를 브라우저 CPU 경로에서 생성합니다."],
  });
}

function posePlan(
  evidence: StudioWebAuthoringCapabilityEvidence,
): StudioWebKernelPlan {
  if (!evidence.webAssembly && !evidence.webgpu) {
    return frozenKernel({
      id: "pose-inference",
      label: "Body and hand pose inference",
      status: "degraded",
      providerId: "manual-pose-only",
      execution: "browser-main",
      capabilities: ["manual-pose", "preset-pose", "ik"],
      reasons: ["AI 추론 런타임이 없어 수동·프리셋 포즈만 제공합니다."],
    });
  }
  const execution: StudioWebExecutionPath = evidence.webgpu && evidence.secureContext
    ? "browser-webgpu"
    : evidence.moduleWorker
      ? "browser-wasm-worker"
      : "browser-wasm-main";
  return frozenKernel({
    id: "pose-inference",
    label: "Body and hand pose inference",
    status: evidence.mediaDevices ? "ready" : "degraded",
    providerId: evidence.webgpu ? "mediapipe-webgpu+pose-solver" : "mediapipe-wasm+pose-solver",
    execution,
    capabilities: ["photo-pose", "hand-pose", "retarget", "ik", "contact", "balance"],
    reasons: [
      evidence.mediaDevices
        ? "사진과 웹캠 추론을 모두 브라우저 안에서 실행합니다."
        : "카메라 권한/API가 없어 파일 기반 사진 포즈만 사용할 수 있습니다.",
    ],
  });
}

function storagePlan(
  evidence: StudioWebAuthoringCapabilityEvidence,
): StudioWebKernelPlan {
  if (evidence.opfs && evidence.webAssembly && evidence.moduleWorker) {
    return frozenKernel({
      id: "persistent-storage",
      label: "SQLite WASM + OPFS project store",
      status: "ready",
      providerId: "sqlite-wasm-opfs-worker",
      execution: "browser-wasm-worker",
      capabilities: ["transactions", "opfs", "autosave", "recovery", "offline"],
      reasons: ["브라우저 OPFS의 SQLite WASM 저장소를 프로젝트 권위로 사용합니다."],
    });
  }
  if (evidence.indexedDb) {
    return frozenKernel({
      id: "persistent-storage",
      label: "IndexedDB compatibility project store",
      status: "degraded",
      providerId: "indexeddb-project-store",
      execution: "browser-main",
      capabilities: ["autosave", "recovery", "offline"],
      reasons: ["OPFS SQLite를 사용할 수 없어 IndexedDB 호환 저장소를 사용합니다."],
    });
  }
  return frozenKernel({
    id: "persistent-storage",
    label: "Memory session store",
    status: "unavailable",
    providerId: "memory-session",
    execution: "browser-main",
    capabilities: [],
    reasons: ["브라우저 영구 저장 API를 사용할 수 없어 저장이 차단됩니다."],
  });
}

function outputPlan(
  evidence: StudioWebAuthoringCapabilityEvidence,
): StudioWebKernelPlan {
  if (evidence.moduleWorker && evidence.offscreenCanvas) {
    return frozenKernel({
      id: "semantic-output",
      label: "Offscreen semantic output worker",
      status: "ready",
      providerId: "offscreen-semantic-worker",
      execution: "browser-worker",
      capabilities: ["png", "psd", "tiled-output", "semantic-passes", "cancellation"],
      reasons: ["고해상도 PNG·PSD를 OffscreenCanvas Worker에서 타일 단위로 생성합니다."],
    });
  }
  return frozenKernel({
    id: "semantic-output",
    label: "Cooperative semantic output",
    status: "degraded",
    providerId: "cooperative-main-thread-output",
    execution: "browser-main",
    capabilities: ["png", "psd", "tiled-output", "semantic-passes", "cancellation"],
    reasons: ["OffscreenCanvas Worker가 없어 cooperative 타일 출력으로 main thread 장기 점유를 피합니다."],
  });
}

export function buildStudioWebAuthoringRuntimePlan(
  evidence: StudioWebAuthoringCapabilityEvidence,
): StudioWebAuthoringRuntimePlan {
  const kernels = Object.freeze([
    rendererPlan(evidence),
    wasmKernel({
      evidence,
      id: "mesh-boolean",
      label: "Manifold triangle-solid kernel",
      workerProvider: "manifold-wasm-worker",
      mainProvider: "manifold-wasm-main",
      capabilities: ["boolean", "watertight-validation", "topology-receipt"],
    }),
    wasmKernel({
      evidence,
      id: "cad-brep",
      label: "OpenCascade B-Rep kernel",
      workerProvider: "occt-wasm-worker",
      mainProvider: "occt-wasm-main",
      capabilities: ["brep", "feature-evaluation", "step", "tessellation"],
    }),
    deformationPlan(evidence),
    groomPlan(evidence),
    posePlan(evidence),
    storagePlan(evidence),
    outputPlan(evidence),
  ]);
  const renderer = kernels.find((kernel) => kernel.id === "interactive-renderer");
  const storage = kernels.find((kernel) => kernel.id === "persistent-storage");
  const warnings = kernels
    .filter((kernel) => kernel.status !== "ready")
    .flatMap((kernel) => kernel.reasons.map((reason) => `${kernel.label}: ${reason}`));
  if (!evidence.secureContext) {
    warnings.push("보안 연결(HTTPS)이 아니므로 WebGPU·카메라·일부 저장 기능이 제한될 수 있습니다.");
  }
  return Object.freeze({
    version: STUDIO_WEB_AUTHORING_RUNTIME_VERSION,
    primaryEnvironment: "browser" as const,
    nativeRequired: false as const,
    browserRunnable: renderer?.status !== "unavailable",
    offlineCapable: storage?.status !== "unavailable",
    evidence: Object.freeze({ ...evidence }),
    kernels,
    warnings: Object.freeze([...new Set(warnings)]),
  });
}

function supportsWasmSimd(): boolean {
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") return false;
  try {
    return WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
      10, 10, 1, 8, 0, 65, 0, 253, 15, 11,
    ]));
  } catch {
    return false;
  }
}

function supportsWebgl2(): boolean {
  if (typeof document === "undefined") return false;
  if (typeof navigator !== "undefined" && /jsdom/iu.test(navigator.userAgent)) return false;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

export function probeStudioWebAuthoringCapabilities(): StudioWebAuthoringCapabilityEvidence {
  const navigatorValue = typeof navigator === "undefined" ? null : navigator;
  const storage = navigatorValue?.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  } | undefined;
  const isolated = typeof crossOriginIsolated === "boolean" && crossOriginIsolated;
  const shared = typeof SharedArrayBuffer !== "undefined";
  return Object.freeze({
    secureContext: typeof isSecureContext === "boolean" ? isSecureContext : false,
    webAssembly: typeof WebAssembly !== "undefined",
    wasmSimd: supportsWasmSimd(),
    wasmThreads: isolated && shared,
    moduleWorker: typeof Worker !== "undefined",
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    webgpu: Boolean(navigatorValue && "gpu" in navigatorValue),
    webgl2: supportsWebgl2(),
    sharedArrayBuffer: shared,
    crossOriginIsolated: isolated,
    opfs: typeof storage?.getDirectory === "function",
    indexedDb: typeof indexedDB !== "undefined",
    webCrypto: typeof crypto !== "undefined" && Boolean(crypto.subtle),
    mediaDevices: Boolean(navigatorValue?.mediaDevices?.getUserMedia),
    fileSystemAccess: "showOpenFilePicker" in globalThis
      && typeof Reflect.get(globalThis, "showOpenFilePicker") === "function",
  });
}

export function createCurrentStudioWebAuthoringRuntimePlan(): StudioWebAuthoringRuntimePlan {
  return buildStudioWebAuthoringRuntimePlan(probeStudioWebAuthoringCapabilities());
}
