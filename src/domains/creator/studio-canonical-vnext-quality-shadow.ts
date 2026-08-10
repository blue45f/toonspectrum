/**
 * Opt-in quality shadow for the canonical vNext brush provider.
 *
 * This is deliberately a narrow final-live/commit parity audit, not a brush renderer migration.
 * A runtime must be installed explicitly, name every opted-in catalogue id and expose a backend
 * pair already approved by the material quality policy. The same detached canonical plan object is
 * then submitted once as the final live frame and once as the commit frame. The result owns no
 * pixels: existing Studio Canvas/Konva remains authoritative even after two matching receipts.
 */

import {
  resolveStudioBrushBackendQualityRoute,
  type StudioBrushBackendId,
  type StudioBrushBackendQualityFamily,
} from "./studio-brush-backend-quality-policy";
import {
  adaptStudioDrawElementToCanonicalBrushPlan,
  type StudioCanonicalBrushDrawAdapterRequirement,
} from "./studio-canonical-brush-draw-adapter";
import {
  hashStudioCanonicalBrushPlan,
  type StudioCanonicalBrushPlan,
} from "./studio-canonical-brush-plan";

import type { StudioLinearColorSpace } from "./studio-color-quality-engine";
import type { DrawEl } from "./studio-element-model";

export const STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION = 1 as const;

const MAX_OPTED_IN_CATALOG_IDS = 64;
const MAX_IDENTIFIER_CHARACTERS = 160;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/u;
const VNEXT_QUALITY_SHADOW_FAMILIES = new Set<StudioBrushBackendQualityFamily>([
  "dry-media",
  "wet-media",
  "stamp-pattern",
]);
const VNEXT_QUALITY_SHADOW_BACKENDS = new Set<StudioBrushBackendId>([
  "canonical-webgpu-textured",
  "canonical-webgpu-wet-specialist",
  "professional-bristle-webgpu",
]);
const SPECIALIST_REQUIREMENTS = new Set<StudioCanonicalBrushDrawAdapterRequirement>([
  "texture-tip",
  "grain",
  "wet-media",
]);

export type StudioCanonicalVNextQualityShadowBackend =
  | "canonical-webgpu-textured"
  | "canonical-webgpu-wet-specialist"
  | "professional-bristle-webgpu";

export interface StudioCanonicalVNextQualityShadowCapability {
  readonly kind: "studio-canonical-vnext-quality-shadow-capability";
  readonly version: typeof STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION;
  readonly runtimeId: string;
  readonly runtimeVersion: number;
  readonly availability: "ready";
  readonly explicitOptIn: true;
  readonly sessionEpoch: number;
  readonly supportedFamilies: readonly StudioBrushBackendQualityFamily[];
  readonly supportedBackends: readonly StudioCanonicalVNextQualityShadowBackend[];
  /**
   * Exact catalogue identities only. A family wildcard is intentionally unsupported so installing
   * a runtime cannot silently migrate the complete 230-brush shelf.
   */
  readonly optedInCatalogIds: readonly string[];
}

export interface StudioCanonicalVNextQualityShadowProviderRequest {
  readonly kind: "studio-canonical-vnext-quality-shadow-provider/request";
  readonly version: typeof STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION;
  readonly phase: "live" | "commit";
  readonly runtimeId: string;
  readonly runtimeVersion: number;
  readonly family: StudioBrushBackendQualityFamily;
  readonly catalogId: string;
  readonly semanticContract: string;
  readonly liveBackend: StudioCanonicalVNextQualityShadowBackend;
  readonly commitBackend: StudioCanonicalVNextQualityShadowBackend;
  readonly canonicalPlan: StudioCanonicalBrushPlan;
  readonly canonicalPlanHash: string;
  readonly seed: number;
  readonly requirements: readonly StudioCanonicalBrushDrawAdapterRequirement[];
}

