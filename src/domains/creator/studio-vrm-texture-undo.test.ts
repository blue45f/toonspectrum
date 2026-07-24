import { describe, expect, it } from "vitest";

import {
  applyStudioVrmTexturePaintOp,
  createStudioVrmTextureBuffer,
  studioVrmTexturePaintOpRects,
  type StudioVrmTexturePaintOp,
} from "./studio-vrm-texture-paint-ops";
import {
  applyStudioVrmTextureUndoEntry,
  createStudioVrmTextureUndoRecorder,
  studioVrmTextureUndoEntryBytes,
} from "./studio-vrm-texture-undo";

import type { StudioVrmTextureSize } from "./studio-vrm-texture-uv";

const SIZE: StudioVrmTextureSize = { width: 128, height: 128 };

function seededBuffer(size: StudioVrmTextureSize): Uint8ClampedArray {
  const created = createStudioVrmTextureBuffer(size);
  if (!created) throw new Error("buffer");
  // 결정적 의사난수 — 복원 검증이 "0 으로 채웠더니 0 이더라" 로 통과하지 않게 한다.
  let state = 12345;
  for (let index = 0; index < created.length; index += 1) {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    created[index] = state & 0xff;
  }
  return created;
}

const DAB: StudioVrmTexturePaintOp = {
  x: 40,
  y: 40,
  radius: 9,
  hardness: 0.8,
  color: "#ff2244",
  opacity: 0.9,
  blend: "normal",
};

function paintWithRecording(
  target: Uint8ClampedArray,
  ops: readonly StudioVrmTexturePaintOp[],
  size: StudioVrmTextureSize = SIZE,
) {
  const recorder = createStudioVrmTextureUndoRecorder(target, size);
  if (!recorder) throw new Error("recorder");
  for (const op of ops) {
    recorder.recordAll(studioVrmTexturePaintOpRects(op, size));
    applyStudioVrmTexturePaintOp(target, size, op);
  }
  return recorder;
}

describe("studio-vrm-texture-undo delta", () => {
  it("restores the exact bytes of a stroke and replays it", () => {
    const target = seededBuffer(SIZE);
    const original = target.slice();

    const recorder = paintWithRecording(target, [
      DAB,
      { ...DAB, x: 52, y: 44 },
      { ...DAB, x: 64, y: 60, blend: "multiply" },
    ]);
    const painted = target.slice();
    expect(painted).not.toEqual(original);

    const entry = recorder.finish();
    expect(entry).not.toBeNull();

    expect(applyStudioVrmTextureUndoEntry(target, SIZE, entry!, "undo")).toBe(true);
    expect(target).toEqual(original);

    expect(applyStudioVrmTextureUndoEntry(target, SIZE, entry!, "redo")).toBe(true);
    expect(target).toEqual(painted);
  });

  it("stays exact when the stroke leaves an unrecorded tile inside the union bounds", () => {
    const target = seededBuffer(SIZE);
    const original = target.slice();

    // 서로 멀리 떨어진 두 dab — 합집합 rect 안에 기록되지 않은 타일이 통째로 들어간다.
    const recorder = paintWithRecording(target, [
      { ...DAB, x: 20, y: 20 },
      { ...DAB, x: 110, y: 104 },
    ]);
    const entry = recorder.finish();
    expect(entry).not.toBeNull();
    expect(entry!.rect.width).toBeGreaterThan(80);
    expect(recorder.recordedTileCount).toBeLessThan(8);

    applyStudioVrmTextureUndoEntry(target, SIZE, entry!, "undo");
    expect(target).toEqual(original);
  });

  it("records region deltas, not whole-texture snapshots", () => {
    const target = seededBuffer(SIZE);
    const recorder = paintWithRecording(target, [DAB]);
    const entry = recorder.finish();
    const fullTextureBytes = SIZE.width * SIZE.height * 4;
    expect(studioVrmTextureUndoEntryBytes(entry!)).toBeLessThan(fullTextureBytes / 8);
    // copy-on-write 는 dab 이 걸친 64×64 타일 하나만 뜬다.
    expect(recorder.recordedTileCount).toBe(1);
    expect(recorder.recordedBytes).toBe(64 * 64 * 4);
    expect(recorder.recordedBytes).toBeLessThan(fullTextureBytes);
  });

  it("captures a tile only once however many dabs hit it", () => {
    const target = seededBuffer(SIZE);
    const recorder = createStudioVrmTextureUndoRecorder(target, SIZE);
    if (!recorder) throw new Error("recorder");
    for (let step = 0; step < 40; step += 1) {
      const op = { ...DAB, x: 30 + step * 0.2, y: 30 };
      recorder.recordAll(studioVrmTexturePaintOpRects(op, SIZE));
      applyStudioVrmTexturePaintOp(target, SIZE, op);
    }
    expect(recorder.recordedTileCount).toBeLessThanOrEqual(4);
  });
});

describe("studio-vrm-texture-undo lifecycle", () => {
  it("cancel() rolls a half-finished stroke back in place", () => {
    const target = seededBuffer(SIZE);
    const original = target.slice();
    const recorder = paintWithRecording(target, [DAB, { ...DAB, x: 55 }]);
    expect(target).not.toEqual(original);
    expect(recorder.cancel()).toBeGreaterThan(0);
    expect(target).toEqual(original);
  });

  it("returns null when nothing was recorded and refuses double finish", () => {
    const target = seededBuffer(SIZE);
    const recorder = createStudioVrmTextureUndoRecorder(target, SIZE);
    expect(recorder?.finish()).toBeNull();
    expect(recorder?.finish()).toBeNull();

    const second = paintWithRecording(seededBuffer(SIZE), [DAB]);
    expect(second.finish()).not.toBeNull();
    expect(second.finish()).toBeNull();
  });

  it("ignores out-of-bounds records and mismatched buffers", () => {
    const target = seededBuffer(SIZE);
    expect(createStudioVrmTextureUndoRecorder(new Uint8ClampedArray(4), SIZE)).toBeNull();
    expect(createStudioVrmTextureUndoRecorder(target, { width: 0, height: 4 })).toBeNull();

    const recorder = createStudioVrmTextureUndoRecorder(target, SIZE);
    recorder?.record({ x: 900, y: 900, width: 4, height: 4 });
    expect(recorder?.recordedTileCount).toBe(0);
    expect(recorder?.finish()).toBeNull();
  });

  it("refuses to apply an entry whose payload no longer matches its rect", () => {
    const target = seededBuffer(SIZE);
    const entry = paintWithRecording(target, [DAB]).finish();
    expect(entry).not.toBeNull();
    const corrupted = { ...entry!, before: new Uint8ClampedArray(4) };
    expect(applyStudioVrmTextureUndoEntry(target, SIZE, corrupted, "undo")).toBe(false);
    expect(applyStudioVrmTextureUndoEntry(new Uint8ClampedArray(4), SIZE, entry!, "undo")).toBe(
      false,
    );
  });

  it("clips a recorded rect that hangs off the texture edge", () => {
    const target = seededBuffer(SIZE);
    const original = target.slice();
    const edge: StudioVrmTexturePaintOp = { ...DAB, x: 1, y: 1 };
    const recorder = paintWithRecording(target, [edge]);
    const entry = recorder.finish();
    expect(entry?.rect.x).toBe(0);
    expect(entry?.rect.y).toBe(0);
    applyStudioVrmTextureUndoEntry(target, SIZE, entry!, "undo");
    expect(target).toEqual(original);
  });
});
