import {
  upsertStudioIdentityLink,
  validateStudioIdentityIndex,
  type StudioIdentityIndexV1,
} from "../studio-foundation/studio-semantic-identity";

export type StudioBindingSyncState =
  | "synced"
  | "story-changed"
  | "visual-changed"
  | "both-changed"
  | "detached"
  | "orphaned";

export interface StudioPanelBindingV1 {
  readonly version: 1;
  readonly semanticPanelId: string;
  readonly writerPanelId: string;
  readonly comicPageId: string | null;
  readonly comicPanelId: string | null;
  readonly drawPageId: string | null;
  readonly frameElementId: string | null;
  readonly baselineStoryDigest: string;
  readonly baselineVisualDigest: string | null;
  readonly createdAt: string;
}

export interface StudioDialogueBindingV1 {
  readonly version: 1;
  readonly semanticDialogueId: string;
  readonly writerDialogueId: string;
  readonly comicBalloonId: string | null;
  readonly textElementId: string | null;
  readonly baselineContentDigest: string;
  readonly baselineVisualDigest: string | null;
  readonly manualLineBreaks: boolean;
  readonly textFitMode: "auto" | "fixed" | "manual";
}

export interface StudioPanelMaterializationPlan {
  readonly semanticPanelId: string;
  readonly transactionLabel: string;
  readonly commands: readonly {
    readonly domain: "comic-graph" | "page-state" | "identity-index" | "workflow" | "thumbnail";
    readonly type: string;
    readonly payload: Readonly<Record<string, string>>;
  }[];
}

export interface StudioBindingImpact {
  readonly semanticPanelId: string;
  readonly affectedDialogueIds: readonly string[];
  readonly affectedElementIds: readonly string[];
  readonly affectedCommentThreadIds: readonly string[];
  readonly affectedMotionClipIds: readonly string[];
  readonly recommendedAction: "archive" | "detach" | "cascade-delete";
  readonly requiresConfirmation: boolean;
}

export type StudioBindingIssueCode =
  | "invalid-binding-id"
  | "partial-comic-binding"
  | "partial-draw-binding"
  | "missing-writer-reference"
  | "identity-index-invalid";