export interface StudioCanonicalVNextQualityShadowProviderReceipt {
  readonly kind: "studio-canonical-vnext-quality-shadow-provider/receipt";
  readonly version: typeof STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION;
  readonly phase: "live" | "commit";
  readonly runtimeId: string;
  readonly runtimeVersion: number;
  readonly providerId: string;
  readonly providerVersion: number;
  readonly catalogId: string;
  readonly semanticContract: string;
  readonly liveBackend: StudioCanonicalVNextQualityShadowBackend;
  readonly commitBackend: StudioCanonicalVNextQualityShadowBackend;
  readonly strokeId: string;
  readonly canonicalPlanHash: string;
  readonly seed: number;
  readonly providerReceiptIdentity: string;
  /** The shadow proves parity only; it cannot supply pixels to a presentation surface. */
  readonly presentationPayload: null;
  readonly authoritativeHandoff: false;
  readonly complete: true;
}

export interface StudioCanonicalVNextQualityShadowRuntime {
  readonly capability: StudioCanonicalVNextQualityShadowCapability;
  execute(
    request: StudioCanonicalVNextQualityShadowProviderRequest,
    signal: AbortSignal,
  ): Promise<unknown> | unknown;
}

export interface StudioCanonicalVNextQualityShadowSubmission {
  readonly element: DrawEl;
  readonly colorSpace?: StudioLinearColorSpace;
  readonly transform?: Readonly<{
    readonly encoding: "affine-f64-v1";
    readonly m11: number;
    readonly m12: number;
    readonly m21: number;
    readonly m22: number;
    readonly translateX: number;
    readonly translateY: number;
  }>;
  readonly firstSampleSequence?: number;
  readonly firstTimeMilliseconds?: number;
  readonly fallbackSampleIntervalMilliseconds?: number;
  readonly signal?: AbortSignal;
}

export interface StudioCanonicalVNextQualityShadowParityReceipt {
  readonly kind: "studio-canonical-vnext-quality-shadow-parity-receipt";
  readonly version: typeof STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION;
  readonly runtimeId: string;
  readonly runtimeVersion: number;
  readonly providerId: string;
  readonly providerVersion: number;
  readonly catalogId: string;
  readonly family: StudioBrushBackendQualityFamily;
  readonly semanticContract: string;
  readonly strokeId: string;
  readonly canonicalPlanHash: string;
  readonly seed: number;
  readonly sourceSampleCount: number;
  readonly sameCanonicalPlan: true;
  readonly samePersistedSeed: true;
  readonly sameProvider: true;
  readonly authority: "quality-shadow-only";
  readonly presentationPayload: null;
  readonly authoritativeHandoff: false;
  readonly uiRendererChanged: false;
  readonly live: StudioCanonicalVNextQualityShadowProviderReceipt;
  readonly commit: StudioCanonicalVNextQualityShadowProviderReceipt;
  readonly complete: true;
}

export type StudioCanonicalVNextQualityShadowSubmissionResult =
  | Readonly<{
      status: "completed";
      receipt: StudioCanonicalVNextQualityShadowParityReceipt;
    }>
  | Readonly<{
      status: "skipped";
      reason:
        | "no-runtime"
        | "brush-not-opted-in"
        | "family-ineligible"
        | "route-not-vnext"
        | "canonical-specialist-not-required";
    }>
  | Readonly<{
      status: "rejected";
      reason:
        | "invalid-runtime"
        | "invalid-submission"
        | "canonical-adapter-rejected"
        | "live-provider-rejected"
        | "commit-provider-rejected"
        | "provider-receipt-mismatch"
        | "cancelled";
      detail?: string;
    }>;

export interface StudioCanonicalVNextQualityShadowRuntimeLease {
  readonly status: "installed";
  dispose(): void;
}

let installedRuntime: StudioCanonicalVNextQualityShadowRuntime | null = null;
let nextStrokeEpoch = 1;

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function identifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_IDENTIFIER_CHARACTERS
    && SAFE_IDENTIFIER.test(value);
}

function denseUniqueIdentifiers(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value)
    || value.length < 1
    || value.length > MAX_OPTED_IN_CATALOG_IDS
  ) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!identifier(item) || seen.has(item)) return null;
    seen.add(item);
    result.push(item);
  }
  return Object.freeze(result);
}

