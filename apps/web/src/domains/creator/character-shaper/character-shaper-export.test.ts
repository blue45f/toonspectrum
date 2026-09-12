import { describe, expect, it, vi } from "vitest";

import { acquireCharacterExportSession, characterExportSize } from "./character-shaper-export";

import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

function host(): StudioVrmPoserHost {
  const operation = { current: null as string | null };
  return {
    vrm: {}, activeModelId: "model", captureRef: { current: { gl: {}, scene: {}, camera: {} } },
    captureOperationRef: operation,
    captureVisualAuthorityRef: { current: { identity: "original" } },
    setIsCapturing: vi.fn(),
    texturePaintMutationBlockedRef: { current: false }, wardrobeMutationBlockedRef: { current: false },
    acquireVrmCaptureOperation: vi.fn((kind: string) => {
      if (operation.current !== null) return false;
      operation.current = kind;
      return true;
    }),
    releaseVrmCaptureOperation: vi.fn(() => { operation.current = null; }),
  };
}

describe("character file export", () => {
  it.each([[360, 520, 1418, 2048], [1920, 1080, 2048, 1152], [800, 800, 2048, 2048]])(
    "preserves aspect for %i×%i", (width, height, expectedWidth, expectedHeight) => {
      expect(characterExportSize(width, height, 2048)).toEqual({ width: expectedWidth, height: expectedHeight });
    },
  );
  it.each([0, -1, NaN, Infinity])("rejects invalid source dimensions %s", (value) => {
    expect(() => characterExportSize(value, 10, 2048)).toThrow(RangeError);
  });
  it("refuses overlap with a canvas insert without modifying its locks", () => {
    const h = host(); h.captureOperationRef.current = "insert";
    expect(() => acquireCharacterExportSession(h, () => h)).toThrow("다른 캡처");
    expect(h.setIsCapturing).not.toHaveBeenCalled();
  });
  it("rejects an edited character between PSD passes", () => {
    const h = host(); const session = acquireCharacterExportSession(h, () => h);
    session.assertCurrent();
    h.captureVisualAuthorityRef.current = { identity: "edited" };
    expect(session.assertCurrent).toThrow("캐릭터가 바뀌었습니다");
    session.release();
  });
  it("rejects replacement of the model, renderer, or painted texture revision", () => {
    const h = host(); const session = acquireCharacterExportSession(h, () => h);
    h.captureRef.current.gl = {};
    expect(session.assertCurrent).toThrow("캐릭터가 바뀌었습니다");
    session.release();
  });
  it("does not release a later export after the runtime resets the operation ref", () => {
    const h = host();
    const old = acquireCharacterExportSession(h, () => h);
    h.captureOperationRef.current = null;
    const next = acquireCharacterExportSession(h, () => h);
    old.cancel();
    old.release();
    expect(h.captureOperationRef.current).toBe("export");
    expect(h.setIsCapturing).not.toHaveBeenCalledWith(false);
    expect(next.assertCurrent).not.toThrow();
    next.release();
    expect(h.captureOperationRef.current).toBeNull();
  });

  it("refuses to export while an unfinished IK command can still move the character", () => {
    const h = host(); h.pendingPersistentIkCommandRef = { current: {} };
    expect(() => acquireCharacterExportSession(h, () => h)).toThrow("관절 조절");
    expect(h.acquireVrmCaptureOperation).not.toHaveBeenCalled();
  });

  it("releases idempotently on cancellation without clearing a newer capture", () => {
    const h = host(); const session = acquireCharacterExportSession(h, () => h);
    session.cancel(); session.release();
    expect(session.signal.aborted).toBe(true);
    expect(session.assertCurrent).toThrow("취소했습니다");
    expect(h.releaseVrmCaptureOperation).toHaveBeenCalledTimes(1);
    const newer = acquireCharacterExportSession(h, () => h);
    h.captureOperationRef.current = "insert";
    newer.release();
    expect(h.captureOperationRef.current).toBe("insert");
  });
});
