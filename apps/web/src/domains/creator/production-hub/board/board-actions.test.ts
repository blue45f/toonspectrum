import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { describe, expect, it, vi } from "vitest";

import type { ProductionClientCommand } from "../production-api";

import { applyOptimisticOps, type OptimisticBoardOp } from "./board-optimistic";
import { createBoardActions, type BoardActionContext } from "./board-actions";
import { boardTask, smallBoardFixture } from "./board-fixtures";
import type { BoardToastMessage } from "./BoardToast";

type Toast = Omit<BoardToastMessage, "id">;

/** 화면 데이터·저장 응답·알림을 흉내 내는 작은 환경. `execute`가 성공하면 서버 데이터가 바뀐다. */
function setup(initial: ProductionProjectAggregate = smallBoardFixture(), options: { failWith?: Error; canEdit?: boolean; onOpenWorkflow?: () => void } = {}) {
  const state = { aggregate: initial };
  const ops: OptimisticBoardOp[] = [];
  const toasts: Toast[] = [];
  const notices: string[] = [];
  const commands: ProductionClientCommand[] = [];
  const settled: number[] = [];
  const execute = vi.fn(async (command: ProductionClientCommand) => {
    commands.push(command);
    if (options.failWith) throw options.failWith;
    if (command.type === "transition-task-batch") {
      const byId = new Map(command.transitions.map((entry) => [entry.taskId, entry.toStatus]));
      state.aggregate = { ...state.aggregate, tasks: state.aggregate.tasks.map((task) => (byId.has(task.id) ? { ...task, status: byId.get(task.id) ?? task.status } : task)) };
    } else if (command.type === "upsert-task-batch") {
      const byId = new Map(command.tasks.map((task) => [task.id, task]));
      state.aggregate = {
        ...state.aggregate,
        tasks: [...state.aggregate.tasks.map((task) => byId.get(task.id) ?? task), ...command.tasks.filter((task) => !state.aggregate.tasks.some((entry) => entry.id === task.id))],
      };
    }
  });
  const getContext = (): BoardActionContext => ({
    aggregate: applyOptimisticOps(state.aggregate, ops),
    canEdit: options.canEdit ?? true,
    execute,
    begin: (patches, added = []) => {
      const id = ops.length + 1;
      ops.push({ id, patches, added });
      return id;
    },
    settle: (id) => {
      settled.push(id);
      ops.splice(0, ops.length, ...ops.filter((op) => op.id !== id));
    },
    bt: (ko) => ko,
    show: (toast) => toasts.push(toast),
    announce: (message) => notices.push(message),
    onOpenWorkflow: options.onOpenWorkflow,
  });
  return { actions: createBoardActions(getContext), state, ops, toasts, notices, commands, settled, execute };
}

