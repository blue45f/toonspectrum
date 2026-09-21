import { readStudioWorldAuthoringDraftRecord, writeStudioWorldAuthoringDraft } from "./studio-virtual-space-world-authoring";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

interface RecoveryPorts {
  write: typeof writeStudioWorldAuthoringDraft;
  read: typeof readStudioWorldAuthoringDraftRecord;
  reload(): void;
}
const browser: RecoveryPorts = { write: writeStudioWorldAuthoringDraft, read: readStudioWorldAuthoringDraftRecord, reload: () => window.location.reload() };
/** A cached module failure may require a document reload. Never reload before verifying the saved draft. */
export function reloadStudioWorldAfterDraftSave(projectId: string, manifest: StudioVirtualSpaceWorldManifest,
  basePublishedRevisionId?: string | null, ports: RecoveryPorts = browser): boolean {
  try {
    if (!ports.write(projectId, manifest, basePublishedRevisionId)) return false;
    const saved = ports.read(projectId);
    if (!saved || saved.basePublishedRevisionId !== basePublishedRevisionId || JSON.stringify(saved.manifest) !== JSON.stringify(manifest)) return false;
    ports.reload(); return true;
  } catch { return false; }
}
