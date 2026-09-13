// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioAutosaveKey } from "../../studio-autosave";
import { studioCheckpointKey } from "../../studio-checkpoint-loader";
import { StudioDocumentLayoutContext, type StudioDocumentLayoutRuntime } from "../../studio-router/studio-document-layout-context";
import { useStudioDocumentAccessRuntime } from "./useStudioDocumentAccessRuntime";

const services = vi.hoisted(() => ({
  draft: vi.fn(() => ({ draftCollaboration: null })),
  collaboration: vi.fn(() => ({ collaborationDocumentLocked: false })),
  mutation: vi.fn(() => ({ markStudioDocumentChanged: () => true })),
}));
vi.mock("./useStudioDraftCollaborationRuntime", () => ({ useStudioDraftCollaborationRuntime: services.draft }));
vi.mock("./useStudioCollaborationAccessRuntime", () => ({ useStudioCollaborationAccessRuntime: services.collaboration }));
vi.mock("./useStudioMutationAuthorityRuntime", () => ({ useStudioMutationAuthorityRuntime: services.mutation }));
vi.mock("./useStudioLayerLiftRuntime", () => ({ useStudioLayerLiftRuntime: () => ({}) }));

type Options = Parameters<typeof useStudioDocumentAccessRuntime>[0];
function options(workId: string | null, remixId: string | null = null): Options {
  const noop = () => undefined;
  return {
    announce: noop, getProjectSnapshot: () => ({}), instantWorkId: "instant-owner",
    liveRoomQueryParam: null, onAcceptedMutation: noop, remixId, reportError: noop,
    sessionDisplayName: "Test owner", setStudioWorkAssetLimitExceeded: noop,
    setStudioWorkAssetReferences: noop, studioAuthUserId: "owner-1",
    studioCrdtDocument: null, studioCrdtDocumentRef: { current: null },
    studioCrdtReconciledDocument: null, studioCrdtSceneRuntimeRef: { current: null },
    studioWorkAssetHydrator: {} as Options["studioWorkAssetHydrator"], workId,
  };
}

function layout(documentId: string): StudioDocumentLayoutRuntime {
  return {
    documentKey: `project:project-1:document:${documentId}`, projectId: "project-1",
    documentId, draftId: null, documentWorkspace: "draw", draftSessionEpoch: 0,
    instantWorkId: "instant-owner", liveRoomParam: null, remixId: null, workId: documentId,
  };
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("document persistence and source access wiring", () => {
  it("preserves local recovery keys while all server access services receive a null workId", () => {
    const documentId = "ep01-existing";
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StudioDocumentLayoutContext value={layout(documentId)}>{children}</StudioDocumentLayoutContext>
    );
    const { result } = renderHook(() => useStudioDocumentAccessRuntime(options(null)), { wrapper });
    const previousScope = { userId: "owner-1", workId: documentId, remixId: null };
    expect(result.current.autosaveKey).toBe(studioAutosaveKey(previousScope));
    expect(result.current.checkpointKey).toBe(studioCheckpointKey(previousScope));
    expect(services.draft).toHaveBeenLastCalledWith(expect.objectContaining({ workId: null, autosaveKey: studioAutosaveKey(previousScope) }));
    expect(services.collaboration).toHaveBeenLastCalledWith(expect.objectContaining({ workId: null }));
    expect(services.mutation).toHaveBeenLastCalledWith(expect.objectContaining({ workId: null }));
  });

  it.each([
    ["server-work", null],
    [null, "remix-source"],
    [null, null],
  ] as const)("retains legacy recovery and source scopes for work=%s remix=%s", (workId, remixId) => {
    const { result } = renderHook(() => useStudioDocumentAccessRuntime(options(workId, remixId)));
    const scope = { userId: "owner-1", workId, remixId };
    expect(result.current.autosaveKey).toBe(studioAutosaveKey(scope));
    expect(result.current.checkpointKey).toBe(studioCheckpointKey(scope));
    expect(services.collaboration).toHaveBeenLastCalledWith(expect.objectContaining({ workId, remixId }));
  });
});
