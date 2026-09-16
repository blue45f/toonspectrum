import {
  studioSaveProfileNeedsDestination,
  type StudioSaveProfile,
} from "./studio-save-profile";

export type StudioEditorExplicitSaveAction =
  | "server-pipeline"
  | "choose-destination"
  | "save-local-file";

export function resolveStudioEditorExplicitSaveAction(input: {
  readonly status: "published" | "draft";
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly workId: string | null;
  readonly remixId: string | null;
  readonly profile: StudioSaveProfile | null;
}): StudioEditorExplicitSaveAction {
  const localProjectDocument = input.status === "draft"
    && input.projectId !== null
    && input.documentId !== null
    && input.workId === null
    && input.remixId === null;
  if (!localProjectDocument) return "server-pipeline";
  if (!input.profile || studioSaveProfileNeedsDestination(input.profile)) {
    return "choose-destination";
  }
  const syncedLocalFile = input.profile.bindings.some((binding) => (
    binding.provider === "local-file"
    && binding.syncState === "synced"
    && binding.lastSyncedAt !== null
  ));
  return syncedLocalFile ? "save-local-file" : "choose-destination";
}
