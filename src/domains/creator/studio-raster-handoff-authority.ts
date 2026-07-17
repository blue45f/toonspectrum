import type {
  StudioRasterOverlaySourceElement,
  StudioRasterOverlaySourceOperation,
} from "./studio-crdt-raster-ui-bridge";
import type { StudioWebGpuCommittedPlanGates } from "./studio-webgpu-committed-plan";
import type { StudioWebGpuViewportSurfacePlan } from "./studio-webgpu-viewport";

import { canonicalStudioRasterJson } from "@/lib/studio-crdt-raster-ops";

export interface StudioRasterHandoffCandidate {
  /** Exact presentation generation. A stale frame can never reuse this identity. */
  readonly authorityKey: string;
  /** Exact scene, gate and viewport identity supplied by the owning Studio render. */
  readonly baseKey: string;
  readonly generation: number;
  readonly operationIds: readonly string[];
}

export interface StudioRasterHandoffBaseKeyInput {
  readonly pageId: string;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly elements: readonly StudioRasterOverlaySourceElement[];
  readonly gates?: StudioWebGpuCommittedPlanGates;
  readonly viewport: StudioWebGpuViewportSurfacePlan | null;
}

const AUTHORITY_ELEMENT_KEYS = [
  "id",
  "type",
  "hidden",
  "kind",
  "mode",
  "points",
  "pressures",
  "stroke",
  "strokeWidth",
  "pressureModel",
  "opacity",
  "brush",
  "blendMode",
  "symmetry",
  "panelClip",
  "clipBelow",
  "maskSrc",
  "maskEnabled",
  "alphaLocked",
  "fill",
  "gradient",
  "pattern",
  "brushDynamics",
  "brushTip",
  "sampleSpacing",
  "groupId",
] as const;

function authorityElementSnapshot(
  element: StudioRasterOverlaySourceElement
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const key of AUTHORITY_ELEMENT_KEYS) {
    const value = element[key];
    if (value !== undefined) snapshot[key] = value;
  }
  return snapshot;
}

/**
 * Builds a collision-free canonical identity rather than a short non-cryptographic hash. The key
 * is intentionally exact: scene semantics, handoff gates and the viewport must all still match
 * before the redundant Konva vector can be hidden.
 */
export function createStudioRasterHandoffBaseKey(
  input: StudioRasterHandoffBaseKeyInput
): string {
  return canonicalStudioRasterJson({
    version: 1,
    pageId: input.pageId,
    documentWidth: input.documentWidth,
    documentHeight: input.documentHeight,
    elements: input.elements.map(authorityElementSnapshot),
    gates: {
      exportActive: input.gates?.exportActive === true,
      masterEditActive: input.gates?.masterEditActive === true,
      editActive: input.gates?.editActive === true,
      specialDraftActive: input.gates?.specialDraftActive === true,
      postProcessingActive: input.gates?.postProcessingActive === true,
    },
    viewport: input.viewport
      ? {
          surface: input.viewport.surface,
          transform: input.viewport.transform,
        }
      : null,
  });
}

export function createStudioRasterHandoffAuthorityKey(input: {
  readonly baseKey: string;
  readonly generation: number;
  readonly sourceOperations: readonly StudioRasterOverlaySourceOperation[];
}): string {
  return canonicalStudioRasterJson({
    version: 1,
    baseKey: input.baseKey,
    generation: input.generation,
    sourceOperations: input.sourceOperations.map((operation) => ({
      operationId: operation.operationId,
      semanticParameters: operation.semanticParameters,
    })),
  });
}

export function isStudioRasterHandoffCandidateAuthorized(input: {
  readonly candidate: StudioRasterHandoffCandidate | null;
  readonly currentBaseKey: string;
  readonly blocked: boolean;
}): boolean {
  const candidate = input.candidate;
  if (
    input.blocked || !candidate || candidate.baseKey !== input.currentBaseKey ||
    candidate.authorityKey.length === 0 || !Number.isSafeInteger(candidate.generation) ||
    candidate.generation < 1 || candidate.operationIds.length === 0
  ) {
    return false;
  }
  const unique = new Set(candidate.operationIds);
  return unique.size === candidate.operationIds.length &&
    candidate.operationIds.every((operationId) => operationId.length > 0);
}

export function studioRasterAuthorizedOperationIds(input: {
  readonly candidate: StudioRasterHandoffCandidate | null;
  readonly currentBaseKey: string;
  readonly blocked: boolean;
}): ReadonlySet<string> {
  return isStudioRasterHandoffCandidateAuthorized(input)
    ? new Set(input.candidate!.operationIds)
    : new Set();
}

/**
 * Stage-only consumers cannot see pixels currently delegated to the DOM raster presenter. Revoke
 * that delegation, force Konva to paint the restored vector fallbacks, and only then perform the
 * synchronous readback. Keeping the ordering in one helper prevents capture paths from repeating
 * the animation-frame flattening bug independently.
 */
export function readStudioAuthoritativeStageFrame<T>(input: {
  readonly revokeRasterHandoff: () => void;
  readonly drawStage: () => void;
  readonly read: () => T;
}): T {
  input.revokeRasterHandoff();
  input.drawStage();
  return input.read();
}
