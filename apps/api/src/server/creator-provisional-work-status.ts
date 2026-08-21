export const CREATOR_DRAFT_COLLABORATION_STATUS_LOCKED_CODE =
  "creator_draft_collaboration_status_locked" as const;

export class CreatorDraftCollaborationStatusLockedError extends Error {
  constructor() {
    super(CREATOR_DRAFT_COLLABORATION_STATUS_LOCKED_CODE);
    this.name = "CreatorDraftCollaborationStatusLockedError";
  }
}

interface CreatorDraftCollaborationStatusMutationGuardInput {
  readonly hidden: boolean;
  readonly draftCollaborationStatus: string | null | undefined;
  readonly requestedStatus: "draft" | "published" | undefined;
}

/**
 * An active hidden work is staging authority for save-before-collaboration. Ordinary document
 * saves may keep it as a draft, but only the atomic promotion UoW may publish it and unhide it.
 */
export function assertCreatorDraftCollaborationStatusMutationAllowed(
  input: CreatorDraftCollaborationStatusMutationGuardInput
): void {
  if (
    input.hidden &&
    input.draftCollaborationStatus === "active" &&
    input.requestedStatus !== undefined &&
    input.requestedStatus !== "draft"
  ) {
    throw new CreatorDraftCollaborationStatusLockedError();
  }
}
