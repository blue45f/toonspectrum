import { sha256HexPortable } from "./studio-sha256";

import type { SceneIR } from "@toonspectrum/studio-project-model";

export const STUDIO_SVG_PRODUCT_ROUTE_REVISION = 1 as const;
export const STUDIO_SVG_PRODUCT_VISUAL_GATE = Object.freeze({
  metric: "symmetric-3x3-rgba-delta48" as const,
  maximumMismatchPct: 2,
  referenceProviderId: "resvg-wasm" as const,
});
export const STUDIO_SVG_PRODUCT_BUDGETS = Object.freeze({
  maxSourceCodeUnits: 2 * 1024 * 1024,
  maxDimensionPx: 4_096,
  maxPixels: 1_048_576,
  maxCachedEntries: 24,
  maxCachedPixelBytes: 8 * 1024 * 1024,
  maxConcurrentResolutions: 2,
});

export type StudioSvgProductProviderId =
  | "vello-svg-native"
  | "skia-canvaskit-scene-ir"
  | "resvg-wasm"
  | "browser-native-svg"
  | "rejected";

export type StudioSvgProductTrust = "bundled-catalog" | "user-import";

export interface StudioSvgProductInput {
  readonly assetId: string;
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly trust: StudioSvgProductTrust;
}

export interface StudioSvgProductPixels {
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}

export interface StudioSvgProductAudit {
  readonly elementCount: number;
  readonly maxDepth: number;
  readonly localReferenceCount: number;
}

export interface StudioSvgProductSceneImport {
  readonly scene: SceneIR;
  readonly warnings: readonly string[];
  readonly unsupported: readonly string[];
}

export interface StudioSvgProductVisualGateResult {
  readonly metric: typeof STUDIO_SVG_PRODUCT_VISUAL_GATE.metric;
  readonly referenceProviderId: typeof STUDIO_SVG_PRODUCT_VISUAL_GATE.referenceProviderId;
  readonly maximumMismatchPct: number;
  readonly mismatchPct: number;
  readonly pass: boolean;
}

export interface StudioSvgProductDecision {
  readonly kind: "studio-svg-product-decision";
  readonly revision: typeof STUDIO_SVG_PRODUCT_ROUTE_REVISION;
  readonly assetId: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly providerId: StudioSvgProductProviderId;
  readonly route:
    | "strict-native-reference"
    | "editable-scene-ir"
    | "reference-raster"
    | "trusted-browser-preservation"
    | "fail-closed";
  readonly audit: StudioSvgProductAudit | null;
  readonly visualGate: StudioSvgProductVisualGateResult | null;
  readonly pixels: StudioSvgProductPixels | null;
  readonly sourcePreserved: true;
  readonly editable: boolean;
  readonly interactiveGpuReadbackBytes: 0;
  readonly fallbackFrom: "vello-svg-native" | null;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly unsupported: readonly string[];
}

export interface StudioSvgProductEngines {
  auditVello(svg: string): Promise<StudioSvgProductAudit>;
  renderVelloCpu(svg: string, width: number, height: number): Promise<Uint8Array>;
  importScene(svg: string): Promise<StudioSvgProductSceneImport>;
  renderScene(scene: SceneIR): Promise<StudioSvgProductPixels>;
  renderResvg(svg: string, width: number, height: number): Promise<StudioSvgProductPixels>;
}

export interface StudioSvgProductTournamentMetrics {
  readonly cachedEntries: number;
  readonly cachedPixelBytes: number;
  readonly inFlight: number;
  readonly active: number;
  readonly queued: number;
}

function asReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return String(error);
}

function sourceDigest(input: StudioSvgProductInput): `sha256:${string}` {
  return `sha256:${sha256HexPortable(
    new TextEncoder().encode(`${input.width}x${input.height}\u0000${input.svg}`),
  )}`;
}

function routingCacheKey(input: StudioSvgProductInput): string {
  return `${input.assetId}\u0000${sourceDigest(input)}`;
}

function inputIssue(input: StudioSvgProductInput): string | null {
  if (!input.assetId.trim()) return "asset id is empty";
  if (!input.svg.trim()) return "SVG source is empty";
  if (input.svg.length > STUDIO_SVG_PRODUCT_BUDGETS.maxSourceCodeUnits) {
    return "SVG source exceeds the 2 MiB product budget";
  }
  if (
    !Number.isInteger(input.width)
    || !Number.isInteger(input.height)
    || input.width <= 0
    || input.height <= 0
    || input.width > STUDIO_SVG_PRODUCT_BUDGETS.maxDimensionPx
    || input.height > STUDIO_SVG_PRODUCT_BUDGETS.maxDimensionPx
    || input.width * input.height > STUDIO_SVG_PRODUCT_BUDGETS.maxPixels
  ) {
    return "SVG preview dimensions exceed the bounded product surface";
  }
  return null;
}

