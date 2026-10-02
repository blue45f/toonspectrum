/**
 * 보드의 저장 동작(상태 이동·제목 수정·카드 추가) 구현. React와 무관한 순수 팩토리라 그대로 테스트할 수 있다.
 *
 * 모든 동작은 기존 명령 경로(`ProductionClientCommand`)로 보낸다.
 * 화면은 먼저 바꾸고(낙관적 업데이트) 저장이 끝나면 덧씌움을 지운다. 실패하면 원래대로 돌아가고 이유를 알린다.
 * 성공한 이동·제목 수정은 도메인 규칙이 허용하는 경우에만 "되돌리기"를 함께 보여 준다.
 */
import type {
  ProductionProjectAggregate,
  ProductionTask,
  ProductionTaskStatus,
  ProductionTaskTransition,
} from "@toonstudio/core/production";

import type { ProductionClientCommand } from "../production-api";
import {
  previewProductionBoardMove,
  previewProductionBoardRevert,
  type ProductionBoardMovePreview,
} from "../production-board-move-preview";
import type { ProductionLocalize } from "../production-labels";

import { applyOptimisticOps, statusPatch, type ProductionTaskPatch } from "./board-optimistic";
import { boardWipForMove, boardWipOverflow } from "./board-wip";
import type { BoardToastMessage } from "./BoardToast";

export interface BoardActionContext {
  /** 낙관적 덧씌움이 적용된, 지금 화면에 보이는 프로젝트 데이터. */
  readonly aggregate: ProductionProjectAggregate;
  readonly canEdit: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly begin: (patches: ReadonlyMap<string, ProductionTaskPatch>, added?: readonly ProductionTask[]) => number;
  readonly settle: (id: number) => void;
  readonly bt: ProductionLocalize;
  readonly show: (toast: Omit<BoardToastMessage, "id">) => void;
  readonly announce: (message: string) => void;
  /** 공정 설정 열기(한도 경고에서 바로 조정하도록). 권한이 없으면 undefined. */
  readonly onOpenWorkflow?: () => void;
}

export interface MoveStatusOptions {
  /** 도착 열 이름. 알림 문구에 쓴다. */
  readonly columnLabel: string;
  /** 화면을 먼저 바꿀 때 함께 할 일(예: 열 안 순서 저장). */
  readonly onOptimistic?: () => void;
  /** 저장에 실패해 되돌릴 때 함께 할 일. */
  readonly onRollback?: () => void;
}

