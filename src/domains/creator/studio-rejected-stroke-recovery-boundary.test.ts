import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioPageCompositionSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const host = readStudioPageCompositionSource();
const pointersFinish = readFileSync(
  new URL("./studio-cuttoon-editor/studio-cuttoon-stage-pointers-finish.ts", import.meta.url),
  "utf8",
);

function sourceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function expectInOrder(source: string, needles: readonly string[]): void {
  let cursor = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle, cursor + 1);
    expect(index, `missing or out of order: ${needle}`).toBeGreaterThan(cursor);
    cursor = index;
  }
}

/**
 * ADR 0018 keeps every provider failure fail-closed: the live operation is cancelled and no other
 * renderer continues it. These boundaries pin the complementary rule added on 2026-09-02 — the
 * finished CPU geometry is parked as a recovery record *before* each cancellation, and it only
 * re-enters the document through the explicit, user-triggered restore.
 */
describe("rejected stroke recovery integration boundary", () => {
  it("parks the live stroke before the mid-stroke provider rejection discards it", () => {
    const reject = sourceBetween(
      host,
      "function rejectActiveSelectedLiveSurface(",
      "function onSelectedGpuLiveInkUnavailable(",
    );
    expectInOrder(reject, [
      "salvageRejectedStroke(drawingRef.current, providerLabel, detail)",
      "gpuLiveInkPinnedRef.current = false",
      "discardDrawingPointerSession()",
    ]);
    // The cancellation itself is unchanged: no provider handoff, no Konva promotion.
    expect(reject).not.toContain("queueDeferredStrokeCommit");
    expect(reject).not.toContain("commit(");
  });

  it("parks the finished stroke before the post-pointer-up rejection removes it from the batch", () => {
    const cancel = sourceBetween(
      host,
      "function cancelRejectedSelectedGpuPendingStroke(",
      "const [studioRasterHandoffCandidate, setStudioRasterHandoffCandidate]",
    );
    expectInOrder(cancel, [
      "recordStudioRejectedStroke({",
      "pendingStrokeCommitsRef.current = null",
      "studioCrdtDocumentRef.current?.deleteStroke(strokeId)",
    ]);
    expect(host).toContain("cancelRejectedSelectedGpuPendingStroke(strokeId, reason)");
    expect(host).toContain('cancelRejectedSelectedGpuPendingStroke(strokeId, "crdt-sync-failed")');
  });

  it("parks the sealed geometry before the pointer-up seal failure discards the session", () => {
    const seal = sourceBetween(
      pointersFinish,
      "const gpuPinnedAtRelease = gpuLiveInkPinnedRef.current;",
      "const selectedOverlaySeal =",
    );
    expectInOrder(seal, [
      'salvageRejectedStroke(finished, "WebGPU 라이브 잉크", "final-seal-missing")',
      "completedLiveStrokeBackendAudit = false",
      "discardDrawingPointerSession()",
    ]);
    const overlaySeal = sourceBetween(
      pointersFinish,
      'if (selectedOverlaySeal && selectedOverlaySeal.result.status !== "settled") {',
      "const deferCommit =",
    );
    expectInOrder(overlaySeal, [
      "salvageRejectedStroke(",
      "discardDrawingPointerSession()",
    ]);
    expect(overlaySeal).not.toContain("queueDeferredStrokeCommit");
  });

  it("restores only through the explicit user action, under a fresh id, via the ordinary commit", () => {
    const restore = sourceBetween(
      host,
      "function restoreRejectedStroke(",
      "const restoreRejectedStrokeRef = useRef(restoreRejectedStroke)",
    );
    expect(restore).toContain("record.pageId !== activePage.id");
    expect(restore).toContain("id: uid()");
    expect(restore).toContain("queueDeferredStrokeCommit(restored)");
    expect(host).toContain(
      "setStudioRejectedStrokeRestorer((record) => restoreRejectedStrokeRef.current(record))",
    );
    // ADR 0018 invariants the recovery must never erode.
    expect(host).not.toContain("promotePendingGpuAuthoritiesToKonva");
    expect(host).not.toContain("relinquishGpuLiveInkToKonva");
  });
});
