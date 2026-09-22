import { describe, expect, it } from "vitest";

import {
  canStudioSkiaPublishOverSettledInk,
  createStudioSkiaCommittedInkHostRuntime,
  decideStudioSkiaCommittedInkDraw,
  projectStudioSkiaCommittedInkAuthority,
  projectStudioSkiaCommittedInkVisibleReceipt,
  readStudioSkiaCommittedInkSceneRevision,
} from "./studio-skia-committed-ink-bridge";

import type {
  StudioCommittedInkSurfaceHandoff,
  StudioCommittedInkVisibleDrawRequest,
} from "./studio-committed-ink-handoff-coordinator";
import type { StudioRenderSurfaceAuthority } from "./render/StudioRenderSurface";

const revision = (projectGeneration = 8) => ({
  pageId: "page-a",
  projectGeneration,
});

const request = (): StudioCommittedInkVisibleDrawRequest => ({
  token: "receipt-token",
  pageId: "page-a",
  revision: 8,
  attempt: 1,
  strokeIds: ["stroke-a"],
});

const authority = (
  status: StudioRenderSurfaceAuthority["status"],
  ownedDocumentIds: readonly string[] = ["stroke-a"],
): StudioRenderSurfaceAuthority => ({
  status,
  backendId: status === "legacy" || status === "disabled"
    ? null
    : "skia-canvaskit-document-webgl2",
  decision: null,
  reason: null,
  sceneRevision: revision(),
  ownedDocumentIds,
  visibleCanvasCount: status === "active" ? 1 : 0,
});

const handoff = (): StudioCommittedInkSurfaceHandoff => ({
  pageId: "page-a",
  strokeIds: ["stroke-a"],
  overlaySettledCount: 1,
  draftSettledCount: 0,
  gpuSettledCount: 0,
  queuedRevision: 8,
  missingPasses: 0,
  drawFailures: 0,
  drawAttemptRevision: 8,
});

