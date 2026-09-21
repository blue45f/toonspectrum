import type { Dispatch, SetStateAction } from "react";
import { backupStudioDrawingWorkbenchLayout, restoreStudioDrawingWorkbenchLayout } from "./studio-drawing-workbench";
import { updateStudioWorkspaceLiveLayout, type StudioWorkspaceLayout, type StudioWorkspaceState } from "./studio-workspaces";
import type { StudioUiDensityMode } from "./studio-ui-density";

interface RestorePoint { ownerScope: string; layout: StudioWorkspaceLayout }
export interface StudioDrawingWorkbenchRestoreInputs {
  currentWorkspaceOwnerScope: string;
  workspacePersistenceRef: Readonly<{ current: { ownerScope: string; state: StudioWorkspaceState } }>;
  liveWorkspaceLayoutRef: Readonly<{ current: StudioWorkspaceLayout }>;
  drawingLayoutRestorePoint: RestorePoint | null;
  setDrawingLayoutRestorePoint: Dispatch<SetStateAction<RestorePoint | null>>;
  uiDensityMode: StudioUiDensityMode;
  setStudioUiDensity: (mode: StudioUiDensityMode) => void;
  persistStudioWorkspaceState: (state: StudioWorkspaceState) => void;
  applyStudioWorkspaceLayout: (layout: StudioWorkspaceLayout) => void;
  announceDrawingShortcut: (message: string) => void;
}

/** UI-only restoration. Document and brush histories stay outside this focused boundary. */
export function createStudioDrawingWorkbenchRestoreActions(input: StudioDrawingWorkbenchRestoreInputs) {
  const { currentWorkspaceOwnerScope, workspacePersistenceRef, liveWorkspaceLayoutRef,
    drawingLayoutRestorePoint, setDrawingLayoutRestorePoint, uiDensityMode, setStudioUiDensity,
    persistStudioWorkspaceState, applyStudioWorkspaceLayout, announceDrawingShortcut } = input;
  function restoreDrawingWorkbench() {
    if (workspacePersistenceRef.current.ownerScope !== currentWorkspaceOwnerScope) return;
    let nextState = workspacePersistenceRef.current.state;
    if (drawingLayoutRestorePoint?.ownerScope !== currentWorkspaceOwnerScope) {
      try {
        nextState = backupStudioDrawingWorkbenchLayout(nextState, liveWorkspaceLayoutRef.current, "드로잉 복원 전 " + new Date().toLocaleString("ko-KR"));
      } catch {
        announceDrawingShortcut("이전 배치를 보관하지 못했어요. 저장된 작업공간을 정리한 뒤 다시 복원해 주세요.");
        return;
      }
    }
    setDrawingLayoutRestorePoint((previous) =>
      previous?.ownerScope === currentWorkspaceOwnerScope ? previous : {
        ownerScope: currentWorkspaceOwnerScope, layout: liveWorkspaceLayoutRef.current,
      });
    if (uiDensityMode === "focus") setStudioUiDensity("simple");
    const layout = restoreStudioDrawingWorkbenchLayout(liveWorkspaceLayoutRef.current);
    persistStudioWorkspaceState(updateStudioWorkspaceLiveLayout(nextState, layout));
    applyStudioWorkspaceLayout(layout);
    announceDrawingShortcut("드로잉 배치를 복원했어요 · 원고와 브러시 설정은 유지됩니다");
  }
  function undoDrawingWorkbenchRestore() {
    if (!drawingLayoutRestorePoint || drawingLayoutRestorePoint.ownerScope !== currentWorkspaceOwnerScope
      || workspacePersistenceRef.current.ownerScope !== currentWorkspaceOwnerScope) return;
    const { layout } = drawingLayoutRestorePoint;
    persistStudioWorkspaceState(updateStudioWorkspaceLiveLayout(workspacePersistenceRef.current.state, layout));
    applyStudioWorkspaceLayout(layout);
    setDrawingLayoutRestorePoint(null);
    announceDrawingShortcut("이전 작업 배치로 돌아왔어요");
  }
  return { restoreDrawingWorkbench, undoDrawingWorkbenchRestore };
}
