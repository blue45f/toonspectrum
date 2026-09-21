import { describe, expect, it, vi } from "vitest";
import { createStudioDrawingWorkbenchRestoreActions, type StudioDrawingWorkbenchRestoreInputs } from "./studio-drawing-workbench-restore";
import { DEFAULT_STUDIO_WORKSPACE_STATE } from "./studio-workspaces";

function inputs(): StudioDrawingWorkbenchRestoreInputs {
  return {
    currentWorkspaceOwnerScope: "artist-a",
    workspacePersistenceRef: { current: { ownerScope: "artist-a", state: DEFAULT_STUDIO_WORKSPACE_STATE } },
    liveWorkspaceLayoutRef: { current: DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout },
    drawingLayoutRestorePoint: null, setDrawingLayoutRestorePoint: vi.fn(), uiDensityMode: "focus",
    setStudioUiDensity: vi.fn(), persistStudioWorkspaceState: vi.fn(), applyStudioWorkspaceLayout: vi.fn(), announceDrawingShortcut: vi.fn(),
  };
}

describe("drawing workspace restoration boundary", () => {
  it("preserves ownership and does nothing for a stale workspace", () => {
    const input = inputs(); input.currentWorkspaceOwnerScope = "artist-b";
    const actions = createStudioDrawingWorkbenchRestoreActions(input);
    actions.restoreDrawingWorkbench(); actions.undoDrawingWorkbenchRestore();
    expect(input.persistStudioWorkspaceState).not.toHaveBeenCalled();
    expect(input.applyStudioWorkspaceLayout).not.toHaveBeenCalled();
    expect(input.setDrawingLayoutRestorePoint).not.toHaveBeenCalled();
  });
  it("stores a restoration point and exits focus without any document or brush mutation port", () => {
    const input = inputs();
    createStudioDrawingWorkbenchRestoreActions(input).restoreDrawingWorkbench();
    expect(input.persistStudioWorkspaceState).toHaveBeenCalledOnce();
    expect(input.applyStudioWorkspaceLayout).toHaveBeenCalledOnce();
    expect(input.setStudioUiDensity).toHaveBeenCalledExactlyOnceWith("simple");
    const updater = vi.mocked(input.setDrawingLayoutRestorePoint).mock.calls[0]![0];
    expect(typeof updater).toBe("function");
    if (typeof updater === "function") expect(updater(null)).toEqual({ ownerScope: "artist-a", layout: input.liveWorkspaceLayoutRef.current });
  });
  it("undo restores only the matching owner's layout and clears that restoration point", () => {
    const input = inputs(); input.drawingLayoutRestorePoint = { ownerScope: "artist-a", layout: input.liveWorkspaceLayoutRef.current };
    createStudioDrawingWorkbenchRestoreActions(input).undoDrawingWorkbenchRestore();
    expect(input.applyStudioWorkspaceLayout).toHaveBeenCalledExactlyOnceWith(input.liveWorkspaceLayoutRef.current);
    expect(input.setDrawingLayoutRestorePoint).toHaveBeenCalledExactlyOnceWith(null);
    expect(input.persistStudioWorkspaceState).toHaveBeenCalledOnce();
    input.currentWorkspaceOwnerScope = "artist-b";
    createStudioDrawingWorkbenchRestoreActions(input).undoDrawingWorkbenchRestore();
    expect(input.persistStudioWorkspaceState).toHaveBeenCalledOnce();
  });
});