export interface BoardActions {
  moveStatus(ids: readonly string[], status: ProductionTaskStatus, options: MoveStatusOptions): Promise<boolean>;
  rename(task: ProductionTask, title: string): Promise<boolean>;
  addCards(tasks: readonly ProductionTask[]): Promise<boolean>;
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** `getContext`는 호출할 때마다 최신 화면 데이터와 콜백을 돌려줘야 한다(비동기 저장 중에도 오래된 값을 쓰지 않도록). */
export function createBoardActions(getContext: () => BoardActionContext): BoardActions {
  interface Commit {
    readonly message: string;
    readonly failure: string;
    readonly offerUndo: boolean;
    readonly onOptimistic?: () => void;
    readonly onRollback?: () => void;
  }

  /** 검증을 통과한 상태 전환을 낙관적으로 보여 주고 저장한다. 되돌리기 저장에도 같은 경로를 쓴다. */
  const commitTransitions = async (preview: ProductionBoardMovePreview, commit: Commit): Promise<boolean> => {
    const ctx = getContext();
    const patches = new Map(preview.changed.map((task) => [task.id, statusPatch(task)] as const));
    const opId = ctx.begin(patches);
    commit.onOptimistic?.();
    try {
      await ctx.execute({ type: "transition-task-batch", transitions: preview.transitions }, commit.message);
      ctx.announce(commit.message);
      const after = applyOptimisticOps(ctx.aggregate, [{ id: 0, patches, added: [] }]);
      const revert = commit.offerUndo ? previewProductionBoardRevert(after, preview.transitions, new Date().toISOString()) : null;
      ctx.show({
        tone: "success",
        message: commit.message,
        action: revert?.allowed
          ? { label: ctx.bt("되돌리기", "Undo"), run: () => void undoTransitions(preview.transitions) }
          : undefined,
        detail:
          revert && !revert.allowed
            ? ctx.bt(
                "이 이동은 작업 상태 규칙상 되돌릴 수 없습니다. 필요하면 '잠시 멈춤'이나 '막힘'을 거쳐 옮기세요.",
                "This step can't be undone under the status rules. Use Paused or Blocked first if you need to step back.",
              )
            : undefined,
      });
      return true;
    } catch (cause) {
      commit.onRollback?.();
      ctx.announce("");
      ctx.show({
        tone: "error",
        message: commit.failure,
        detail: errorText(cause, ctx.bt("변경을 저장하지 못했습니다.", "Couldn't save the change.")),
      });
      return false;
    } finally {
      ctx.settle(opId);
    }
  };

  const undoTransitions = async (moved: readonly ProductionTaskTransition[]): Promise<void> => {
    const ctx = getContext();
    const preview = previewProductionBoardRevert(ctx.aggregate, moved, new Date().toISOString());
    if (!preview.allowed) {
      ctx.show({ tone: "warning", message: ctx.bt("이제는 되돌릴 수 없습니다", "Can't undo anymore"), detail: preview.reason });
      return;
    }
    await commitTransitions(preview, {
      message: ctx.bt("이동을 되돌렸습니다.", "Move undone."),
      failure: ctx.bt("되돌리지 못했습니다", "Couldn't undo"),
      offerUndo: false,
    });
  };

  const moveStatus: BoardActions["moveStatus"] = async (ids, status, move) => {
    const ctx = getContext();
    if (!ctx.canEdit) return false;
    const preview = previewProductionBoardMove(ctx.aggregate, ids, status, new Date().toISOString());
    if (!preview.allowed) {
      const first = boardWipOverflow(boardWipForMove(ctx.aggregate, ids, status, ctx.bt))[0];
      ctx.show({
        tone: "warning",
        message: first
          ? ctx.bt(
              `'${first.name}' 공정은 동시에 ${first.limit}개까지만 작업할 수 있어요`,
              `'${first.name}' allows only ${first.limit} tasks in progress at a time`,
            )
          : ctx.bt(`'${move.columnLabel}'(으)로 옮기지 못했어요`, `Couldn't move to '${move.columnLabel}'`),
        detail: preview.reason,
        action:
          first && ctx.onOpenWorkflow ? { label: ctx.bt("공정 설정", "Workflow"), run: ctx.onOpenWorkflow } : undefined,
      });
      ctx.announce("");
      return false;
    }
    const count = preview.transitions.length;
    return commitTransitions(preview, {
      message: ctx.bt(
        `${count}개 작업을 ${move.columnLabel} 상태로 이동했습니다.`,
        `Moved ${count} ${count === 1 ? "task" : "tasks"} to ${move.columnLabel}.`,
      ),
      failure: ctx.bt("이동을 저장하지 못해 원래 자리로 되돌렸어요", "Couldn't save the move, so it was put back"),
      offerUndo: true,
      onOptimistic: move.onOptimistic,
      onRollback: move.onRollback,
    });
  };

  const rename: BoardActions["rename"] = async (task, title) => {
    const ctx = getContext();
    const next = title.trim();
    if (!ctx.canEdit || !next || next === task.title) return false;
    const opId = ctx.begin(new Map<string, ProductionTaskPatch>([[task.id, { title: next }]]));
    const message = ctx.bt("제목을 바꿨습니다.", "Title updated.");
    try {
      await ctx.execute({ type: "upsert-task-batch", tasks: [{ ...task, title: next }], expectedTasks: [task] }, message);
      ctx.announce(message);
      ctx.show({
        tone: "success",
        message,
        action: {
          label: ctx.bt("되돌리기", "Undo"),
          run: () => {
            const fresh = getContext().aggregate.tasks.find((entry) => entry.id === task.id) ?? { ...task, title: next };
            void rename(fresh, task.title);
          },
        },
      });
      return true;
    } catch (cause) {
      ctx.announce("");
      ctx.show({
        tone: "error",
        message: ctx.bt("제목을 저장하지 못해 원래대로 되돌렸어요", "Couldn't save the title, so it was reverted"),
        detail: errorText(cause, ctx.bt("변경을 저장하지 못했습니다.", "Couldn't save the change.")),
      });
      return false;
    } finally {
      ctx.settle(opId);
    }
  };

  const addCards: BoardActions["addCards"] = async (tasks) => {
    const ctx = getContext();
    if (!ctx.canEdit || tasks.length === 0) return false;
    const opId = ctx.begin(new Map(), tasks);
    const message =
      tasks.length === 1
        ? ctx.bt("카드를 추가했습니다. 초안 상태로 시작합니다.", "Card added as a draft.")
        : ctx.bt(`카드 ${tasks.length}장을 추가했습니다. 초안 상태로 시작합니다.`, `Added ${tasks.length} draft cards.`);
    try {
      await ctx.execute(
        { type: "upsert-task-batch", tasks, expectedAbsentTaskIds: tasks.map((task) => task.id) },
        message,
      );
      ctx.announce(message);
      ctx.show({ tone: "success", message });
      return true;
    } catch (cause) {
      ctx.announce("");
      ctx.show({
        tone: "error",
        message: ctx.bt("카드를 저장하지 못했어요. 입력한 제목은 그대로 두었습니다", "Couldn't save the cards. Your text was kept"),
        detail: errorText(cause, ctx.bt("변경을 저장하지 못했습니다.", "Couldn't save the change.")),
      });
      return false;
    } finally {
      ctx.settle(opId);
    }
  };

  return { moveStatus, rename, addCards };
}