function snapshotCapability(
  capability: StudioCanonicalVNextQualityShadowCapability,
): StudioCanonicalVNextQualityShadowCapability | null {
  if (
    typeof capability !== "object"
    || capability === null
    || capability.kind !== "studio-canonical-vnext-quality-shadow-capability"
    || capability.version !== STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION
    || !identifier(capability.runtimeId)
    || !positiveSafeInteger(capability.runtimeVersion)
    || capability.availability !== "ready"
    || capability.explicitOptIn !== true
    || !positiveSafeInteger(capability.sessionEpoch)
  ) return null;
  const families = Array.isArray(capability.supportedFamilies)
    ? capability.supportedFamilies
    : [];
  const backends = Array.isArray(capability.supportedBackends)
    ? capability.supportedBackends
    : [];
  if (
    families.length < 1
    || new Set(families).size !== families.length
    || !families.every((family) => VNEXT_QUALITY_SHADOW_FAMILIES.has(family))
    || backends.length < 1
    || new Set(backends).size !== backends.length
    || !backends.every((backend) => VNEXT_QUALITY_SHADOW_BACKENDS.has(backend))
  ) return null;
  const optedInCatalogIds = denseUniqueIdentifiers(capability.optedInCatalogIds);
  if (!optedInCatalogIds) return null;
  return Object.freeze({
    ...capability,
    supportedFamilies: Object.freeze([...families]),
    supportedBackends: Object.freeze([...backends]),
    optedInCatalogIds,
  });
}

export function installStudioCanonicalVNextQualityShadowRuntime(
  runtime: StudioCanonicalVNextQualityShadowRuntime,
): StudioCanonicalVNextQualityShadowRuntimeLease | Readonly<{
  status: "rejected";
  reason: "invalid-runtime" | "runtime-already-installed";
}> {
  const capability = snapshotCapability(runtime?.capability);
  if (!capability || typeof runtime?.execute !== "function") {
    return Object.freeze({ status: "rejected", reason: "invalid-runtime" });
  }
  if (installedRuntime !== null) {
    return Object.freeze({ status: "rejected", reason: "runtime-already-installed" });
  }
  const installed = Object.freeze({
    capability,
    execute: runtime.execute.bind(runtime),
  }) satisfies StudioCanonicalVNextQualityShadowRuntime;
  installedRuntime = installed;
  let active = true;
  return Object.freeze({
    status: "installed" as const,
    dispose(): void {
      if (!active) return;
      active = false;
      if (installedRuntime === installed) installedRuntime = null;
    },
  });
}

export function hasStudioCanonicalVNextQualityShadowRuntime(): boolean {
  return installedRuntime !== null;
}

function nextEpoch(): number {
  const current = nextStrokeEpoch;
  nextStrokeEpoch = current >= Number.MAX_SAFE_INTEGER ? 1 : current + 1;
  return current;
}

function specialistRequirements(
  requirements: readonly StudioCanonicalBrushDrawAdapterRequirement[],
): readonly StudioCanonicalBrushDrawAdapterRequirement[] {
  return Object.freeze(requirements.filter((requirement) => (
    SPECIALIST_REQUIREMENTS.has(requirement)
  )));
}

function receiptMatches(
  input: unknown,
  request: StudioCanonicalVNextQualityShadowProviderRequest,
): input is StudioCanonicalVNextQualityShadowProviderReceipt {
  if (typeof input !== "object" || input === null) return false;
  const receipt = input as Partial<StudioCanonicalVNextQualityShadowProviderReceipt>;
  return receipt.kind === "studio-canonical-vnext-quality-shadow-provider/receipt"
    && receipt.version === STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION
    && receipt.phase === request.phase
    && receipt.runtimeId === request.runtimeId
    && receipt.runtimeVersion === request.runtimeVersion
    && identifier(receipt.providerId)
    && positiveSafeInteger(receipt.providerVersion)
    && receipt.catalogId === request.catalogId
    && receipt.semanticContract === request.semanticContract
    && receipt.liveBackend === request.liveBackend
    && receipt.commitBackend === request.commitBackend
    && receipt.strokeId === request.canonicalPlan.strokeId
    && receipt.canonicalPlanHash === request.canonicalPlanHash
    && receipt.seed === request.seed
    && identifier(receipt.providerReceiptIdentity)
    && receipt.presentationPayload === null
    && receipt.authoritativeHandoff === false
    && receipt.complete === true;
}