function activeOrExternalSvg(svg: string): boolean {
  return (
    /<!doctype\b|<!entity\b|<\s*(?:script|foreignObject|iframe|object|embed)\b/iu.test(svg)
    || /\bon[a-z0-9_-]+\s*=/iu.test(svg)
    || /(?:javascript|vbscript)\s*:/iu.test(svg)
    || /\b(?:href|xlink:href)\s*=\s*["'](?!#|data:image\/(?:png|jpeg|webp|gif);base64,)/iu.test(svg)
    || /url\(\s*["']?(?!#)/iu.test(svg)
  );
}

function needsBrowserResourceSemantics(svg: string): boolean {
  return (
    /<\s*text\b|<\s*tspan\b|<\s*textPath\b/iu.test(svg)
    || /@font-face\b/iu.test(svg)
  );
}

function validPixels(
  pixels: StudioSvgProductPixels,
  width: number,
  height: number,
): boolean {
  return (
    pixels.width === width
    && pixels.height === height
    && pixels.bytes instanceof Uint8Array
    && pixels.bytes.byteLength === width * height * 4
  );
}

function pixelsFromBytes(
  bytes: Uint8Array,
  width: number,
  height: number,
): StudioSvgProductPixels {
  if (bytes.byteLength !== width * height * 4) {
    throw new Error(
      `renderer returned ${bytes.byteLength} bytes for ${width}x${height} RGBA`,
    );
  }
  return { width, height, bytes };
}

function directionalMismatchCount(
  from: Uint8Array,
  to: Uint8Array,
  width: number,
  height: number,
): number {
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      let matched = false;
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        const candidateY = y + dy;
        if (candidateY < 0 || candidateY >= height) continue;
        for (let dx = -1; dx <= 1 && !matched; dx += 1) {
          const candidateX = x + dx;
          if (candidateX < 0 || candidateX >= width) continue;
          const targetOffset = (candidateY * width + candidateX) * 4;
          matched = true;
          for (let channel = 0; channel < 4; channel += 1) {
            if (
              Math.abs(
                (from[sourceOffset + channel] ?? 0)
                - (to[targetOffset + channel] ?? 0),
              ) > 48
            ) {
              matched = false;
              break;
            }
          }
        }
      }
      if (!matched) mismatches += 1;
    }
  }
  return mismatches;
}

/** Same symmetric δ48 3×3 metric as the committed engine quality corpus. */
export function studioSvgProductFuzzyMismatchPct(
  left: Uint8Array,
  right: Uint8Array,
  width: number,
  height: number,
): number {
  const expected = width * height * 4;
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
    || left.byteLength !== expected
    || right.byteLength !== expected
  ) {
    throw new RangeError("SVG visual gate buffers do not match the declared dimensions");
  }
  const mismatch = Math.max(
    directionalMismatchCount(left, right, width, height),
    directionalMismatchCount(right, left, width, height),
  );
  return mismatch / (width * height) * 100;
}

function visualGate(
  candidate: StudioSvgProductPixels,
  reference: StudioSvgProductPixels,
): StudioSvgProductVisualGateResult {
  const mismatchPct = studioSvgProductFuzzyMismatchPct(
    candidate.bytes,
    reference.bytes,
    candidate.width,
    candidate.height,
  );
  return {
    metric: STUDIO_SVG_PRODUCT_VISUAL_GATE.metric,
    referenceProviderId: STUDIO_SVG_PRODUCT_VISUAL_GATE.referenceProviderId,
    maximumMismatchPct: STUDIO_SVG_PRODUCT_VISUAL_GATE.maximumMismatchPct,
    mismatchPct,
    pass: mismatchPct <= STUDIO_SVG_PRODUCT_VISUAL_GATE.maximumMismatchPct,
  };
}

