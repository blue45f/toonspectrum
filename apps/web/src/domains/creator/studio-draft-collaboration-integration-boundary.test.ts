import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

describe("unsaved Studio collaboration identity wiring", () => {
  it("uses the stable local draft ID before the per-tab fallback without eagerly requiring a server room", () => {
    // The draft-collaboration wiring moved out of the host body into its runtime hook when the
    // routes were layered; the boundary is unchanged, so read both halves.
    const page = source("./StudioCuttoonEditorHost.tsx")
      + source("./studio-cuttoon-editor/runtime/useStudioDraftCollaborationRuntime.ts")
      + source("./studio-cuttoon-editor/runtime/useStudioCollaborationAccessRuntime.ts");

    expect(page).toContain("loadOrCreateStudioDraftCollaborationIdentity(");
    expect(page).toContain("documentScopeKey: autosaveKey");
    expect(page).toContain("ownerScopeKey: studioAuthUserId");
    expect(page).toContain("resolveStudioLiveSessionWorkId({");
    expect(page).toContain("roomId: liveRoomQueryParam");
    expect(page).toContain("draftWorkId: draftCollaborationWorkId");
    // The per-tab instant id moved up to StudioDocumentLayout so it survives surface switches;
    // the page consumes it from that layout instead of owning a render-phase ref. The layout must
    // also recover the owner receipt across reload/remount so the auto-published room cannot turn
    // its own tab into a fail-closed joiner.
    expect(page).toContain("useStudioDocumentLayout()");
    expect(page).toContain("instantWorkId,");
    expect(page).not.toContain("instantWorkIdRef");
    const layout = source("./studio-router/StudioDocumentLayout.tsx");
    expect(layout).toContain("resolveStudioLiveInstantWorkIdForTab({");
    expect(layout).toContain("storage: currentStudioSessionStorage()");
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
