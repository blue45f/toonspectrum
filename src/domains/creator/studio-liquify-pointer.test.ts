import { describe, expect, it } from "vitest";

import {
  appendStudioLiquifyPointerPoint,
  beginStudioLiquifyPointerSession,
  endStudioLiquifyPointerSession,
} from "./studio-liquify-pointer";

const frame = { x: 0, y: 0, width: 100, height: 100 };

describe("studio liquify pointer ownership", () => {
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