export interface StudioBindingIssue {
  readonly code: StudioBindingIssueCode;
  readonly semanticId: string;
  readonly message: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function resolveStudioPanelBindingSyncState(input: {
  readonly binding: StudioPanelBindingV1;
  readonly currentStoryDigest: string | null;
  readonly currentVisualDigest: string | null;
  readonly writerPanelExists: boolean;
  readonly visualPanelExists: boolean;
}): StudioBindingSyncState {
  if (!input.writerPanelExists && !input.visualPanelExists) return "orphaned";
  if (!input.writerPanelExists || !input.visualPanelExists) return "detached";
  const storyChanged = input.currentStoryDigest !== input.binding.baselineStoryDigest;
  const visualChanged = input.currentVisualDigest !== input.binding.baselineVisualDigest;
  if (storyChanged && visualChanged) return "both-changed";
  if (storyChanged) return "story-changed";
  if (visualChanged) return "visual-changed";
  return "synced";
}

export function resolveStudioDialogueBindingSyncState(input: {
  readonly binding: StudioDialogueBindingV1;
  readonly currentContentDigest: string | null;
  readonly currentVisualDigest: string | null;
  readonly writerDialogueExists: boolean;
  readonly visualTextExists: boolean;
}): StudioBindingSyncState {
  if (!input.writerDialogueExists && !input.visualTextExists) return "orphaned";
  if (!input.writerDialogueExists || !input.visualTextExists) return "detached";
  const storyChanged = input.currentContentDigest !== input.binding.baselineContentDigest;
  const visualChanged = input.currentVisualDigest !== input.binding.baselineVisualDigest;
  if (storyChanged && visualChanged) return "both-changed";
  if (storyChanged) return "story-changed";
  if (visualChanged) return "visual-changed";
  return "synced";
}

export function createStudioPanelMaterializationPlan(input: {
  readonly semanticPanelId: string;
  readonly writerPanelId: string;
  readonly comicPageId: string;
  readonly comicPanelId: string;
  readonly drawPageId: string;
  readonly frameElementId: string;
}): StudioPanelMaterializationPlan {
  const ids = Object.values(input);
  if (ids.some((id) => !SAFE_ID.test(id))) {
    throw new Error("Panel materialization requires valid, already allocated IDs.");
  }
  return {
    semanticPanelId: input.semanticPanelId,
    transactionLabel: "Writer Panel을 Board·Draw 패널로 만들기",
    commands: [
      {
        domain: "comic-graph",
        type: "comic/add-panel",
        payload: {
          pageId: input.comicPageId,
          panelId: input.comicPanelId,
          semanticPanelId: input.semanticPanelId,
        },
      },
      {
        domain: "page-state",
        type: "page-state/add-frame-folder",
        payload: {
          pageId: input.drawPageId,
          frameElementId: input.frameElementId,
          semanticPanelId: input.semanticPanelId,
        },
      },
      {
        domain: "identity-index",
        type: "identity/link-panel",
        payload: {
          semanticPanelId: input.semanticPanelId,
          writerPanelId: input.writerPanelId,
          comicPageId: input.comicPageId,
          comicPanelId: input.comicPanelId,
          drawPageId: input.drawPageId,
          frameElementId: input.frameElementId,
        },
      },
      {
        domain: "workflow",
        type: "workflow/mark-board-dirty",
        payload: { semanticPanelId: input.semanticPanelId },
      },
      {
        domain: "thumbnail",
        type: "thumbnail/mark-dirty",
        payload: { semanticPanelId: input.semanticPanelId },
      },
    ],
  };
}

export function materializeStudioPanelIdentity(
  index: StudioIdentityIndexV1,
  input: {
    readonly semanticPanelId: string;
    readonly writerPanelId: string;
    readonly comicPageId: string;
    readonly comicPanelId: string;
    readonly drawPageId: string;
    readonly frameElementId: string;
    readonly createdAt: string;
  },
): StudioIdentityIndexV1 {
  if (!validTimestamp(input.createdAt)) {
    throw new Error("Panel identity materialization requires a canonical UTC timestamp.");
  }
  const plan = createStudioPanelMaterializationPlan(input);
  const next = upsertStudioIdentityLink(index, {
    semanticId: plan.semanticPanelId,
    kind: "panel",
    references: [
      {
        domain: "writer-room",
        entityType: "panel",
        entityId: input.writerPanelId,
      },
      {
        domain: "comic-graph",
        entityType: "panel",
        pageId: input.comicPageId,
        entityId: input.comicPanelId,
      },
      {
        domain: "page-state",
        entityType: "frame",
        pageId: input.drawPageId,
        entityId: input.frameElementId,
      },
    ],
    source: "native",
    createdAt: input.createdAt,
  });
  const issues = validateStudioIdentityIndex(next);
  if (issues.length > 0) {
    throw new Error(`Materialized panel identity is invalid: ${issues[0].message}`);
  }
  return next;
}

export function analyzeStudioPanelRemovalImpact(input: {
  readonly semanticPanelId: string;
  readonly dialogueIds?: readonly string[];
  readonly elementIds?: readonly string[];
  readonly commentThreadIds?: readonly string[];
  readonly motionClipIds?: readonly string[];
}): StudioBindingImpact {
  if (!SAFE_ID.test(input.semanticPanelId)) {
    throw new Error("Removal impact requires a valid semantic panel ID.");
  }
  const affectedDialogueIds = [...new Set(input.dialogueIds ?? [])];
  const affectedElementIds = [...new Set(input.elementIds ?? [])];
  const affectedCommentThreadIds = [...new Set(input.commentThreadIds ?? [])];
  const affectedMotionClipIds = [...new Set(input.motionClipIds ?? [])];
  const dependencyCount = affectedDialogueIds.length
    + affectedElementIds.length
    + affectedCommentThreadIds.length
    + affectedMotionClipIds.length;
  return {
    semanticPanelId: input.semanticPanelId,
    affectedDialogueIds,
    affectedElementIds,
    affectedCommentThreadIds,
    affectedMotionClipIds,
    recommendedAction: dependencyCount > 0 ? "archive" : "detach",
    requiresConfirmation: dependencyCount > 0,
  };
}

export function validateStudioPanelBinding(
  binding: StudioPanelBindingV1,
  index: StudioIdentityIndexV1,
): readonly StudioBindingIssue[] {
  const issues: StudioBindingIssue[] = [];
  if (
    !SAFE_ID.test(binding.semanticPanelId)
    || !SAFE_ID.test(binding.writerPanelId)
    || !binding.baselineStoryDigest.trim()
    || !validTimestamp(binding.createdAt)
  ) {
    issues.push({
      code: "invalid-binding-id",
      semanticId: binding.semanticPanelId,
      message: "Panel binding identifiers, digest, or timestamp are invalid.",
    });
  }
  if ((binding.comicPageId === null) !== (binding.comicPanelId === null)) {
    issues.push({
      code: "partial-comic-binding",
      semanticId: binding.semanticPanelId,
      message: "Comic page and panel IDs must be attached or detached together.",
    });
  }
  if ((binding.drawPageId === null) !== (binding.frameElementId === null)) {
    issues.push({
      code: "partial-draw-binding",
      semanticId: binding.semanticPanelId,
      message: "Draw page and frame element IDs must be attached or detached together.",
    });
  }
  const link = index.links.find((candidate) => candidate.semanticId === binding.semanticPanelId);
  if (!link?.references.some((reference) =>
    reference.domain === "writer-room"
    && reference.entityType === "panel"
    && reference.entityId === binding.writerPanelId
  )) {
    issues.push({
      code: "missing-writer-reference",
      semanticId: binding.semanticPanelId,
      message: "The binding has no matching Writer Room reference in the identity index.",
    });
  }
  if (validateStudioIdentityIndex(index).length > 0) {
    issues.push({
      code: "identity-index-invalid",
      semanticId: binding.semanticPanelId,
      message: "The Studio semantic identity index is invalid.",
    });
  }
  return issues;
}
