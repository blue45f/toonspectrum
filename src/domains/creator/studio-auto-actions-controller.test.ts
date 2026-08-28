import { describe, expect, it } from "vitest";

import { createStudioAutoActionsController } from "./studio-auto-actions-controller";

import type { StudioAutoActionPlan, StudioAutoActionSet } from "./studio-auto-actions";
import type { StudioAutoActionsControllerDeps } from "./studio-auto-actions-controller";

/**
 * P2 리뷰 회귀: busy 는 렌더에 캡처된 상태라 `saveNamedCheckpoint` 대기 중의 재클릭을 막지
 * 못했다 — 두 호출이 모두 가드를 통과해 같은 플랜을 동시에 두 번 실행했다. abort ref 가
 * 첫 await 전에 동기 in-flight 가드로 선점하는지를 고정한다.
 */
function makeDeps(): {
  deps: StudioAutoActionsControllerDeps<number>;
  checkpointCalls: string[];
  resolveCheckpoint: (ok: boolean) => void;
  errors: (string | null)[];
} {
  const checkpointCalls: string[] = [];
  const errors: (string | null)[] = [];
  let resolveCheckpoint: (ok: boolean) => void = () => {};
  const deps: StudioAutoActionsControllerDeps<number> = {
    autoActionSet: { name: "재진입 시험" } as StudioAutoActionSet,
    autoActionScope: { kind: "current" },
    autoActionPlan: {
      failures: [],
      mutationCount: 2,
    } as unknown as StudioAutoActionPlan,
    autoActionBusy: false,
    pages: [],
    currentPageId: "page-1",
    autoActionAbortRef: { current: null },
    setAutoActionsOpen: () => {},
    setAutoActionError: (message) => {
      errors.push(message);
    },
    setAutoActionStatus: () => {},
    setAutoActionSet: () => {},
    setAutoActionScope: () => {},
    setAutoActionSelectedPageIds: () => {},
    setAutoActionPlan: () => {},
    setAutoActionBusy: () => {},
    setAutoActionProgress: () => {},
    saveNamedCheckpoint: (name) => {
      checkpointCalls.push(name);
      return new Promise<boolean>((resolve) => {
        resolveCheckpoint = resolve;
      });
    },
    captureStudioMutationTicket: () => 1,
    canApplyStudioMutation: () => true,
    commitPages: () => true,
    setError: () => {},
  };
  return {
    deps,
    checkpointCalls,
    resolveCheckpoint: (ok) => resolveCheckpoint(ok),
    errors,
  };
}

describe("createStudioAutoActionsController — executeAutoAction 재진입 가드", () => {
  it("blocks a second Execute while the safety checkpoint is still pending", async () => {
    const { deps, checkpointCalls, resolveCheckpoint, errors } = makeDeps();
    const controller = createStudioAutoActionsController(deps);

    const first = controller.executeAutoAction();
    // 체크포인트 대기 중의 더블클릭 — 같은 렌더의 컨트롤러를 다시 부른다.
    await controller.executeAutoAction();
    expect(checkpointCalls).toHaveLength(1);
    // 첫 await 전에 abort ref 가 선점되어 체크포인트 중 취소도 가능해진다.
    expect(deps.autoActionAbortRef.current).not.toBeNull();

    resolveCheckpoint(false);
    await first;
    expect(errors).toContain("안전 복구 지점을 만들지 못해 실행을 중단했어요.");
    // finally 정리 후에는 다음 실행이 다시 허용된다.
    expect(deps.autoActionAbortRef.current).toBeNull();
    const third = controller.executeAutoAction();
    expect(checkpointCalls).toHaveLength(2);
    resolveCheckpoint(false);
    await third;
  });
});
