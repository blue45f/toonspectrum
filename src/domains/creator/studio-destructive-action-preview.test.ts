import { afterEach, describe, expect, it, vi } from "vitest";

import {
  confirmStudioDestructiveAction,
  dismissStudioDestructiveActionRecord,
  formatStudioDestructivePreview,
  getStudioDestructiveActionRecord,
  recordStudioDestructiveOutcome,
  resetStudioDestructiveActionLedger,
  runStudioDestructiveAction,
  setStudioDestructiveConfirmPresenter,
  STUDIO_DESTRUCTIVE_IRREVERSIBLE_HINT,
  STUDIO_DESTRUCTIVE_UNDO_HINT,
  subscribeStudioDestructiveActionLedger,
  summarizeStudioDestructiveLosses,
} from "./studio-destructive-action-preview";
import {
  settleStudioDestructiveCommit,
  studioApplyTemplateRequest,
  studioDeleteCheckpointRequest,
  studioRemoveEmeresUnderlaysRequest,
  studioRestoreCheckpointRequest,
} from "./studio-destructive-command-catalog";

afterEach(() => {
  resetStudioDestructiveActionLedger();
});

describe("destructive action preview", () => {
  it("shows exactly what disappears, what replaces it, and that undo works", () => {
    const preview = formatStudioDestructivePreview(
      studioApplyTemplateRequest({ elementCount: 12, frameCount: 4 }),
    );

    expect(preview).toContain("템플릿 적용");
    expect(preview).toContain("사라지는 것");
    expect(preview).toContain("· 현재 페이지의 요소 12개");
    expect(preview).toContain("대신 들어오는 것");
    expect(preview).toContain("· 템플릿 컷 4개");
    expect(preview).toContain(STUDIO_DESTRUCTIVE_UNDO_HINT);
  });

  it("keeps the note about what survives", () => {
    const preview = formatStudioDestructivePreview(
      studioRemoveEmeresUnderlaysRequest(7),
    );
    expect(preview).toContain("· 이메레스 밑그림 7개 (그 위에 그린 펜 선은 지워지지 않아요)");
  });

  it("names the irreversible loss instead of promising undo", () => {
    const preview = formatStudioDestructivePreview(
      studioDeleteCheckpointRequest({
        checkpointName: "1화 완성본",
        savedAtLabel: "2026-08-01",
      }),
    );

    expect(preview).toContain("복구 지점 '1화 완성본'");
    expect(preview).toContain("2026-08-01에 저장된 스냅샷");
    expect(preview).toContain(STUDIO_DESTRUCTIVE_IRREVERSIBLE_HINT);
    expect(preview).not.toContain(STUDIO_DESTRUCTIVE_UNDO_HINT);
  });

  it("states the undo scope limit when undo only covers part of the document", () => {
    const preview = formatStudioDestructivePreview(
      studioRestoreCheckpointRequest({ checkpointName: "초안", currentPageCount: 3 }),
    );

    expect(preview).toContain(STUDIO_DESTRUCTIVE_UNDO_HINT);
    expect(preview).toContain("제목·설명·마스터 같은 문서 정보는 되돌아오지 않아요");
  });

  it("summarizes losses for the status rail", () => {
    expect(
      summarizeStudioDestructiveLosses(
        studioRestoreCheckpointRequest({ checkpointName: "초안", currentPageCount: 3 }),
      ),
    ).toBe("현재 페이지 3개 · 현재 제목·설명·마스터·캐릭터 설정");
  });

  it("refuses to destroy when no confirmation surface exists", () => {
    const original = Reflect.get(globalThis, "confirm");
    Reflect.deleteProperty(globalThis, "confirm");
    try {
      expect(
        confirmStudioDestructiveAction(studioRemoveEmeresUnderlaysRequest(1)),
      ).toBe(false);
    } finally {
      if (original !== undefined) Reflect.set(globalThis, "confirm", original);
    }
  });
});

describe("destructive action transaction", () => {
  it("does not run the destruction when the user declines", () => {
    setStudioDestructiveConfirmPresenter(() => false);
    const execute = vi.fn();

    const status = runStudioDestructiveAction({
      request: studioRemoveEmeresUnderlaysRequest(3),
      execute,
    });

    expect(status).toBe("declined");
    expect(execute).not.toHaveBeenCalled();
    expect(getStudioDestructiveActionRecord()).toBeNull();
  });

  it("records a committed destruction with a working undo handle", () => {
    setStudioDestructiveConfirmPresenter(() => true);
    const undo = vi.fn();

    const status = runStudioDestructiveAction({
      request: studioRemoveEmeresUnderlaysRequest(3),
      execute: () => true,
      undo,
      now: () => 5,
    });

    expect(status).toBe("committed");
    const record = getStudioDestructiveActionRecord();
    expect(record?.outcome).toBe("committed");
    expect(record?.at).toBe(5);
    expect(record?.summary).toContain("이메레스 밑그림 3개");
    record?.undo?.();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("never leaves a refused commit silent — the audit's ignored-return-value hole", () => {
    setStudioDestructiveConfirmPresenter(() => true);

    const status = runStudioDestructiveAction({
      request: studioApplyTemplateRequest({ elementCount: 4, frameCount: 2 }),
      execute: () => false,
      undo: () => undefined,
    });

    expect(status).toBe("refused");
    const record = getStudioDestructiveActionRecord();
    expect(record?.outcome).toBe("refused");
    expect(record?.summary).toContain("적용하지 못했습니다");
    // 아무 일도 일어나지 않은 명령에 실행 취소를 제안하지 않는다.
    expect(record?.undo).toBeNull();
  });

  it("records a thrown destruction instead of swallowing it", () => {
    setStudioDestructiveConfirmPresenter(() => true);

    const status = runStudioDestructiveAction({
      request: studioApplyTemplateRequest({ elementCount: 4, frameCount: 2 }),
      execute: () => {
        throw new Error("문서가 잠겼습니다");
      },
    });

    expect(status).toBe("failed");
    expect(getStudioDestructiveActionRecord()?.summary).toContain("문서가 잠겼습니다");
  });

  it("offers no undo for an irreversible destruction even if a handle is passed", () => {
    recordStudioDestructiveOutcome({
      request: studioDeleteCheckpointRequest({ checkpointName: "초안" }),
      outcome: "committed",
      undo: () => undefined,
    });

    const record = getStudioDestructiveActionRecord();
    expect(record?.undo).toBeNull();
    expect(record?.summary).toContain("영구히 지웠어요");
  });

  it("notifies ledger subscribers and clears on dismiss", () => {
    const listener = vi.fn();
    subscribeStudioDestructiveActionLedger(listener);

    settleStudioDestructiveCommit(
      studioRemoveEmeresUnderlaysRequest(2),
      true,
      () => undefined,
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStudioDestructiveActionRecord()).not.toBeNull();

    dismissStudioDestructiveActionRecord("studio.emeres.remove-underlays");
    expect(getStudioDestructiveActionRecord()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores a dismiss aimed at a different record", () => {
    settleStudioDestructiveCommit(studioRemoveEmeresUnderlaysRequest(2), true);
    dismissStudioDestructiveActionRecord("studio.template.apply");
    expect(getStudioDestructiveActionRecord()).not.toBeNull();
  });

  it("passes the commit result straight through so callers keep their control flow", () => {
    expect(
      settleStudioDestructiveCommit(studioRemoveEmeresUnderlaysRequest(1), true),
    ).toBe(true);
    expect(
      settleStudioDestructiveCommit(studioRemoveEmeresUnderlaysRequest(1), false),
    ).toBe(false);
  });
});
