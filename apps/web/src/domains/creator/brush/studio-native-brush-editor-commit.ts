import { prepareStudioNativeBrushDocumentCommit } from "./studio-native-brush-document-commit";
import type { StudioNativeBrushDocumentTarget } from "./studio-native-brush-document-commit";
import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

interface ReadRef<T> {
  readonly current: T;
}
/** Typed ownership seam: the UI supplies references, not a captured stale page snapshot. */
export interface StudioNativeBrushEditorPorts<Ticket> {
  canApply(ticket: Ticket): boolean;
  commit(elements: El[]): boolean;
  history: ReadRef<readonly (readonly PageState[])[]>;
  index: ReadRef<number>;
  pageId: ReadRef<string>;
  masterEditMode: ReadRef<boolean>;
  mounted: ReadRef<boolean>;
  saving: ReadRef<boolean>;
  collaboration: ReadRef<{ readonly locked: boolean }>;
  surfaceLocked: ReadRef<boolean>;
  drawing: ReadRef<unknown>;
  pending: ReadRef<unknown>;
  documentWidth: number;
  select(id: string): void;
  announce(message: string): void;
}

export function prepareStudioNativeBrushDocumentFromEditor<Ticket>(
  target: StudioNativeBrushDocumentTarget,
  ticket: Ticket,
  ports: StudioNativeBrushEditorPorts<Ticket>,
) {
  return prepareStudioNativeBrushDocumentCommit(target, {
    canMutate: () =>
      ports.canApply(ticket) &&
      ports.mounted.current &&
      !ports.saving.current &&
      !ports.collaboration.current.locked &&
      !ports.surfaceLocked.current &&
      !ports.drawing.current &&
      !ports.pending.current,
    read: () => {
      const history = ports.history.current;
      const index = ports.index.current;
      const page = history[index]?.find(
        (candidate) => candidate.id === ports.pageId.current,
      );
      return page
        ? {
            pageId: page.id,
            masterEditMode: ports.masterEditMode.current,
            historyIdentity: history,
            historyIndex: index,
            elements: page.elements,
            groups: page.groups ?? [],
            documentWidth: ports.documentWidth,
            documentHeight: page.canvasH,
          }
        : null;
    },
    commit: ports.commit,
    onCommitted: (id) => {
      ports.select(id);
      ports.announce(
        "네이티브 브러시 변환 완료 · 원본 숨김 보존 · 실행 취소 가능",
      );
    },
  });
}
