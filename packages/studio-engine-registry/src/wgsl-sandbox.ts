import type { ComposedWgslVariant } from "./wgsl-variants";

/**
 * Numeric subset of `GPUSupportedLimits` used by the shader admission gate.
 * Callers must pass values from the device that will execute the pipeline; the
 * registry deliberately does not invent a "typical GPU" fallback.
 */
export interface WgslSandboxDeviceLimits {
  readonly maxBufferSize: number;
  readonly maxStorageBufferBindingSize: number;
  readonly maxComputeWorkgroupSizeX: number;
  readonly maxComputeInvocationsPerWorkgroup: number;
  readonly maxComputeWorkgroupsPerDimension: number;
  readonly maxBindingsPerBindGroup: number;
  readonly maxStorageBuffersPerShaderStage: number;
}

export interface WgslVariantAdmissionRequest {
  readonly width: number;
  readonly height: number;
  readonly mode: "preview" | "final";
  /** Maximum transient src+dst+uniform+LUT working set for this execution. */
  readonly workingSetBudgetBytes: number;
  /** Number of compiled variants already resident in the device cache. */
  readonly residentVariantCount: number;
  /** Device/profile-specific cap; prevents unbounded pipeline specialization. */
  readonly maxResidentVariantCount: number;
  readonly limits: WgslSandboxDeviceLimits;
}

export type WgslVariantAdmissionIssueCode =
  | "request-invalid"
  | "device-limit-invalid"
  | "pixel-count-overflow"
  | "buffer-limit-exceeded"
  | "working-set-budget-exceeded"
  | "workgroup-limit-exceeded"
  | "dispatch-limit-exceeded"
  | "binding-limit-exceeded"
  | "variant-budget-exceeded"
  | "variant-contract-mismatch"
  | "bind-group-policy-violation"
  | "control-flow-policy-violation"
  | "storage-write-policy-violation"
  | "bounds-guard-missing"
  | "license-policy-violation";

export interface WgslVariantAdmissionIssue {
  readonly code: WgslVariantAdmissionIssueCode;
  readonly message: string;
}

export interface WgslVariantDispatchPlan {
  readonly pixelCount: number;
  readonly srcBufferBytes: number;
  readonly dstBufferBytes: number;
  readonly fixedBytes: number;
  readonly workingSetBytes: number;
  readonly workgroupsX: number;
  readonly workgroupsY: number;
  readonly bindingCount: number;
  readonly storageBufferCount: number;
}

export interface WgslVariantAdmissionResult {
  readonly admitted: boolean;
  readonly issues: readonly WgslVariantAdmissionIssue[];
  readonly plan: WgslVariantDispatchPlan | null;
}

