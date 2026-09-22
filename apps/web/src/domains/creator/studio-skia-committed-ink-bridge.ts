import type {
  StudioCommittedInkSurfaceHandoff,
  StudioCommittedInkVisibleDrawRequest,
} from "./studio-committed-ink-handoff-coordinator";
import type { StudioRenderSurfaceAuthority } from "./render/StudioRenderSurface";

export interface StudioSkiaDocumentPresentationCandidate {
  readonly sceneRevision: object;
  readonly ownedDocumentIds: readonly string[];
}

export interface StudioSkiaCommittedInkSceneRevision {
  readonly pageId: string;
  readonly projectGeneration: number;
}

export interface StudioSkiaCommittedInkAuthority {
  readonly status: StudioRenderSurfaceAuthority["status"];
  readonly sceneRevision: object | null;
  readonly revision: StudioSkiaCommittedInkSceneRevision | null;
  readonly ownedDocumentIds: ReadonlySet<string>;
  readonly visibleCanvasCount: 0 | 1;
}

export interface StudioSkiaCommittedInkVisibleReceipt {
  readonly sceneRevision: object;
  readonly revision: StudioSkiaCommittedInkSceneRevision;
  readonly ownedDocumentIds: ReadonlySet<string>;
}

export type StudioSkiaCommittedInkDrawDecision =
  | { readonly status: "receipted" }
  | { readonly status: "wait"; readonly nextDeferAttempt: number }
  | { readonly status: "hold" }
  | { readonly status: "fallback" };

const DEFAULT_MAX_DEFER_ATTEMPTS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readStudioSkiaCommittedInkSceneRevision(
  sceneRevision: object | null,
): StudioSkiaCommittedInkSceneRevision | null {
  if (!isRecord(sceneRevision)) return null;
  const pageId = sceneRevision.pageId;
  const projectGeneration = sceneRevision.projectGeneration;
  if (
    typeof pageId !== "string"
    || pageId.length === 0
    || typeof projectGeneration !== "number"
    || !Number.isSafeInteger(projectGeneration)
    || projectGeneration < 0
  ) return null;
  return { pageId, projectGeneration };
}

export function projectStudioSkiaCommittedInkAuthority(
  authority: StudioRenderSurfaceAuthority,
): StudioSkiaCommittedInkAuthority {
  return {
    status: authority.status,
    sceneRevision: authority.sceneRevision,
    revision: readStudioSkiaCommittedInkSceneRevision(authority.sceneRevision),
    ownedDocumentIds: new Set(authority.ownedDocumentIds),
    visibleCanvasCount: authority.visibleCanvasCount,
  };
}

export function projectStudioSkiaCommittedInkVisibleReceipt(
  presentation: StudioSkiaDocumentPresentationCandidate,
): StudioSkiaCommittedInkVisibleReceipt | null {
  const revision = readStudioSkiaCommittedInkSceneRevision(
    presentation.sceneRevision,
  );
  if (!revision) return null;
  return {
    sceneRevision: presentation.sceneRevision,
    revision,
    ownedDocumentIds: new Set(presentation.ownedDocumentIds),
  };
}

function ownsEveryStroke(
  ownedDocumentIds: ReadonlySet<string>,
  strokeIds: readonly string[],
): boolean {
  return strokeIds.length > 0
    && strokeIds.every((strokeId) => ownedDocumentIds.has(strokeId));
}

function matchesRequestRevision(
  revision: StudioSkiaCommittedInkSceneRevision | null,
  request: StudioCommittedInkVisibleDrawRequest,
): boolean {
  return revision?.pageId === request.pageId
    && revision.projectGeneration === request.revision;
}

export function decideStudioSkiaCommittedInkDraw(
  input: {
    readonly request: StudioCommittedInkVisibleDrawRequest;
    readonly authority: StudioSkiaCommittedInkAuthority | null;
    readonly visibleReceipt: StudioSkiaCommittedInkVisibleReceipt | null;
    readonly deferAttempt: number;
    readonly maxDeferAttempts?: number;
  },
): StudioSkiaCommittedInkDrawDecision {
  const {
    request,
    authority,
    visibleReceipt,
  } = input;
  const deferAttempt = Number.isFinite(input.deferAttempt)
    ? Math.max(0, Math.floor(input.deferAttempt))
    : 0;
  const maxDeferAttempts = Number.isFinite(input.maxDeferAttempts)
    ? Math.max(0, Math.floor(input.maxDeferAttempts ?? 0))
    : DEFAULT_MAX_DEFER_ATTEMPTS;

  if (
    matchesRequestRevision(visibleReceipt?.revision ?? null, request)
    && ownsEveryStroke(visibleReceipt!.ownedDocumentIds, request.strokeIds)
  ) {
    return { status: "receipted" };
  }

  const authorityMatches = matchesRequestRevision(
    authority?.revision ?? null,
    request,
  );
  if (authorityMatches) {
    // `active` ownership has already unmounted the Konva document paint tree. Until the exact
    // GPU canvas is visibly receipted, retained live ink is the only safe fail-visible surface.
    if (authority?.status === "active") return { status: "hold" };
    if (authority?.status === "starting") {
      if (deferAttempt < maxDeferAttempts) {
        return { status: "wait", nextDeferAttempt: deferAttempt + 1 };
      }
      return { status: "fallback" };
    }
    return { status: "fallback" };
  }

  // Child layout effects publish the first `starting` authority after the parent handoff effect.
  // Give that publication one frame; an unsupported page then falls back without hiding ink.
  if (deferAttempt === 0 && maxDeferAttempts > 0) {
    return { status: "wait", nextDeferAttempt: 1 };
  }
  return { status: "fallback" };
}

export function canStudioSkiaPublishOverSettledInk(
  candidate: StudioSkiaDocumentPresentationCandidate,
  queue: readonly StudioCommittedInkSurfaceHandoff[],
): boolean {
  const revision = readStudioSkiaCommittedInkSceneRevision(
    candidate.sceneRevision,
  );
  const head = queue[0];
  if (!revision || !head) return false;
  if (
    head.pageId !== revision.pageId
    || head.queuedRevision !== revision.projectGeneration
  ) return false;
  const reservedSurfaceCount = head.overlaySettledCount
    + head.draftSettledCount
    + head.gpuSettledCount;
  return reservedSurfaceCount > 0
    && ownsEveryStroke(new Set(candidate.ownedDocumentIds), head.strokeIds);
}
