import {
  diagnoseStudioInAppBrowser,
  type StudioInAppBrowserDiagnosis,
} from "@/compat/in-app-browser";
import {
  translateBilingualValueForActiveLocale,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("studio-immersive-capabilities", ko, en);

export type StudioImmersiveSupport = "supported" | "unsupported" | "unknown";
export type StudioImmersiveReadiness = "ready" | "fallback";

export interface StudioImmersiveCapabilityScope {
  readonly isSecureContext?: boolean;
  readonly location?: { readonly href?: string };
  readonly navigator?: {
    readonly userAgent?: string;
    readonly maxTouchPoints?: number;
    readonly gpu?: unknown;
    readonly xr?: {
      isSessionSupported(mode: "immersive-ar" | "immersive-vr"): Promise<boolean>;
    };
    readonly storage?: {
      persisted?: () => Promise<boolean>;
    };
  };
  readonly document?: {
    createElement(tagName: "canvas"): { getContext(contextId: string): unknown };
  };
  readonly File?: unknown;
  readonly FileReader?: unknown;
  readonly URL?: { readonly createObjectURL?: unknown };
}
export interface StudioImmersiveCapabilitySnapshot {
  readonly inspectedAt: number;
  readonly readiness: StudioImmersiveReadiness;
  readonly secureContext: boolean;
  readonly webgl2: StudioImmersiveSupport;
  readonly webgpu: StudioImmersiveSupport;
  readonly webxr: StudioImmersiveSupport;
  readonly immersiveAr: StudioImmersiveSupport;
  readonly immersiveVr: StudioImmersiveSupport;
  readonly localFiles: StudioImmersiveSupport;
  readonly storageApi: StudioImmersiveSupport;
  readonly storagePersisted: boolean | null;
  readonly touchPoints: number;
  readonly inAppBrowser: StudioInAppBrowserDiagnosis;
  readonly warnings: readonly string[];
}

const UNKNOWN_IN_APP = diagnoseStudioInAppBrowser({});

function support(value: boolean): StudioImmersiveSupport {
  return value ? "supported" : "unsupported";
}

function probeWebGl2(scope: StudioImmersiveCapabilityScope): StudioImmersiveSupport {
  if (!scope.document) return "unknown";
  try {
    return support(Boolean(scope.document.createElement("canvas").getContext("webgl2")));
  } catch {
    return "unknown";
  }
}
async function inspectXrMode(
  scope: StudioImmersiveCapabilityScope,
  mode: "immersive-ar" | "immersive-vr",
): Promise<StudioImmersiveSupport> {
  if (scope.isSecureContext !== true || !scope.navigator?.xr) return "unsupported";
  try {
    return support(await scope.navigator.xr.isSessionSupported(mode));
  } catch {
    return "unknown";
  }
}

async function inspectPersistentStorage(
  scope: StudioImmersiveCapabilityScope,
): Promise<{ readonly state: StudioImmersiveSupport; readonly persisted: boolean | null }> {
  const persisted = scope.navigator?.storage?.persisted;
  if (typeof persisted !== "function") {
    return { state: "unsupported", persisted: null };
  }
  try {
    return { state: "supported", persisted: await persisted.call(scope.navigator?.storage) };
  } catch {
    return { state: "unknown", persisted: null };
  }
}

function localFileSupport(scope: StudioImmersiveCapabilityScope): StudioImmersiveSupport {
  return support(
    typeof scope.File === "function"
      && typeof scope.FileReader === "function"
      && typeof scope.URL?.createObjectURL === "function",
  );
}
function buildWarnings(input: {
  readonly secureContext: boolean;
  readonly webgl2: StudioImmersiveSupport;
  readonly immersiveAr: StudioImmersiveSupport;
  readonly immersiveVr: StudioImmersiveSupport;
  readonly localFiles: StudioImmersiveSupport;
  readonly inAppBrowser: StudioInAppBrowserDiagnosis;
}): readonly string[] {
  const warnings: string[] = [];
  if (!input.secureContext) warnings.push("secure-context-required");
  if (input.webgl2 !== "supported") warnings.push("spatial-renderer-limited");
  if (input.immersiveAr !== "supported" && input.immersiveVr !== "supported") {
    warnings.push("immersive-session-unavailable");
  }
  if (input.localFiles !== "supported") warnings.push("local-file-import-unavailable");
  if (input.inAppBrowser.inApp) warnings.push("in-app-browser-limited");
  return Object.freeze(warnings);
}

/**
 * Inspect only passive browser capabilities. This never opens a camera, requests an XR session,
 * uploads a file or asks for durable storage, so mounting the hub cannot trigger permission UI.
 */
export async function inspectStudioImmersiveCapabilities(
  scope: StudioImmersiveCapabilityScope = globalThis as unknown as StudioImmersiveCapabilityScope,
): Promise<StudioImmersiveCapabilitySnapshot> {
  const navigation = scope.navigator;
  const secureContext = scope.isSecureContext === true;
  const webgl2 = probeWebGl2(scope);
  const webgpu = support(Boolean(navigation && "gpu" in navigation && navigation.gpu));
  const webxr = support(Boolean(navigation?.xr));
  const localFiles = localFileSupport(scope);
  const inAppBrowser = navigation?.userAgent
    ? diagnoseStudioInAppBrowser({
        href: scope.location?.href ?? null,
        userAgent: navigation.userAgent,
      })
    : UNKNOWN_IN_APP;
  const [immersiveAr, immersiveVr, storage] = await Promise.all([
    inspectXrMode(scope, "immersive-ar"),
    inspectXrMode(scope, "immersive-vr"),
    inspectPersistentStorage(scope),
  ]);
  const warnings = buildWarnings({
    secureContext,
    webgl2,
    immersiveAr,
    immersiveVr,
    localFiles,
    inAppBrowser,
  });
  const readiness: StudioImmersiveReadiness =
    secureContext
      && webgl2 === "supported"
      && (immersiveAr === "supported" || immersiveVr === "supported")
      ? "ready"
      : "fallback";

  return Object.freeze({
    inspectedAt: Date.now(),
    readiness,
    secureContext,
    webgl2,
    webgpu,
    webxr,
    immersiveAr,
    immersiveVr,
    localFiles,
    storageApi: storage.state,
    storagePersisted: storage.persisted,
    touchPoints: Math.max(0, Number(navigation?.maxTouchPoints) || 0),
    inAppBrowser,
    warnings,
  });
}

export function studioImmersiveSupportLabel(
  state: StudioImmersiveSupport,
  _locale,
): string {
  if (state === "supported") return bi("사용 가능", "Available");
  if (state === "unsupported") return bi("미지원", "Unavailable");
  return bi("확인 필요", "Check required");
}