describe("Skia committed-ink receipt bridge", () => {
  it("accepts only an actually visible exact-generation receipt", () => {
    const visibleReceipt = projectStudioSkiaCommittedInkVisibleReceipt({
      sceneRevision: revision(),
      ownedDocumentIds: ["stroke-a", "older"],
    });
    expect(decideStudioSkiaCommittedInkDraw({
      request: request(),
      authority: projectStudioSkiaCommittedInkAuthority(authority("active")),
      visibleReceipt,
      deferAttempt: 3,
    })).toEqual({ status: "receipted" });
  });

  it("rejects stale, wrong-page and partial visible receipts", () => {
    for (const sceneRevision of [
      revision(7),
      { pageId: "page-b", projectGeneration: 8 },
    ]) {
      expect(decideStudioSkiaCommittedInkDraw({
        request: request(),
        authority: null,
        visibleReceipt: projectStudioSkiaCommittedInkVisibleReceipt({
          sceneRevision,
          ownedDocumentIds: ["stroke-a"],
        }),
        deferAttempt: 1,
      })).toEqual({ status: "fallback" });
    }
    expect(decideStudioSkiaCommittedInkDraw({
      request: request(),
      authority: projectStudioSkiaCommittedInkAuthority(authority("active")),
      visibleReceipt: projectStudioSkiaCommittedInkVisibleReceipt({
        sceneRevision: revision(),
        ownedDocumentIds: ["another-stroke"],
      }),
      deferAttempt: 4,
    })).toEqual({ status: "hold" });
  });

  it("bounds starting waits and holds active ownership until pixels are visible", () => {
    const starting = projectStudioSkiaCommittedInkAuthority(authority("starting"));
    expect(decideStudioSkiaCommittedInkDraw({
      request: request(), authority: starting, visibleReceipt: null, deferAttempt: 0,
    })).toEqual({ status: "wait", nextDeferAttempt: 1 });
    expect(decideStudioSkiaCommittedInkDraw({
      request: request(), authority: starting, visibleReceipt: null, deferAttempt: 4,
    })).toEqual({ status: "fallback" });

    const active = projectStudioSkiaCommittedInkAuthority(authority("active"));
    expect(decideStudioSkiaCommittedInkDraw({
      request: request(), authority: active, visibleReceipt: null, deferAttempt: 2,
    })).toEqual({ status: "hold" });
  });

  it("gives the child surface one frame to publish starting state", () => {
    expect(decideStudioSkiaCommittedInkDraw({
      request: request(), authority: null, visibleReceipt: null, deferAttempt: 0,
    })).toEqual({ status: "wait", nextDeferAttempt: 1 });
    expect(decideStudioSkiaCommittedInkDraw({
      request: request(), authority: null, visibleReceipt: null, deferAttempt: 1,
    })).toEqual({ status: "fallback" });
  });

  it("falls back immediately for a matching legacy or unavailable surface", () => {
    for (const status of ["legacy", "unavailable", "disabled", "idle"] as const) {
      expect(decideStudioSkiaCommittedInkDraw({
        request: request(),
        authority: projectStudioSkiaCommittedInkAuthority(authority(status)),
        visibleReceipt: null,
        deferAttempt: 0,
      })).toEqual({ status: "fallback" });
    }
  });

  it("bypasses the first source draw only when retained pixels cover the exact queue head", () => {
    const candidate = {
      sceneRevision: revision(),
      ownedDocumentIds: ["stroke-a", "older"],
    };
    expect(canStudioSkiaPublishOverSettledInk(candidate, [handoff()])).toBe(true);
    expect(canStudioSkiaPublishOverSettledInk(
      { ...candidate, sceneRevision: revision(9) },
      [handoff()],
    )).toBe(false);
    expect(canStudioSkiaPublishOverSettledInk(
      { ...candidate, ownedDocumentIds: ["older"] },
      [handoff()],
    )).toBe(false);
    expect(canStudioSkiaPublishOverSettledInk(candidate, [{
      ...handoff(),
      overlaySettledCount: 0,
    }])).toBe(false);
  });

  it("rejects malformed scene revision metadata", () => {
    expect(readStudioSkiaCommittedInkSceneRevision({ pageId: "", projectGeneration: 1 })).toBeNull();
    expect(readStudioSkiaCommittedInkSceneRevision({ pageId: "page-a", projectGeneration: -1 })).toBeNull();
    expect(projectStudioSkiaCommittedInkVisibleReceipt({
      sceneRevision: {},
      ownedDocumentIds: ["stroke-a"],
    })).toBeNull();
  });

  it("keeps host retries and visible receipts isolated behind one runtime", () => {
    let wakeCount = 0;
    const queue = [handoff()];
    const runtime = createStudioSkiaCommittedInkHostRuntime({
      readQueue: () => queue,
      wake: () => { wakeCount += 1; },
    });

    expect(runtime.canPublishOverSettledInk({
      sceneRevision: revision(),
      ownedDocumentIds: ["stroke-a"],
    })).toBe(true);
    expect(runtime.decide(request())).toEqual({ status: "wait", nextDeferAttempt: 1 });
    runtime.defer("receipt-token", 1);
    expect(runtime.decide(request())).toEqual({ status: "fallback" });

    runtime.onAuthorityChange(authority("active"));
    expect(runtime.decide(request())).toEqual({ status: "hold" });
    runtime.onVisiblePresentation({
      sceneRevision: revision(),
      ownedDocumentIds: ["stroke-a"],
    });
    expect(runtime.decide(request())).toEqual({ status: "receipted" });
    expect(wakeCount).toBe(2);

    runtime.settle("receipt-token");
    runtime.onAuthorityChange({
      ...authority("starting"),
      sceneRevision: revision(9),
    });
    expect(runtime.decide(request())).toEqual({ status: "fallback" });
    runtime.clear();
  });
});
