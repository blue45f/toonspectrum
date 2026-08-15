import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

describe("unsaved Studio collaboration identity wiring", () => {
  it("uses the stable local draft ID before the per-tab fallback without eagerly requiring a server room", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain("loadOrCreateStudioDraftCollaborationIdentity(");
    expect(page).toContain("documentScopeKey: autosaveKey");
    expect(page).toContain("ownerScopeKey: studioAuthUserId");
    expect(page).toContain("resolveStudioLiveSessionWorkId({");
    expect(page).toContain("roomId: liveRoomQueryParam");
    expect(page).toContain("draftWorkId: draftCollaborationWorkId");
    expect(page).toContain("instantWorkId: instantWorkIdRef.current");
    expect(page).toContain("draftCollaboration={draftCollaboration}");
    expect(page).toContain("provisionCreatorDraftCollaborationRoom(request");
    expect(page).toContain('intent: "share-link"');
    expect(page).toContain('draftCollaboration?.status === "ready"');
  });

  it("passes local readiness and the explicit lazy provision action through the panel boundary", () => {
    const stack = source("./StudioLazyPanelStack.tsx");

    expect(stack).toContain(
      "draftCollaboration?: StudioDraftCollaborationReadiness | null"
    );
    expect(stack).toContain("draftCollaboration={draftCollaboration}");
    expect(stack).toContain("requestStudioDraftCollaborationShare:");
    expect(stack).toContain(
      "onDraftShareRequest={() => void requestStudioDraftCollaborationShare()}"
    );
    expect(stack).toContain("draftCollaboration.room.provisionalWorkId");
  });
});
