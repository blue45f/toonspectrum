import { describe, expect, it } from "vitest";

import {
  appendStudioLiquifyPointerPoint,
  beginStudioLiquifyPointerSession,
  endStudioLiquifyPointerSession,
} from "./studio-liquify-pointer";

const frame = { x: 0, y: 0, width: 100, height: 100 };

describe("studio liquify pointer ownership", () => {
  it.each(["twirl-clockwise", "twirl-counterclockwise", "pinch", "bloat"] as const)(
    "%s는 이동하지 않은 단일 탭을 한 점 dab으로 적용한다",
    (mode) => {
      const point = { x: 0.4, y: 0.6 };
      const session = beginStudioLiquifyPointerSession({
        elId: "image-1",
        frame,
        point,
        pointer: { pointerId: 2, pointerType: "pen", isPrimary: true },
        mode,
      })!;

      expect(session.mode).toBe(mode);
      expect(endStudioLiquifyPointerSession(
        session,
        { pointerId: 2, pointerType: "pen" },
        { cancelled: false, releasePoint: point }
      )).toEqual({
        kind: "apply",
        session: null,
        elId: "image-1",
        points: [point],
      });
    }
  );

  it("Push와 생략된 기존 호출은 이동하지 않은 단일 탭을 계속 버린다", () => {
    for (const mode of [undefined, "push"] as const) {
      const point = { x: 0.3, y: 0.3 };
      const session = beginStudioLiquifyPointerSession({
        elId: "image-1",
        frame,
        point,
        pointer: { pointerId: 9, pointerType: "mouse" },
        mode,
      })!;
      expect(session.mode).toBe("push");
      expect(endStudioLiquifyPointerSession(
        session,
        { pointerId: 9 },
        { cancelled: false, releasePoint: point }
      )).toEqual({ kind: "discarded", session: null });
    }
  });

  it("포인터다운 모드를 세션에 고정해 도중 UI 변경과 무관하게 단일 dab 자격을 보존한다", () => {
    const point = { x: 0.5, y: 0.5 };
    const session = beginStudioLiquifyPointerSession({
      elId: "image-1",
      frame,
      point,
      pointer: { pointerId: 15, pointerType: "touch" },
      mode: "pinch",
    })!;
    // 상위 UI가 이후 Push로 바뀌어도 end API는 외부 mode를 다시 읽지 않고 세션 스냅샷만 사용한다.
    expect(endStudioLiquifyPointerSession(
      session,
      { pointerId: 15 },
      { cancelled: false }
    ).kind).toBe("apply");
    expect(session.mode).toBe("pinch");
  });

  it("preserves a fast drag by consuming the final release sample", () => {
    const session = beginStudioLiquifyPointerSession({
      elId: "image-1",
      frame,
      point: { x: 0.1, y: 0.1 },
      pointer: { pointerId: 7, pointerType: "pen", isPrimary: true },
    });
    expect(session).not.toBeNull();
    expect(endStudioLiquifyPointerSession(
      session!,
      { pointerId: 7, pointerType: "pen" },
      { cancelled: false, releasePoint: { x: 0.4, y: 0.3 } }
    )).toEqual({
      kind: "apply",
      session: null,
      elId: "image-1",
      points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.3 }],
    });
  });

  it("applies an outside release from the owned pointer", () => {
    const session = beginStudioLiquifyPointerSession({
      elId: "image-1",
      frame,
      point: { x: 0.2, y: 0.2 },
      pointer: { pointerId: 3, pointerType: "mouse" },
    })!;
    const moved = appendStudioLiquifyPointerPoint(
      session,
      { pointerId: 3 },
      { x: 1.2, y: 0.8 }
    );
    expect(endStudioLiquifyPointerSession(
      moved,
      { pointerId: 3 },
      { cancelled: false, releasePoint: { x: 1.4, y: 0.9 } }
    ).kind).toBe("apply");
  });

  it("cancels without applying on pointercancel", () => {
    const session = beginStudioLiquifyPointerSession({
      elId: "image-1",
      frame,
      point: { x: 0.2, y: 0.2 },
      pointer: { pointerId: 4, pointerType: "touch" },
    })!;
    expect(endStudioLiquifyPointerSession(
      session,
      { pointerId: 4 },
      { cancelled: true, releasePoint: { x: 0.8, y: 0.8 } }
    )).toEqual({ kind: "cancelled", session: null });
  });

  it("단일 dab 가능 모드도 cancel이면 적용하지 않고, foreign pointer end는 소유 세션을 유지한다", () => {
    const session = beginStudioLiquifyPointerSession({
      elId: "image-1",
      frame,
      point: { x: 0.2, y: 0.2 },
      pointer: { pointerId: 21, pointerType: "touch", isPrimary: true },
      mode: "bloat",
    })!;

    expect(endStudioLiquifyPointerSession(
      session,
      { pointerId: 22, pointerType: "touch" },
      { cancelled: false }
    )).toEqual({ kind: "ignored", session });
    expect(endStudioLiquifyPointerSession(
      session,
      { pointerId: 21, pointerType: "touch" },
      { cancelled: true }
    )).toEqual({ kind: "cancelled", session: null });
  });

  it("ignores a second finger without cancelling the owned first finger", () => {
    const session = beginStudioLiquifyPointerSession({
      elId: "image-1",
      frame,
      point: { x: 0.2, y: 0.2 },
      pointer: { pointerId: 11, pointerType: "touch", isPrimary: true },
    })!;
    expect(beginStudioLiquifyPointerSession({
      elId: "image-1",
      frame,
      point: { x: 0.8, y: 0.8 },
      pointer: { pointerId: 12, pointerType: "touch", isPrimary: false },
    })).toBeNull();
    expect(endStudioLiquifyPointerSession(
      session,
      { pointerId: 12, pointerType: "touch", isPrimary: false },
      { cancelled: false, releasePoint: { x: 0.8, y: 0.8 } }
    )).toEqual({ kind: "ignored", session });
  });
});