export class WgslVariantAdmissionError extends Error {
  constructor(readonly issues: readonly WgslVariantAdmissionIssue[]) {
    super(`WGSL variant rejected: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "WgslVariantAdmissionError";
  }
}

const MAX_SHADER_PIXEL_COUNT = 0xffff_ffff;
const ALLOWED_LICENSES = new Set(["LicenseRef-ToonSpectrum-Proprietary"]);

function issue(
  code: WgslVariantAdmissionIssueCode,
  message: string,
): WgslVariantAdmissionIssue {
  return Object.freeze({ code, message });
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function stripWgslComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/\/\/[^\n\r]*/gu, " ");
}

function inspectShaderSource(
  variant: ComposedWgslVariant,
): WgslVariantAdmissionIssue[] {
  const issues: WgslVariantAdmissionIssue[] = [];
  const source = stripWgslComments(variant.wgsl);
  const declaredBindings = [...source.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)/gu)]
    .map((match) => `${match[1]}:${match[2]}`);
  const expectedBindings = variant.usesLut
    ? ["0:0", "0:1", "0:2", "0:3"]
    : ["0:0", "0:1", "0:2"];
  if (
    declaredBindings.length !== expectedBindings.length
    || declaredBindings.some((binding, index) => binding !== expectedBindings[index])
  ) {
    issues.push(issue(
      "bind-group-policy-violation",
      `bind groups ${declaredBindings.join(",") || "none"} do not match ${expectedBindings.join(",")}`,
    ));
  }

  const forbiddenControlFlow = source.match(
    /\b(?:loop|for|while|atomic\w*|texture\w*|workgroupBarrier|storageBarrier|discard)\b/gu,
  );
  if (forbiddenControlFlow) {
    issues.push(issue(
      "control-flow-policy-violation",
      `forbidden WGSL tokens: ${[...new Set(forbiddenControlFlow)].sort().join(", ")}`,
    ));
  }

  const writes = source.match(/\bdst\s*\[[^\]]+\]\s*=/gu) ?? [];
  if (writes.length !== 1) {
    issues.push(issue(
      "storage-write-policy-violation",
      `expected exactly one bounded dst write statement, found ${writes.length}`,
    ));
  }
  if (!/if\s*\(i\s*>=\s*params\.pixel_count\)\s*\{\s*return;\s*\}/u.test(source)) {
    issues.push(issue(
      "bounds-guard-missing",
      "global index must return before reading or writing when i >= params.pixel_count",
    ));
  }
  return issues;
}

/**
 * Checks a generated shader against its manifest, exact device limits and a
 * caller-supplied working-set/pipeline budget. A rejection is data, not a
 * crash: the planner can quarantine this provider and select its CPU/reference
 * fallback without losing the document.
 */
export function evaluateWgslVariantAdmission(
  variant: ComposedWgslVariant,
  request: WgslVariantAdmissionRequest,
): WgslVariantAdmissionResult {
  const issues = inspectShaderSource(variant);
  const { manifest } = variant;

  if (
    !isPositiveSafeInteger(request.width)
    || !isPositiveSafeInteger(request.height)
    || !isPositiveSafeInteger(request.workingSetBudgetBytes)
    || !Number.isSafeInteger(request.residentVariantCount)
    || request.residentVariantCount < 0
    || !isPositiveSafeInteger(request.maxResidentVariantCount)
  ) {
    issues.push(issue("request-invalid", "dimensions and budgets must be positive safe integers"));
  }

  const limitEntries = Object.entries(request.limits);
  if (limitEntries.some(([, value]) => !isPositiveSafeInteger(value))) {
    issues.push(issue("device-limit-invalid", "all GPU limits must be measured positive safe integers"));
  }

  if (
    manifest.inputFormats[0] !== "rgba8-packed-u32-storage"
    || manifest.outputFormats[0] !== "rgba8-packed-u32-storage"
    || manifest.workgroupSize.x !== 64
    || manifest.workgroupSize.y !== 1
    || manifest.workgroupSize.z !== 1
    || manifest.storageWrites.policy !== "single-bounded-write-per-invocation"
    || manifest.storageWrites.guard !== "global-index < pixel-count"
    || manifest.bounds.haloPx !== 0
    || manifest.determinism.class !== "deterministic"
    || manifest.determinism.timeIndependent !== true
    || manifest.timeDependency !== "none"
    || manifest.variants.pixelEquivalent !== true
    || manifest.variants[request.mode] !== variant.variantKey
  ) {
    issues.push(issue(
      "variant-contract-mismatch",
      "shader manifest does not match the deterministic full-frame variant contract",
    ));
  }
  if (!ALLOWED_LICENSES.has(manifest.licenseProvenance.spdx)) {
    issues.push(issue(
      "license-policy-violation",
      `shader license ${manifest.licenseProvenance.spdx} is not approved for this bundle`,
    ));
  }

  const pixelCount = request.width * request.height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_SHADER_PIXEL_COUNT) {
    issues.push(issue(
      "pixel-count-overflow",
      `pixel count ${String(pixelCount)} exceeds the shader u32 guard`,
    ));
  }

  let plan: WgslVariantDispatchPlan | null = null;
  if (isPositiveSafeInteger(pixelCount)) {
    const srcBufferBytes = pixelCount * Uint32Array.BYTES_PER_ELEMENT;
    const dstBufferBytes = srcBufferBytes;
    const fixedBytes = manifest.memoryEstimate.fixedBytes;
    const workingSetBytes = fixedBytes + pixelCount * manifest.memoryEstimate.bytesPerPixel;
    const rowThreads = manifest.workgroupSize.dispatchRowThreads;
    const workgroupsX = Math.ceil(Math.min(pixelCount, rowThreads) / manifest.workgroupSize.x);
    const workgroupsY = Math.ceil(pixelCount / rowThreads);
    const bindingCount = manifest.bindGroups.lutBindingPresent ? 4 : 3;
    const storageBufferCount = manifest.bindGroups.lutBindingPresent ? 3 : 2;
    plan = Object.freeze({
      pixelCount,
      srcBufferBytes,
      dstBufferBytes,
      fixedBytes,
      workingSetBytes,
      workgroupsX,
      workgroupsY,
      bindingCount,
      storageBufferCount,
    });

    if (
      srcBufferBytes > request.limits.maxBufferSize
      || dstBufferBytes > request.limits.maxBufferSize
      || srcBufferBytes > request.limits.maxStorageBufferBindingSize
      || dstBufferBytes > request.limits.maxStorageBufferBindingSize
    ) {
      issues.push(issue(
        "buffer-limit-exceeded",
        `${srcBufferBytes}B pixel buffers exceed the measured device buffer limits`,
      ));
    }
    if (workingSetBytes > request.workingSetBudgetBytes) {
      issues.push(issue(
        "working-set-budget-exceeded",
        `${workingSetBytes}B working set exceeds ${request.workingSetBudgetBytes}B budget`,
      ));
    }
    if (
      manifest.workgroupSize.x > request.limits.maxComputeWorkgroupSizeX
      || manifest.workgroupSize.x > request.limits.maxComputeInvocationsPerWorkgroup
    ) {
      issues.push(issue(
        "workgroup-limit-exceeded",
        `workgroup size ${manifest.workgroupSize.x} exceeds measured device limits`,
      ));
    }
    if (
      workgroupsX > request.limits.maxComputeWorkgroupsPerDimension
      || workgroupsY > request.limits.maxComputeWorkgroupsPerDimension
    ) {
      issues.push(issue(
        "dispatch-limit-exceeded",
        `dispatch ${workgroupsX}x${workgroupsY} exceeds measured per-dimension limit`,
      ));
    }
    if (
      bindingCount > request.limits.maxBindingsPerBindGroup
      || storageBufferCount > request.limits.maxStorageBuffersPerShaderStage
    ) {
      issues.push(issue(
        "binding-limit-exceeded",
        `${bindingCount} bindings/${storageBufferCount} storage buffers exceed measured limits`,
      ));
    }
  }

  if (request.residentVariantCount >= request.maxResidentVariantCount) {
    issues.push(issue(
      "variant-budget-exceeded",
      `resident variant count ${request.residentVariantCount} reached cap ${request.maxResidentVariantCount}`,
    ));
  }

  return Object.freeze({
    admitted: issues.length === 0,
    issues: Object.freeze(issues),
    plan,
  });
}

export function assertWgslVariantAdmitted(
  variant: ComposedWgslVariant,
  request: WgslVariantAdmissionRequest,
): WgslVariantDispatchPlan {
  const result = evaluateWgslVariantAdmission(variant, request);
  if (!result.admitted || result.plan === null) {
    throw new WgslVariantAdmissionError(result.issues);
  }
  return result.plan;
}
