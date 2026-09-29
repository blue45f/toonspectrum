// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/shared/lib/toast-store";

import type { ProductionClientCommand } from "./production-api";
import { useOptimisticProductionCommand } from "./use-optimistic-production-command";

vi.mock("@/shared/lib/toast-store", () => ({
  toast: vi.fn(),
}));

const mockedToast = vi.mocked(toast);

const COMMAND = {
  type: "instantiate-workflow",
  episodeId: "ep-1",
  workflowRevision: 3,
  instanceId: "inst-1",
} as ProductionClientCommand;

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(execute: (command: ProductionClientCommand, message: string) => Promise<void>) {
  return renderHook(() => useOptimisticProductionCommand({ execute }));
}

describe("useOptimisticProductionCommand", () => {
  it("성공 시 낙관적 적용 → 실행 → 성공 토스트 순서로 동작한다", async () => {
    const order: string[] = [];
    const execute = vi.fn().mockImplementation(async () => {
      order.push("execute");
    });
    const { result } = setup(execute);

    await act(async () => {
      await result.current.run({
        key: "task-move",
        command: COMMAND,
        message: "이동 중",
        successMessage: "이동했습니다",
        applyOptimistic: () => order.push("optimistic"),
        rollback: () => order.push("rollback"),
      });
    });

    expect(order).toEqual(["optimistic", "execute"]);
    expect(execute).toHaveBeenCalledWith(COMMAND, "이동 중");
    expect(mockedToast).toHaveBeenCalledWith("이동했습니다", { tone: "success" });
    expect(result.current.isPending("task-move")).toBe(false);
  });

  it("successMessage가 없으면 message를 성공 토스트로 사용한다", async () => {
    const { result } = setup(vi.fn().mockResolvedValue(undefined));

    await act(async () => {
      await result.current.run({ key: "k", command: COMMAND, message: "저장 중" });
    });

    expect(mockedToast).toHaveBeenCalledWith("저장 중", { tone: "success" });
  });

  it("실패 시 rollback 후 에러 토스트를 띄우고 에러를 다시 던진다", async () => {
    const rollback = vi.fn();
    const execute = vi.fn().mockRejectedValue(new Error("충돌"));
    const { result } = setup(execute);

    await act(async () => {
      await expect(
        result.current.run({
          key: "k",
          command: COMMAND,
          message: "승인 중",
          rollback,
        }),
      ).rejects.toThrow("충돌");
    });

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(mockedToast).toHaveBeenCalledWith(expect.stringContaining("실패했습니다"), { tone: "error" });
    expect(result.current.isPending("k")).toBe(false);
  });

  it("같은 키로 실행 중이면 중복 실행을 무시한다", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn().mockImplementation(() => gate);
    const { result } = setup(execute);

    let first: Promise<void>;
    act(() => {
      first = result.current.run({ key: "dup", command: COMMAND, message: "실행 중" });
    });
    expect(result.current.isPending("dup")).toBe(true);

    // 두 번째 호출은 무시된다
    await act(async () => {
      await result.current.run({ key: "dup", command: COMMAND, message: "실행 중" });
    });
    expect(execute).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await first;
    });
    expect(result.current.isPending("dup")).toBe(false);
    // 완료 후에는 다시 실행할 수 있다
    await act(async () => {
      await result.current.run({ key: "dup", command: COMMAND, message: "실행 중" });
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
