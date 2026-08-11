export const CREATOR_DRAFT_COLLABORATION_PROVISION_INTENTS = [
  "share-link",
  "invite-member",
  "cloud-save",
] as const;

export const CREATOR_DRAFT_COLLABORATION_FINAL_STATUSES = [
  "draft",
  "published",
] as const;

export type CreatorDraftCollaborationProvisionIntent =
  (typeof CREATOR_DRAFT_COLLABORATION_PROVISION_INTENTS)[number];
export type CreatorDraftCollaborationFinalStatus =
  (typeof CREATOR_DRAFT_COLLABORATION_FINAL_STATUSES)[number];

export function isCreatorDraftCollaborationProvisionIntent(
  value: unknown
): value is CreatorDraftCollaborationProvisionIntent {
  return CREATOR_DRAFT_COLLABORATION_PROVISION_INTENTS.some(
    (intent) => intent === value
  );
}

export function isCreatorDraftCollaborationFinalStatus(
  value: unknown
): value is CreatorDraftCollaborationFinalStatus {
  return CREATOR_DRAFT_COLLABORATION_FINAL_STATUSES.some(
    (status) => status === value
  );
}
