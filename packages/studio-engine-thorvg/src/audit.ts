export const THORVG_WEB_VERSION = "1.1.2" as const;

export const THORVG_ASSET_LIMITS = Object.freeze({
  maxSvgCodeUnits: 2 * 1024 * 1024,
  maxLottieCodeUnits: 4 * 1024 * 1024,
  maxDimension: 4_096,
  maxPixelArea: 16_777_216,
  maxSvgElements: 20_000,
  maxSvgDepth: 128,
  maxJsonNodes: 250_000,
  maxJsonDepth: 96,
  maxLottieLayers: 8_192,
  maxLottieAssets: 1_024,
  maxLottieFrames: 180_000,
  maxLottieFps: 240,
});

export type ThorvgBackend = "wg" | "gl" | "sw";
export type ThorvgProviderId =
  | "thorvg-webcanvas-wg"
  | "thorvg-webcanvas-gl"
  | "thorvg-webcanvas-sw";

export interface ThorvgSvgAudit {
  readonly kind: "svg";
  readonly elementCount: number;
  readonly maxDepth: number;
  readonly localReferenceCount: number;
  readonly features: readonly string[];
  readonly requiresThorvg: boolean;
}

export interface ThorvgLottieAudit {
  readonly kind: "lottie";
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frameCount: number;
  readonly layerCount: number;
  readonly assetCount: number;
  readonly jsonNodeCount: number;
  readonly maxDepth: number;
}

export class ThorvgAssetRejectedError extends Error {
  constructor(
    readonly code:
      | "invalid-source"
      | "resource-limit"
      | "active-content"
      | "external-resource"
      | "unsupported-expression",
    readonly issues: readonly string[],
  ) {
    super(`ThorVG asset rejected (${code}): ${issues.join(", ")}`);
    this.name = "ThorvgAssetRejectedError";
  }
}

function reject(
  code: ThorvgAssetRejectedError["code"],
  ...issues: string[]
): never {
  throw new ThorvgAssetRejectedError(code, Object.freeze(issues));
}

function assertTarget(width: number, height: number): void {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
    || width > THORVG_ASSET_LIMITS.maxDimension
    || height > THORVG_ASSET_LIMITS.maxDimension
    || width * height > THORVG_ASSET_LIMITS.maxPixelArea
  ) {
    reject("resource-limit", `target:${width}x${height}`);
  }
}

function collectSvgFeatures(source: string): readonly string[] {
  const lower = source.toLowerCase();
  const features = new Set<string>();
  const tagFeatures: readonly [RegExp, string][] = [
    [/<\s*text\b/u, "text"],
    [/<\s*image\b/u, "image"],
    [/<\s*filter\b/u, "filter"],
    [/<\s*mask\b/u, "mask"],
    [/<\s*pattern\b/u, "pattern"],
    [/<\s*use\b/u, "use"],
    [/<\s*marker\b/u, "marker"],
    [/<\s*symbol\b/u, "symbol"],
    [/<\s*style\b/u, "stylesheet"],
  ];
  for (const [pattern, feature] of tagFeatures) {
    if (pattern.test(lower)) features.add(feature);
  }
  if (/\b(?:filter|mask|marker-(?:start|mid|end))\s*=/u.test(lower)) {
    features.add("effect-reference");
  }
  if (/\bvector-effect\s*=/u.test(lower)) features.add("vector-effect");
  if (/\bstroke-dasharray\s*=/u.test(lower)) features.add("dash");
  return Object.freeze([...features].sort());
}

/**
 * Security and resource audit performed before ThorVG is initialized. It intentionally forbids
 * every active or externally resolved surface; the provider receives one self-contained string.
 */
