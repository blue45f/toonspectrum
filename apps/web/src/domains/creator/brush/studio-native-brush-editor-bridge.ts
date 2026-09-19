import type { El } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";
import type { StudioNativeBrushDocumentPrepare } from "./studio-native-brush-document-commit";

type Ref<T> = { readonly current: T };
interface NativePage {
  readonly id: string;
  readonly elements: El[];
  readonly groups?: LayerGroup[];
  readonly canvasH: number;
}
interface EditorPorts<Ticket> {
  captureStudioMutationTicket(): Ticket;
  canApplyStudioMutation(ticket: Ticket): boolean;
  readonly editorMountedRef: Ref<boolean>;
  readonly documentSaveInFlightRef: Ref<unknown>;
  readonly collaborationAccessRef: Ref<{ readonly locked: boolean }>;
  readonly activeSurfaceReviewLockedRef: Ref<boolean>;
  readonly drawingRef: Ref<unknown>;
  readonly pendingStrokeCommitsRef: Ref<unknown>;
  readonly pagesHistoryRef: Ref<NativePage[][]>;
  readonly pagesHiRef: Ref<number>;
  readonly currentPageIdRef: Ref<string>;
  readonly masterEditModeRef: Ref<boolean>;
  readonly documentWidth: number;
  commit(elements: El[]): boolean;
  setSelectedId(id: string): void;
  announceDrawingShortcut(message: string): void;
}

/** Extract host orchestration without caching mutable page state or capturing the ticket early. */
export function createNativeBrushDocumentEditorPreparer<Ticket>(ports: EditorPorts<Ticket>): StudioNativeBrushDocumentPrepare {
  return (target, prepare) => {
    if (typeof prepare !== "function") return null;
    const ticket = ports.captureStudioMutationTicket();
    return prepare(target, {
      canMutate: () => ports.canApplyStudioMutation(ticket)
        && ports.editorMountedRef.current && !ports.documentSaveInFlightRef.current
        && !ports.collaborationAccessRef.current.locked && !ports.activeSurfaceReviewLockedRef.current
        && !ports.drawingRef.current && !ports.pendingStrokeCommitsRef.current,
      read: () => {
        const history = ports.pagesHistoryRef.current;
        const index = ports.pagesHiRef.current;
        const page = history[index]?.find((candidate) => candidate.id === ports.currentPageIdRef.current);
        return page ? {
          pageId: page.id, masterEditMode: ports.masterEditModeRef.current,
          historyIdentity: history, historyIndex: index, elements: page.elements,
          groups: page.groups ?? [], documentWidth: ports.documentWidth, documentHeight: page.canvasH,
        } : null;
      },
      commit: (elements) => ports.commit(elements),
      onCommitted: (id) => {
        ports.setSelectedId(id);
        ports.announceDrawingShortcut("네이티브 브러시 변환 완료 · 원본 숨김 보존 · 실행 취소 가능");
      },
    });
  };
}
