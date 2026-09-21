import { describe, expect, it } from "vitest";
import { projectStudioCollaborationAccessPolicy } from "../studio-cuttoon-editor/runtime/studio-collaboration-access-policy";
import { isStudioSkiaDocumentFrontierReady } from "./studio-skia-document-frontier";

const base = { expectsSharedDocument: false, joinedLiveJam: false, realtimeSession: true,
  participantCanEdit: true, documentReady: false, editsDurablyProtected: false, documentAccessLocked: false };
function ready(input: Partial<typeof base>) {
  const policy = projectStudioCollaborationAccessPolicy({ ...base, ...input });
  return isStudioSkiaDocumentFrontierReady({ operationSyncReady: policy.operationSyncReady, documentLocked: policy.documentLocked });
}
describe("authorized GPU display frontier", () => {
  it("allows the owner's new local draft while its optional sync lane starts", () => {
    expect(ready({})).toBe(true);
  });
  it("does not promote a joined or saved remote document before authoritative readiness", () => {
    expect(ready({ joinedLiveJam: true })).toBe(false);
    expect(ready({ expectsSharedDocument: true })).toBe(false);
    expect(ready({ expectsSharedDocument: true, documentReady: true })).toBe(false);
  });
  it("accepts a ready durable shared frontier without creating a new permission", () => {
    expect(ready({ expectsSharedDocument: true, documentReady: true, editsDurablyProtected: true })).toBe(true);
  });
  it("does not treat missing policy data as an unlocked document", () => {
    expect(isStudioSkiaDocumentFrontierReady({} as Parameters<typeof isStudioSkiaDocumentFrontierReady>[0])).toBe(false);
  });
});