function providerRequest(
  phase: "live" | "commit",
  runtime: StudioCanonicalVNextQualityShadowRuntime,
  route: Extract<
    ReturnType<typeof resolveStudioBrushBackendQualityRoute>,
    { readonly status: "ready" }
  >,
  canonicalPlan: StudioCanonicalBrushPlan,
  canonicalPlanHash: string,
  requirements: readonly StudioCanonicalBrushDrawAdapterRequirement[],
): StudioCanonicalVNextQualityShadowProviderRequest {
  return Object.freeze({
    kind: "studio-canonical-vnext-quality-shadow-provider/request",
    version: STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION,
    phase,
    runtimeId: runtime.capability.runtimeId,
    runtimeVersion: runtime.capability.runtimeVersion,
    family: route.identity.family,
    catalogId: route.identity.catalogId,
    semanticContract: route.semanticContract,
    liveBackend: route.liveBackend as StudioCanonicalVNextQualityShadowBackend,
    commitBackend: route.commitBackend as StudioCanonicalVNextQualityShadowBackend,
    canonicalPlan,
    canonicalPlanHash,
    seed: canonicalPlan.seed,
    requirements,
  });
}

function reject(
  reason: Extract<
    StudioCanonicalVNextQualityShadowSubmissionResult,
    { readonly status: "rejected" }
  >["reason"],
  detail?: string,
): StudioCanonicalVNextQualityShadowSubmissionResult {
  return Object.freeze({
    status: "rejected",
    reason,
    ...(detail ? { detail } : {}),
  });
}

/**
 * Runs the final live frame and the committed frame through one captured runtime and one canonical
 * plan snapshot. This function never changes current Studio pixels, returns no presentable payload
 * and grants no renderer authority. A complete result is quality telemetry only.
 */