export function auditThorvgSvg(
  source: string,
  width: number,
  height: number,
): ThorvgSvgAudit {
  assertTarget(width, height);
  if (!source.trim()) reject("invalid-source", "empty-svg");
  if (source.length > THORVG_ASSET_LIMITS.maxSvgCodeUnits) {
    reject("resource-limit", `svg-code-units:${source.length}`);
  }
  const lower = source.toLowerCase();
  if (!/<\s*svg\b/u.test(lower)) reject("invalid-source", "missing-svg-root");
  if (/<!doctype\b|<!entity\b/u.test(lower)) {
    reject("active-content", "doctype-or-entity");
  }
  if (/<\s*(?:script|foreignobject|iframe|object|embed|audio|video)\b/u.test(lower)) {
    reject("active-content", "active-element");
  }
  if (/\bon[a-z0-9_-]+\s*=/iu.test(source) || /(?:java|vb)script\s*:/iu.test(source)) {
    reject("active-content", "event-or-script-url");
  }
  if (/\b(?:href|xlink:href)\s*=\s*["'](?!#)[^"']+/iu.test(source)) {
    reject("external-resource", "non-local-href");
  }
  if (/url\(\s*["']?(?!#)[^)]+\)/iu.test(source) || /@import\b/iu.test(source)) {
    reject("external-resource", "non-local-css-url");
  }

  const tokens = source.match(/<\/?[A-Za-z][^<>]*?>/gu) ?? [];
  let elementCount = 0;
  let depth = 0;
  let maxDepth = 0;
  let localReferenceCount = 0;
  for (const token of tokens) {
    const closing = /^<\//u.test(token);
    const selfClosing = /\/\s*>$/u.test(token);
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    elementCount += 1;
    if (elementCount > THORVG_ASSET_LIMITS.maxSvgElements) {
      reject("resource-limit", `svg-elements:${elementCount}`);
    }
    if (!selfClosing) {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      if (maxDepth > THORVG_ASSET_LIMITS.maxSvgDepth) {
        reject("resource-limit", `svg-depth:${maxDepth}`);
      }
    }
    localReferenceCount += (token.match(/url\(\s*["']?#/giu) ?? []).length;
    localReferenceCount += (token.match(/\b(?:href|xlink:href)\s*=\s*["']#/giu) ?? []).length;
  }
  if (elementCount === 0 || depth !== 0) reject("invalid-source", "unbalanced-svg");

  const features = collectSvgFeatures(source);
  return Object.freeze({
    kind: "svg" as const,
    elementCount,
    maxDepth,
    localReferenceCount,
    features,
    requiresThorvg: features.some((feature) =>
      feature !== "dash" && feature !== "vector-effect"
    ),
  });
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Bounded JSON audit for a self-contained, expression-free Lottie document. */
export function auditThorvgLottie(source: string): ThorvgLottieAudit {
  if (!source.trim()) reject("invalid-source", "empty-lottie");
  if (source.length > THORVG_ASSET_LIMITS.maxLottieCodeUnits) {
    reject("resource-limit", `lottie-code-units:${source.length}`);
  }
  let root: unknown;
  try {
    root = JSON.parse(source) as unknown;
  } catch {
    reject("invalid-source", "invalid-json");
  }
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    reject("invalid-source", "lottie-root-not-object");
  }
  const document = root as Record<string, unknown>;
  const width = finiteNumber(document.w, 0);
  const height = finiteNumber(document.h, 0);
  assertTarget(width, height);
  const fps = finiteNumber(document.fr, 0);
  const firstFrame = finiteNumber(document.ip, 0);
  const lastFrame = finiteNumber(document.op, 0);
  const frameCount = Math.max(0, Math.ceil(lastFrame - firstFrame));
  if (fps <= 0 || fps > THORVG_ASSET_LIMITS.maxLottieFps) {
    reject("resource-limit", `lottie-fps:${fps}`);
  }
  if (frameCount <= 0 || frameCount > THORVG_ASSET_LIMITS.maxLottieFrames) {
    reject("resource-limit", `lottie-frames:${frameCount}`);
  }

  const layers = Array.isArray(document.layers) ? document.layers : [];
  const assets = Array.isArray(document.assets) ? document.assets : [];
  if (layers.length > THORVG_ASSET_LIMITS.maxLottieLayers) {
    reject("resource-limit", `lottie-layers:${layers.length}`);
  }
  if (assets.length > THORVG_ASSET_LIMITS.maxLottieAssets) {
    reject("resource-limit", `lottie-assets:${assets.length}`);
  }
  for (const asset of assets) {
    if (typeof asset !== "object" || asset === null) continue;
    const record = asset as Record<string, unknown>;
    if (typeof record.p === "string" || typeof record.u === "string") {
      reject("external-resource", "lottie-image-asset");
    }
  }

  let jsonNodeCount = 0;
  let maxDepth = 0;
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value: root, depth: 1 },
  ];
  while (stack.length > 0) {
    const entry = stack.pop()!;
    jsonNodeCount += 1;
    maxDepth = Math.max(maxDepth, entry.depth);
    if (jsonNodeCount > THORVG_ASSET_LIMITS.maxJsonNodes) {
      reject("resource-limit", `lottie-json-nodes:${jsonNodeCount}`);
    }
    if (entry.depth > THORVG_ASSET_LIMITS.maxJsonDepth) {
      reject("resource-limit", `lottie-json-depth:${entry.depth}`);
    }
    if (Array.isArray(entry.value)) {
      for (const child of entry.value) stack.push({ value: child, depth: entry.depth + 1 });
    } else if (typeof entry.value === "object" && entry.value !== null) {
      for (const [key, child] of Object.entries(entry.value)) {
        if (key === "x" && (typeof child === "string" || child === true)) {
          reject("unsupported-expression", "lottie-expression");
        }
        stack.push({ value: child, depth: entry.depth + 1 });
      }
    }
  }

  return Object.freeze({
    kind: "lottie" as const,
    width,
    height,
    fps,
    frameCount,
    layerCount: layers.length,
    assetCount: assets.length,
    jsonNodeCount,
    maxDepth,
  });
}

export function thorvgProviderId(backend: ThorvgBackend): ThorvgProviderId {
  return `thorvg-webcanvas-${backend}` as ThorvgProviderId;
}

/** Capability planning only; the selected backend never changes after acquisition. */
export function selectThorvgBackend(capability: {
  readonly webgpu: boolean;
  readonly webgl2?: boolean;
}): ThorvgBackend {
  if (capability.webgpu) return "wg";
  if (capability.webgl2 !== false) return "gl";
  return "sw";
}
