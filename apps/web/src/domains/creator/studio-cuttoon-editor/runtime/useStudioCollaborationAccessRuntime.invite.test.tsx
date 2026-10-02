// @vitest-environment jsdom

import { useRef, useState } from "react";

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioWorkAssetHydrator } from "../../studio-work-asset-hydrator";
import { useStudioCollaborationAccessRuntime } from "./useStudioCollaborationAccessRuntime";

import type { StudioCrdtDocument } from "../../live/studio-crdt-document";
import type { StudioCrdtSceneGraphRuntime } from "../../live/StudioLiveCollaborationProvider";
import type { StudioLiveInviteRole } from "../../live/studio-live-jam-session";
import type { StudioSharedDocument } from "../../studio-shared-document-client";
import type { StudioWorkAssetSceneReference } from "../../studio-work-asset-render-projection";

interface InviteScenario {
  instantWorkId: string;
  liveInviteRole: StudioLiveInviteRole | null;
  liveRoomQueryParam: string | null;
  studioAuthUserId: string | null;
  workId: string | null;
}

function renderAccessRuntime(scenario: InviteScenario) {
  return renderHook(() => {
    const [, setLimitExceeded] = useState(false);
    const [, setReferences] = useState<StudioWorkAssetSceneReference[]>([]);
    const documentRef = useRef<StudioCrdtDocument | null>(null);
    const sceneRuntimeRef = useRef<StudioCrdtSceneGraphRuntime | null>(null);
    return useStudioCollaborationAccessRuntime({
      draftCollaboration: null,
      instantWorkId: scenario.instantWorkId,
      liveInviteRole: scenario.liveInviteRole,
      liveRoomQueryParam: scenario.liveRoomQueryParam,
      remixId: null,
      sessionDisplayName: "테스터",
      setStudioWorkAssetLimitExceeded: setLimitExceeded,
      setStudioWorkAssetReferences: setReferences,
      studioAuthUserId: scenario.studioAuthUserId,
      studioCrdtDocument: null,
      studioCrdtDocumentRef: documentRef,
      studioCrdtReconciledDocument: null,
      studioCrdtSceneRuntimeRef: sceneRuntimeRef,
      studioWorkAssetHydrator: new StudioWorkAssetHydrator(null),
      workId: scenario.workId,
    });
  });
}

const sharedDocumentFixture: StudioSharedDocument = {
  workId: "work-saved-1",
  role: "editor",
  status: "active",
  capabilities: { view: true, edit: true },
  access: "edit",
  revision: 3,
  crdtServerSequence: "12",
  updatedAt: "2026-10-02T00:00:00.000Z",
  document: {
    titleId: null,
    title: "공유 작품",
    description: "",
    cover: "",
    tags: [],
    format: "cuttoon",
    pages: [],
    doc: {},
    status: "draft",
    seriesId: null,
    episodeNo: null,
    challengeId: null,
    remixFromId: null,
  },
};

describe("useStudioCollaborationAccessRuntime invite role", () => {
  it("applies the invite downgrade to a link joiner's participant role", () => {
    const viewer = renderAccessRuntime({
      instantWorkId: "instant-tab-b",
      liveInviteRole: "viewer",
      liveRoomQueryParam: "jam-host-a",
      studioAuthUserId: null,
      workId: null,
    });
    expect(viewer.result.current.studioLiveParticipant.role).toBe("viewer");
    viewer.unmount();

    const commenter = renderAccessRuntime({
      instantWorkId: "instant-tab-b",
      liveInviteRole: "commenter",
      liveRoomQueryParam: "jam-host-a",
      studioAuthUserId: null,
      workId: null,
    });
    expect(commenter.result.current.studioLiveParticipant.role).toBe("commenter");
    commenter.unmount();
  });

  it("keeps the default editor role for a link joiner without an invite role", () => {
    const { result, unmount } = renderAccessRuntime({
      instantWorkId: "instant-tab-b",
      liveInviteRole: null,
      liveRoomQueryParam: "jam-host-a",
      studioAuthUserId: null,
      workId: null,
    });
    expect(result.current.studioLiveParticipant.role).toBe("editor");
    unmount();
  });

  it("never downgrades the room owner even when the link carries an invite role", () => {
    const { result, unmount } = renderAccessRuntime({
      instantWorkId: "instant-host",
      liveInviteRole: "viewer",
      liveRoomQueryParam: "instant-host",
      studioAuthUserId: null,
      workId: null,
    });
    expect(result.current.studioLiveParticipant.role).toBe("editor");
    unmount();
  });

  it("lets the server ACL role win over the invite downgrade for a saved work", () => {
    const { result, unmount } = renderAccessRuntime({
      instantWorkId: "instant-tab-b",
      liveInviteRole: "viewer",
      liveRoomQueryParam: "work-saved-1",
      studioAuthUserId: "user-1",
      workId: "work-saved-1",
    });
    act(() => {
      result.current.setSharedDocumentScope({
        authScopeKey: "user-1",
        workId: "work-saved-1",
        value: sharedDocumentFixture,
      });
    });
    expect(result.current.studioLiveParticipant.role).toBe("editor");
    unmount();
  });
});