export async function submitStudioCanonicalVNextQualityShadowFinalParity(
  input: StudioCanonicalVNextQualityShadowSubmission,
): Promise<StudioCanonicalVNextQualityShadowSubmissionResult> {
  const runtime = installedRuntime;
  if (!runtime) return Object.freeze({ status: "skipped", reason: "no-runtime" });
  if (
    typeof input !== "object"
    || input === null
    || typeof input.element !== "object"
    || input.element === null
  ) return reject("invalid-submission");
  const signal = input.signal ?? new AbortController().signal;
  if (
    typeof AbortSignal === "undefined"
    || !(signal instanceof AbortSignal)
  ) return reject("invalid-submission");
  if (signal.aborted) return reject("cancelled");

  const route = resolveStudioBrushBackendQualityRoute({
    brushId: input.element.brush,
    catalogId: input.element.brushCatalogId,
    operation: input.element.mode === "eraser" ? "erase" : "paint",
    availability: Object.fromEntries(
      runtime.capability.supportedBackends.map((backend) => [backend, "ready"]),
    ),
  });
  if (route.status !== "ready") {
    return Object.freeze({
      status: "skipped",
      reason: route.identity
        && !runtime.capability.supportedFamilies.includes(route.identity.family)
        ? "family-ineligible"
        : "route-not-vnext",
    });
  }
  if (!runtime.capability.supportedFamilies.includes(route.identity.family)) {
    return Object.freeze({ status: "skipped", reason: "family-ineligible" });
  }
  if (!runtime.capability.optedInCatalogIds.includes(route.identity.catalogId)) {
    return Object.freeze({ status: "skipped", reason: "brush-not-opted-in" });
  }
  if (
    !VNEXT_QUALITY_SHADOW_BACKENDS.has(route.liveBackend)
    || !VNEXT_QUALITY_SHADOW_BACKENDS.has(route.commitBackend)
    || !runtime.capability.supportedBackends.includes(
      route.liveBackend as StudioCanonicalVNextQualityShadowBackend,
    )
    || !runtime.capability.supportedBackends.includes(
      route.commitBackend as StudioCanonicalVNextQualityShadowBackend,
    )
  ) {
    return Object.freeze({ status: "skipped", reason: "route-not-vnext" });
  }

  const epoch = nextEpoch();
  const adapted = adaptStudioDrawElementToCanonicalBrushPlan({
    element: input.element,
    sessionEpoch: runtime.capability.sessionEpoch,
    strokeEpoch: epoch,
    commandSequence: epoch,
    firstSampleSequence: input.firstSampleSequence ?? 1,
    firstTimeMilliseconds: input.firstTimeMilliseconds ?? 0,
    fallbackSampleIntervalMilliseconds:
      input.fallbackSampleIntervalMilliseconds ?? 4,
    colorSpace: input.colorSpace ?? "linear-srgb",
    transform: input.transform ?? {
      encoding: "affine-f64-v1",
      m11: 1,
      m12: 0,
      m21: 0,
      m22: 1,
      translateX: 0,
      translateY: 0,
    },
  });
  if (adapted.status !== "ready") {
    return reject(
      "canonical-adapter-rejected",
      `${adapted.reason}:${adapted.path}`,
    );
  }
  const requirements = specialistRequirements(adapted.requirements);
  if (requirements.length === 0) {
    return Object.freeze({
      status: "skipped",
      reason: "canonical-specialist-not-required",
    });
  }
  const canonicalPlan = adapted.plan;
  const canonicalPlanHash = hashStudioCanonicalBrushPlan(canonicalPlan);
  const liveRequest = providerRequest(
    "live",
    runtime,
    route,
    canonicalPlan,
    canonicalPlanHash,
    requirements,
  );
  let liveOutput: unknown;
  try {
    liveOutput = await runtime.execute(liveRequest, signal);
  } catch (error) {
    return reject(
      signal.aborted ? "cancelled" : "live-provider-rejected",
      error instanceof Error ? error.message : undefined,
    );
  }
  if (!receiptMatches(liveOutput, liveRequest)) {
    return reject("provider-receipt-mismatch", "live");
  }
  if (signal.aborted) return reject("cancelled");

  const commitRequest = providerRequest(
    "commit",
    runtime,
    route,
    canonicalPlan,
    canonicalPlanHash,
    requirements,
  );
  let commitOutput: unknown;
  try {
    commitOutput = await runtime.execute(commitRequest, signal);
  } catch (error) {
    return reject(
      signal.aborted ? "cancelled" : "commit-provider-rejected",
      error instanceof Error ? error.message : undefined,
    );
  }
  if (!receiptMatches(commitOutput, commitRequest)) {
    return reject("provider-receipt-mismatch", "commit");
  }
  if (
    liveOutput.providerId !== commitOutput.providerId
    || liveOutput.providerVersion !== commitOutput.providerVersion
    || liveOutput.canonicalPlanHash !== commitOutput.canonicalPlanHash
    || liveOutput.seed !== commitOutput.seed
  ) {
    return reject("provider-receipt-mismatch", "live-commit-parity");
  }

  return Object.freeze({
    status: "completed",
    receipt: Object.freeze({
      kind: "studio-canonical-vnext-quality-shadow-parity-receipt",
      version: STUDIO_CANONICAL_VNEXT_QUALITY_SHADOW_BRIDGE_VERSION,
      runtimeId: runtime.capability.runtimeId,
      runtimeVersion: runtime.capability.runtimeVersion,
      providerId: liveOutput.providerId,
      providerVersion: liveOutput.providerVersion,
      catalogId: route.identity.catalogId,
      family: route.identity.family,
      semanticContract: route.semanticContract,
      strokeId: canonicalPlan.strokeId,
      canonicalPlanHash,
      seed: canonicalPlan.seed,
      sourceSampleCount: canonicalPlan.source.samples.length,
      sameCanonicalPlan: true,
      samePersistedSeed: true,
      sameProvider: true,
      authority: "quality-shadow-only",
      presentationPayload: null,
      authoritativeHandoff: false,
      uiRendererChanged: false,
      live: liveOutput,
      commit: commitOutput,
      complete: true,
    }),
  });
}