function decision(
  input: StudioSvgProductInput,
  values: Omit<StudioSvgProductDecision, "assetId" | "kind" | "revision" | "sourceDigest">
    & { readonly sourceDigest?: `sha256:${string}` },
): StudioSvgProductDecision {
  return {
    kind: "studio-svg-product-decision",
    revision: STUDIO_SVG_PRODUCT_ROUTE_REVISION,
    assetId: input.assetId,
    sourceDigest: values.sourceDigest ?? sourceDigest(input),
    providerId: values.providerId,
    route: values.route,
    audit: values.audit,
    visualGate: values.visualGate,
    pixels: values.pixels,
    sourcePreserved: true,
    editable: values.editable,
    interactiveGpuReadbackBytes: 0,
    fallbackFrom: values.fallbackFrom,
    reasons: Object.freeze([...values.reasons]),
    warnings: Object.freeze([...values.warnings]),
    unsupported: Object.freeze([...values.unsupported]),
  };
}

async function evaluateStudioSvgProductRoute(
  input: StudioSvgProductInput,
  engines: StudioSvgProductEngines,
): Promise<StudioSvgProductDecision> {
  const invalid = inputIssue(input);
  if (invalid) {
    return decision(input, {
      sourceDigest: `sha256:${sha256HexPortable(
        new TextEncoder().encode(input.svg.slice(0, 4_096)),
      )}`,
      providerId: "rejected",
      route: "fail-closed",
      audit: null,
      visualGate: null,
      pixels: null,
      editable: false,
      fallbackFrom: null,
      reasons: [invalid],
      warnings: [],
      unsupported: [],
      sourcePreserved: true,
      interactiveGpuReadbackBytes: 0,
    });
  }

  if (activeOrExternalSvg(input.svg)) {
    return decision(input, {
      providerId: "rejected",
      route: "fail-closed",
      audit: null,
      visualGate: null,
      pixels: null,
      editable: false,
      fallbackFrom: null,
      reasons: ["active or externally resolved SVG content is forbidden"],
      warnings: [],
      unsupported: ["security:active-or-external-content"],
      sourcePreserved: true,
      interactiveGpuReadbackBytes: 0,
    });
  }

  const reasons: string[] = [];
  let audit: StudioSvgProductAudit | null = null;
  let reference: StudioSvgProductPixels | null = null;
  try {
    audit = await engines.auditVello(input.svg);
    const [nativeBytes, resvg] = await Promise.all([
      engines.renderVelloCpu(input.svg, input.width, input.height),
      engines.renderResvg(input.svg, input.width, input.height),
    ]);
    const native = pixelsFromBytes(nativeBytes, input.width, input.height);
    if (!validPixels(resvg, input.width, input.height)) {
      throw new Error("resvg quality reference returned a mismatched surface");
    }
    reference = resvg;
    const gate = visualGate(native, resvg);
    if (gate.pass) {
      return decision(input, {
        providerId: "vello-svg-native",
        route: "strict-native-reference",
        audit,
        visualGate: gate,
        pixels: native,
        editable: false,
        fallbackFrom: null,
        reasons: ["strict audit and per-asset resvg visual gate passed"],
        warnings: [],
        unsupported: [],
        sourcePreserved: true,
        interactiveGpuReadbackBytes: 0,
      });
    }
    reasons.push(
      `vello visual gate failed: ${gate.mismatchPct.toFixed(6)}% > ${gate.maximumMismatchPct}%`,
    );
    return decision(input, {
      providerId: "resvg-wasm",
      route: "reference-raster",
      audit,
      visualGate: gate,
      pixels: resvg,
      editable: false,
      fallbackFrom: "vello-svg-native",
      reasons,
      warnings: [],
      unsupported: [],
      sourcePreserved: true,
      interactiveGpuReadbackBytes: 0,
    });
  } catch (error) {
    reasons.push(`vello-svg-native unavailable or rejected: ${asReason(error)}`);
  }

  let imported: StudioSvgProductSceneImport | null = null;
  try {
    imported = await engines.importScene(input.svg);
    if (imported.warnings.length === 0 && imported.unsupported.length === 0) {
      const rendered = await engines.renderScene(imported.scene);
      if (!validPixels(rendered, imported.scene.width, imported.scene.height)) {
        throw new Error("CanvasKit SceneIR renderer returned a mismatched surface");
      }
      return decision(input, {
        providerId: "skia-canvaskit-scene-ir",
        route: "editable-scene-ir",
        audit,
        visualGate: null,
        pixels: rendered,
        editable: true,
        fallbackFrom: "vello-svg-native",
        reasons: [...reasons, "FormatGateway preserved the full editable SceneIR subset"],
        warnings: [],
        unsupported: [],
        sourcePreserved: true,
        interactiveGpuReadbackBytes: 0,
      });
    }
    reasons.push("FormatGateway reported meaning that cannot be silently approximated");
  } catch (error) {
    reasons.push(`editable SceneIR fallback failed: ${asReason(error)}`);
  }

  if (!needsBrowserResourceSemantics(input.svg)) {
    try {
      reference ??= await engines.renderResvg(input.svg, input.width, input.height);
      if (!validPixels(reference, input.width, input.height)) {
        throw new Error("resvg fallback returned a mismatched surface");
      }
      return decision(input, {
        providerId: "resvg-wasm",
        route: "reference-raster",
        audit,
        visualGate: null,
        pixels: reference,
        editable: false,
        fallbackFrom: "vello-svg-native",
        reasons: [...reasons, "resvg preserved the bounded static SVG for preview"],
        warnings: imported?.warnings ?? [],
        unsupported: imported?.unsupported ?? [],
        sourcePreserved: true,
        interactiveGpuReadbackBytes: 0,
      });
    } catch (error) {
      reasons.push(`resvg fallback failed: ${asReason(error)}`);
    }
  } else {
    reasons.push("font-dependent SVG remains on the trusted browser renderer; no font was dropped");
  }

  if (input.trust === "bundled-catalog") {
    return decision(input, {
      providerId: "browser-native-svg",
      route: "trusted-browser-preservation",
      audit,
      visualGate: null,
      pixels: null,
      editable: false,
      fallbackFrom: "vello-svg-native",
      reasons,
      warnings: imported?.warnings ?? [],
      unsupported: imported?.unsupported ?? [],
      sourcePreserved: true,
      interactiveGpuReadbackBytes: 0,
    });
  }

  return decision(input, {
    providerId: "rejected",
    route: "fail-closed",
    audit,
    visualGate: null,
    pixels: null,
    editable: false,
    fallbackFrom: "vello-svg-native",
    reasons,
    warnings: imported?.warnings ?? [],
    unsupported: imported?.unsupported ?? [],
    sourcePreserved: true,
    interactiveGpuReadbackBytes: 0,
  });
}

