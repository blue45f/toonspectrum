import type { StudioProjectDocumentEntry } from "../studio-project-document-store";
import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import {
  buildStudioProjectPackage,
  type StudioProjectPackageResult,
} from "./studio-project-package";
import {
  buildStudioProjectWorkspacePackageEntries,
  collectStudioProjectWorkspaceSnapshots,
  type StudioProjectWorkspaceSnapshot,
  type StudioProjectWorkspaceSnapshotReader,
} from "./studio-project-workspace-snapshots";
import type { StudioSaveProfile } from "./studio-save-profile";
import type { StudioSubmission } from "./studio-submission-store";
import type { StudioAutosavePayload } from "../studio-autosave";

export interface BuildStudioProjectPackageWithWorkspaceInput {
  readonly storage: Storage;
  readonly project: StudioProjectLibraryEntry;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly profile: StudioSaveProfile;
  readonly submissions?: readonly StudioSubmission[];
  readonly authUserId?: string | null;
  readonly currentSnapshots?: Readonly<Record<string, StudioAutosavePayload>>;
  readonly exportedAt?: string;
}

export interface StudioProjectPackageWithWorkspaceResult {
  readonly packageResult: StudioProjectPackageResult;
  readonly snapshots: readonly StudioProjectWorkspaceSnapshot[];
}

export async function buildStudioProjectPackageWithWorkspace(
  input: BuildStudioProjectPackageWithWorkspaceInput,
  reader?: StudioProjectWorkspaceSnapshotReader,
): Promise<StudioProjectPackageWithWorkspaceResult> {
  const snapshots = await collectStudioProjectWorkspaceSnapshots({
    storage: input.storage,
    projectId: input.project.id,
    documents: input.documents,
    authUserId: input.authUserId ?? null,
    lastOpenedDocumentId: input.project.lastOpenedDocumentId,
    currentSnapshots: input.currentSnapshots,
  }, reader);
  return Object.freeze({
    packageResult: buildStudioProjectPackage({
      project: input.project,
      documents: input.documents,
      profile: input.profile,
      submissions: input.submissions,
      exportedAt: input.exportedAt,
      additionalEntries: buildStudioProjectWorkspacePackageEntries(input.documents, snapshots),
    }),
    snapshots,
  });
}
