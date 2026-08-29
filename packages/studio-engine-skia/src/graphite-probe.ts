/**
 * Skia Graphite adoption probe (ADR 0017).
 *
 * "Graphite를 적극적으로 사용한다"를 활성화 한 단계짜리 스위치로 만든다: this probe answers, per
 * device and per build, whether the WebGPU-native Graphite challenger can be admitted to the
 * tournament right now, and names the exact missing precondition when it cannot. Today the
 * blocking precondition is upstream: `canvaskit-wasm` ships the Ganesh (WebGL) backend only and
 * Skia does not publish a Graphite web artifact, so there is nothing to load — inventing a loader
 * here would be a placeholder claim, the thing the descriptor module explicitly forbids.
 *
 * The moment a Graphite-enabled CanvasKit build exists, `registerSkiaGraphiteArtifact` flips the
 * probe to `adoptable`, and from there stability is governed by the tournament plus the declared
 * demotion chain (skia-graphite-webgpu → skia-canvaskit-gpu → skia-canvaskit): an unstable
 * Graphite is quarantined and demoted automatically, never swapped by hand.
 */

export const SKIA_GRAPHITE_PROVIDER_ID = "skia-graphite-webgpu" as const;

export interface SkiaGraphiteArtifact {
  /** Loader for a Graphite-enabled CanvasKit build — NOT the Ganesh `canvaskit-wasm` npm. */
  readonly loadCanvasKit: () => Promise<unknown>;
  /** Exact upstream pin, required later by activation evidence (manifest governance). */
  readonly sourcePin: { readonly version: string; readonly commit: string };
}

let registeredArtifact: SkiaGraphiteArtifact | null = null;

/** Registers the Graphite build the app ships. Idempotent by replacement; test-clearable. */
export function registerSkiaGraphiteArtifact(artifact: SkiaGraphiteArtifact): void {
  registeredArtifact = artifact;
}

export function clearSkiaGraphiteArtifact(): void {
  registeredArtifact = null;
}

export type SkiaGraphiteAdoptionProbe =
  | { readonly status: "adoptable"; readonly artifact: SkiaGraphiteArtifact }
  | { readonly status: "missing-artifact"; readonly reason: string }
  | { readonly status: "no-webgpu"; readonly reason: string };

export interface SkiaGraphiteProbeEnvironment {
  readonly gpu?: unknown;
}

function defaultEnvironment(): SkiaGraphiteProbeEnvironment {
  const navigatorLike = (globalThis as { navigator?: { gpu?: unknown } }).navigator;
  return { gpu: navigatorLike?.gpu };
}

/**
 * Same honesty contract as `createSkiaGpuIslandBackend`: callers must treat anything but
 * `adoptable` as "keep the current lane" — the challenger simply does not enter the tournament.
 */
export function probeSkiaGraphiteAdoption(
  environment: SkiaGraphiteProbeEnvironment = defaultEnvironment()
): SkiaGraphiteAdoptionProbe {
  if (environment.gpu === undefined || environment.gpu === null) {
    return {
      status: "no-webgpu",
      reason: "WebGPU is unavailable on this device; Graphite requires navigator.gpu",
    };
  }
  if (!registeredArtifact) {
    return {
      status: "missing-artifact",
      reason:
        "no Graphite-enabled CanvasKit build is registered — upstream canvaskit-wasm ships "
        + "Ganesh only and Skia has not published a production Graphite web artifact yet",
    };
  }
  return { status: "adoptable", artifact: registeredArtifact };
}