export class StudioSvgProductTournament {
  private readonly cache = new Map<string, StudioSvgProductDecision>();
  private readonly inFlight = new Map<string, Promise<StudioSvgProductDecision>>();
  private readonly queue: Array<() => void> = [];
  private cachedPixelBytes = 0;
  private active = 0;

  constructor(
    private readonly engines: StudioSvgProductEngines,
    private readonly limits: Readonly<{
      maxCachedEntries: number;
      maxCachedPixelBytes: number;
      maxConcurrentResolutions: number;
    }> = STUDIO_SVG_PRODUCT_BUDGETS,
  ) {
    if (
      !Number.isInteger(limits.maxCachedEntries)
      || limits.maxCachedEntries < 1
      || !Number.isInteger(limits.maxCachedPixelBytes)
      || limits.maxCachedPixelBytes < 1
      || !Number.isInteger(limits.maxConcurrentResolutions)
      || limits.maxConcurrentResolutions < 1
    ) {
      throw new RangeError("invalid SVG product tournament limits");
    }
  }

  resolve(input: StudioSvgProductInput): Promise<StudioSvgProductDecision> {
    const key = routingCacheKey(input);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const work = this.schedule(() => evaluateStudioSvgProductRoute(input, this.engines))
      .then((result) => {
        this.store(key, result);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, work);
    return work;
  }

  metrics(): StudioSvgProductTournamentMetrics {
    return {
      cachedEntries: this.cache.size,
      cachedPixelBytes: this.cachedPixelBytes,
      inFlight: this.inFlight.size,
      active: this.active,
      queued: this.queue.length,
    };
  }

  clear(): void {
    this.cache.clear();
    this.cachedPixelBytes = 0;
  }

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1;
        void task().then(resolve, reject).finally(() => {
          this.active -= 1;
          this.queue.shift()?.();
        });
      };
      if (this.active < this.limits.maxConcurrentResolutions) start();
      else this.queue.push(start);
    });
  }

  private store(key: string, result: StudioSvgProductDecision): void {
    const pixelBytes = result.pixels?.bytes.byteLength ?? 0;
    if (pixelBytes > this.limits.maxCachedPixelBytes) return;
    this.cache.set(key, result);
    this.cachedPixelBytes += pixelBytes;
    while (
      this.cache.size > this.limits.maxCachedEntries
      || this.cachedPixelBytes > this.limits.maxCachedPixelBytes
    ) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.cachedPixelBytes -= oldest?.pixels?.bytes.byteLength ?? 0;
    }
  }
}

