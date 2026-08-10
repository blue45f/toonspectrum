import { hasWebGpu, loadVelloGpuBrowser } from "./gpu-browser";

import type { InitInput } from "../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js";

type VelloSvgModule = typeof import("../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js");

export type SvgNativeErrorCode =
  | "svg-native-invalid-xml"
  | "svg-native-unsupported"
  | "svg-native-resource-limit"
  | "svg-native-invalid-size"
  | "svg-native-parse-failed"
  | "svg-native-render-failed";

const SVG_NATIVE_ERROR_CODES: readonly SvgNativeErrorCode[] = [
  "svg-native-invalid-xml",
  "svg-native-unsupported",
  "svg-native-resource-limit",
  "svg-native-invalid-size",
  "svg-native-parse-failed",
  "svg-native-render-failed",
];

export interface SvgNativeAudit {
  elementCount: number;
  maxDepth: number;
  localReferenceCount: number;
}

export class SvgNativeRenderError extends Error {
  readonly code: SvgNativeErrorCode;
  readonly reason: string;
  readonly issues: string[];

  constructor(code: SvgNativeErrorCode, reason: string, issues: string[] = []) {
    super(`${code}: ${reason}${issues.length > 0 ? ` (${issues.join(", ")})` : ""}`);
    this.name = "SvgNativeRenderError";
    this.code = code;
    this.reason = reason;
    this.issues = issues;
  }
}

let initialized: Promise<VelloSvgModule> | null = null;

/**
 * Initializes the committed SVG-enabled pkg-gpu artifact. Supplying bytes or
 * a compiled module makes the CPU reference usable in Node tests without a
 * WebGPU adapter. This does not initialize or mutate the default CPU pkg.
 */
export function loadVelloSvgNative(moduleOrPath?: InitInput): Promise<VelloSvgModule> {
  initialized ??= import(
    "../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js"
  )
    .then(async (module) => {
      await (moduleOrPath === undefined
        ? module.default()
        : module.default({ module_or_path: moduleOrPath }));
      return module;
    })
    .catch((error: unknown) => {
      initialized = null;
      throw error instanceof Error ? error : new Error(String(error));
    });
  return initialized;
}

function requireInitialized(): Promise<VelloSvgModule> {
  if (initialized === null) {
    throw new Error(
      "vello SVG wasm not initialized — call loadVelloSvgNative() first",
    );
  }
  return initialized;
}

function parseStructuredPayload(message: string): unknown {
  try {
    return JSON.parse(message) as unknown;
  } catch {
    const start = message.indexOf("{");
    const end = message.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(message.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function mapSvgNativeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const payload = parseStructuredPayload(message);
  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    const code = SVG_NATIVE_ERROR_CODES.find((known) => known === record.code);
    if (code !== undefined && typeof record.reason === "string") {
      const issues = Array.isArray(record.issues)
        ? record.issues.filter((issue): issue is string => typeof issue === "string")
        : [];
      return new SvgNativeRenderError(code, record.reason, issues);
    }
  }
  return error instanceof Error ? error : new Error(message);
}

function assertTargetSize(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 65_535 ||
    height > 65_535
  ) {
    throw new SvgNativeRenderError(
      "svg-native-invalid-size",
      `target size must be integer 1..65535, got ${width}x${height}`,
    );
  }
}

/** Audits raw XML without rendering or allocating a GPU surface. */
export async function auditSvgNative(svg: string): Promise<SvgNativeAudit> {
  const module = await requireInitialized();
  try {
    const payload: unknown = JSON.parse(module.audit_svg_native_json(svg));
    if (
      typeof payload === "object" &&
      payload !== null &&
      Number.isInteger((payload as Record<string, unknown>).elementCount) &&
      Number.isInteger((payload as Record<string, unknown>).maxDepth) &&
      Number.isInteger((payload as Record<string, unknown>).localReferenceCount)
    ) {
      return payload as SvgNativeAudit;
    }
    throw new Error(`invalid SVG audit payload: ${JSON.stringify(payload)}`);
  } catch (error) {
    throw mapSvgNativeError(error);
  }
}

/** Deterministic sparse-strip CPU reference for the strict native subset. */
export async function renderSvgToPixelsVelloCpu(
  svg: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  assertTargetSize(width, height);
  const module = await requireInitialized();
  try {
    return module.render_svg_cpu_json(svg, width, height);
  } catch (error) {
    throw mapSvgNativeError(error);
  }
}

/**
 * Browser WebGPU render through vello_svg 0.10 -> Vello 0.9. The returned
 * pixels are a readback evidence/export surface, not an interactive hot path.
 */
export async function renderSvgToPixelsVelloGpu(
  svg: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  assertTargetSize(width, height);
  if (!hasWebGpu()) {
    throw new Error(
      "WebGPU is unavailable — the Vello-native SVG GPU lane requires navigator.gpu; " +
        "use the explicitly selected vello_cpu or SceneIR SVG provider",
    );
  }
  const module = await loadVelloGpuBrowser();
  try {
    return await module.render_svg_gpu_json(svg, width, height);
  } catch (error) {
    throw mapSvgNativeError(error);
  }
}