describe("보드 저장 동작", () => {
  it("이동은 화면을 먼저 바꾸고 기존 명령으로 저장한 뒤 덧씌움을 지운다", async () => {
    const env = setup();
    let duringSave: string | undefined;
    env.execute.mockImplementationOnce(async () => {
      duringSave = env.ops[0]?.patches.get("board-ready")?.status;
    });
    const saved = await env.actions.moveStatus(["board-ready"], "in-progress", { columnLabel: "제작 중" });
    expect(saved).toBe(true);
    expect(duringSave).toBe("in-progress");
    expect(env.ops).toEqual([]);
    expect(env.settled).toEqual([1]);
    expect(env.notices.at(-1)).toBe("1개 작업을 제작 중 상태로 이동했습니다.");
    expect(env.toasts.at(-1)).toMatchObject({ tone: "success" });
  });

  it("규칙상 되돌릴 수 없는 이동에는 되돌리기 버튼 대신 이유를 알려 준다", async () => {
    const env = setup();
    await env.actions.moveStatus(["board-ready"], "in-progress", { columnLabel: "제작 중" });
    const toast = env.toasts.at(-1);
    expect(toast?.action).toBeUndefined();
    expect(toast?.detail).toContain("되돌릴 수 없습니다");
  });

  it("되돌릴 수 있는 이동은 되돌리기를 눌러 원래 상태로 돌린다", async () => {
    const env = setup();
    await env.actions.moveStatus(["board-ready"], "blocked", { columnLabel: "막힘·보류" });
    const toast = env.toasts.at(-1);
    expect(toast?.action?.label).toBe("되돌리기");
    toast?.action?.run();
    await vi.waitFor(() => expect(env.commands).toHaveLength(2));
    expect(env.commands[1]).toEqual({ type: "transition-task-batch", transitions: [{ taskId: "board-ready", fromStatus: "blocked", toStatus: "ready" }] });
    await vi.waitFor(() => expect(env.state.aggregate.tasks.find((task) => task.id === "board-ready")?.status).toBe("ready"));
  });

  it("동시 작업 한도를 넘으면 저장하지 않고 경고와 공정 설정 바로가기를 보여 준다", async () => {
    const base = smallBoardFixture();
    const aggregate = { ...base, tasks: [...base.tasks, boardTask({ id: "busy", status: "in-progress" })] };
    const openWorkflow = vi.fn();
    const env = setup(aggregate, { onOpenWorkflow: openWorkflow });
    const saved = await env.actions.moveStatus(["board-ready"], "in-progress", { columnLabel: "제작 중" });
    expect(saved).toBe(false);
    expect(env.execute).not.toHaveBeenCalled();
    expect(env.ops).toEqual([]);
    const toast = env.toasts.at(-1);
    expect(toast?.tone).toBe("warning");
    expect(toast?.message).toContain("동시에 1개까지만");
    expect(toast?.detail).toContain("동시 작업 제한");
    toast?.action?.run();
    expect(openWorkflow).toHaveBeenCalledTimes(1);
  });

  it("저장에 실패하면 원래대로 돌리고 함께 한 일도 되돌리며 이유를 알린다", async () => {
    const env = setup(smallBoardFixture(), { failWith: new Error("동시 수정 충돌") });
    const rollback = vi.fn();
    const optimistic = vi.fn();
    const saved = await env.actions.moveStatus(["board-ready"], "blocked", { columnLabel: "막힘·보류", onOptimistic: optimistic, onRollback: rollback });
    expect(saved).toBe(false);
    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(env.ops).toEqual([]);
    expect(env.toasts.at(-1)).toMatchObject({ tone: "error", detail: "동시 수정 충돌" });
    expect(env.notices.at(-1)).toBe("");
  });

  it("편집 권한이 없으면 아무것도 보내지 않는다", async () => {
    const env = setup(smallBoardFixture(), { canEdit: false });
    expect(await env.actions.moveStatus(["board-ready"], "blocked", { columnLabel: "막힘" })).toBe(false);
    expect(await env.actions.rename(smallBoardFixture().tasks[0] ?? boardTask({ id: "x" }), "새 이름")).toBe(false);
    expect(await env.actions.addCards([boardTask({ id: "n", status: "draft" })])).toBe(false);
    expect(env.execute).not.toHaveBeenCalled();
  });

  it("제목 수정은 기존 카드를 기대값으로 보내 동시 수정을 막고 되돌릴 수 있다", async () => {
    const env = setup();
    const task = env.state.aggregate.tasks[0];
    if (!task) throw new Error("fixture");
    expect(await env.actions.rename(task, "  새 제목  ")).toBe(true);
    expect(env.commands[0]).toMatchObject({ type: "upsert-task-batch", expectedTasks: [task], tasks: [{ id: task.id, title: "새 제목" }] });
    const toast = env.toasts.at(-1);
    toast?.action?.run();
    await vi.waitFor(() => expect(env.commands).toHaveLength(2));
    expect(env.commands[1]).toMatchObject({ tasks: [{ id: task.id, title: task.title }] });
  });

  it("같은 제목이거나 빈 제목은 저장하지 않는다", async () => {
    const env = setup();
    const task = env.state.aggregate.tasks[0];
    if (!task) throw new Error("fixture");
    expect(await env.actions.rename(task, task.title)).toBe(false);
    expect(await env.actions.rename(task, "   ")).toBe(false);
    expect(env.execute).not.toHaveBeenCalled();
  });

  it("새 카드는 저장 전에도 보이고 이미 있는 id는 서버가 막도록 기대값을 보낸다", async () => {
    const env = setup();
    const fresh = boardTask({ id: "fresh", status: "draft", title: "새 카드" });
    let during: readonly string[] = [];
    env.execute.mockImplementationOnce(async (command) => {
      // 바꿔 끼운 구현은 기본 구현(명령 기록)을 대신하므로 직접 남긴다.
      env.commands.push(command);
      during = env.ops.flatMap((op) => op.added.map((task) => task.id));
    });
    expect(await env.actions.addCards([fresh])).toBe(true);
    expect(during).toEqual(["fresh"]);
    expect(env.commands[0]).toMatchObject({ type: "upsert-task-batch", expectedAbsentTaskIds: ["fresh"] });
    expect(env.notices.at(-1)).toContain("초안");
  });

  it("카드 추가에 실패하면 입력을 유지했다고 알린다", async () => {
    const env = setup(smallBoardFixture(), { failWith: new Error("저장소 오류") });
    expect(await env.actions.addCards([boardTask({ id: "fresh", status: "draft" })])).toBe(false);
    expect(env.toasts.at(-1)).toMatchObject({ tone: "error", detail: "저장소 오류" });
    expect(env.toasts.at(-1)?.message).toContain("그대로");
  });
});