let canvasKitPromise: Promise<{
  render(scene: SceneIR): StudioSvgProductPixels;
}> | null = null;

interface StudioSkiaAdapterRuntime {
  renderSceneToPixels(canvasKit: unknown, scene: SceneIR): Uint8Array;
}

/**
 * The specifier must be a literal.
 *
 * This used to call a dynamic import whose specifier was a const holding the package name, marked
 * with Vite's ignore pragma, to keep the app's narrow CanvasKit types away from the adapter. The
 * cost was invisible and total: `@vite-ignore` plus a variable specifier makes Vite emit the
 * import verbatim, so the built bundle carried the bare string `@toonspectrum/studio-engine-skia`,
 * which no browser can resolve. The adapter was never in `dist` at all - zero manifest entries -
 * so `loadCanvasKitRenderer` threw on every call and the skia-canvaskit-scene-ir route degraded to
 * resvg 100% of the time. A whole rendering route was dead in production and nothing said so,
 * because the router's tests inject fake engines and the wiring test only greps source text.
 *
 * The sibling Vello lane in this same file has always used a literal specifier and bundles
 * correctly. The type separation is preserved by the `StudioSkiaAdapterRuntime` cast below, which
 * is what was actually doing that job.
 */
async function loadStudioSkiaAdapterRuntime(): Promise<StudioSkiaAdapterRuntime> {
  return import("@toonspectrum/studio-engine-skia") as Promise<StudioSkiaAdapterRuntime>;
}

async function loadCanvasKitRenderer() {
  canvasKitPromise ??= Promise.all([
    import("canvaskit-wasm"),
    import("canvaskit-wasm/bin/canvaskit.wasm?url"),
    loadStudioSkiaAdapterRuntime(),
  ]).then(async ([canvasKitModule, wasmAsset, adapter]) => {
    const canvasKit = await canvasKitModule.default({
      locateFile(file: string) {
        return file.endsWith(".wasm") ? wasmAsset.default : file;
      },
    });
    return {
      render(scene: SceneIR): StudioSvgProductPixels {
        return {
          width: scene.width,
          height: scene.height,
          bytes: adapter.renderSceneToPixels(canvasKit, scene),
        };
      },
    };
  }).catch((error: unknown) => {
    canvasKitPromise = null;
    throw error;
  });
  return canvasKitPromise;
}

let resvgProviderPromise: Promise<
  ReturnType<typeof import("./studio-resvg-svg-provider")["createStudioResvgSvgProvider"]>
> | null = null;

async function loadResvgProvider() {
  resvgProviderPromise ??= import("./studio-resvg-svg-provider")
    .then((module) => module.createStudioResvgSvgProvider())
    .catch((error: unknown) => {
      resvgProviderPromise = null;
      throw error;
    });
  return resvgProviderPromise;
}

export const STUDIO_SVG_PRODUCT_ENGINES: StudioSvgProductEngines = {
  async auditVello(svg) {
    const engine = await import("@toonspectrum/studio-engine-vello");
    await engine.loadVelloSvgNative();
    return engine.auditSvgNative(svg);
  },
  async renderVelloCpu(svg, width, height) {
    const engine = await import("@toonspectrum/studio-engine-vello");
    await engine.loadVelloSvgNative();
    return engine.renderSvgToPixelsVelloCpu(svg, width, height);
  },
  async importScene(svg) {
    const gateway = await import("../../../packages/studio-format-gateway/src/svg");
    return gateway.parseSvgToScene(svg);
  },
  async renderScene(scene) {
    return (await loadCanvasKitRenderer()).render(scene);
  },
  async renderResvg(svg, width, height) {
    const provider = await loadResvgProvider();
    const receipt = await provider.render({
      svg,
      fit: { mode: "width", value: width },
      fontPolicy: { mode: "none" },
      imagePolicy: /<\s*(?:image|feImage)\b/iu.test(svg)
        ? "embedded-raster-data"
        : "deny",
    });
    if (receipt.width !== width || receipt.height !== height) {
      throw new Error(
        `resvg fitted ${receipt.width}x${receipt.height}; expected ${width}x${height}`,
      );
    }
    return {
      width: receipt.width,
      height: receipt.height,
      bytes: receipt.rgba.bytes,
    };
  },
};

export const studioSvgProductTournament = new StudioSvgProductTournament(
  STUDIO_SVG_PRODUCT_ENGINES,
);
