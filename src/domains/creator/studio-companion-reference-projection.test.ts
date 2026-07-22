import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_COMPANION_REFERENCE_FAILURE_BACKOFF_MS,
  STUDIO_COMPANION_REFERENCE_MAX_BYTES,
  STUDIO_COMPANION_REFERENCE_MAX_EDGE,
  STUDIO_COMPANION_REFERENCE_MAX_ITEMS,
  STUDIO_COMPANION_REFERENCE_MAX_PIXELS,
  StudioCompanionReferenceObjectUrlOwner,
  canAcceptStudioCompanionReferencePickColor,
  canAcceptStudioCompanionReferencePreviewFrame,
  isStudioCompanionReferenceControl,
  isStudioCompanionReferencePreviewFrame,
  isStudioCompanionReferenceProjection,
  planStudioCompanionReferenceCapture,
  studioCompanionReferenceFailureBackoffMs,
  type StudioCompanionReferencePreviewFrame,
} from "./studio-companion-reference-projection";

function projection(overrides: Record<string, unknown> = {}) {
  return {
    generation: 2,
    revision: 9,
    referenceRevision: 7,
    itemCount: 4,
    resolvedItemCount: 3,
    canPickColor: true,
    ...overrides,
  };
}

function frame(overrides: Partial<StudioCompanionReferencePreviewFrame> = {}) {
  return {
    generation: 2,
    revision: 9,
    referenceRevision: 7,
    sequence: 4,
    width: 1_280,
    height: 720,
    blob: new Blob([new Uint8Array(32)], { type: "image/webp" }),
    ...overrides,
  };
}

function planner(overrides: Record<string, unknown> = {}) {
  return {
    demand: true,
    current: { generation: 2, revision: 9, referenceRevision: 7 },
    lastCaptured: null,
    failure: null,
    now: 2_000,
    activeStroke: false,
    inFlight: false,
    ...overrides,
  };
}

describe("Studio companion reference projection", () => {
  it("accepts only bounded exact metadata with a consistent color-pick capability", () => {
    expect(isStudioCompanionReferenceProjection(projection())).toBe(true);
    expect(isStudioCompanionReferenceProjection(projection({
      itemCount: STUDIO_COMPANION_REFERENCE_MAX_ITEMS,
      resolvedItemCount: STUDIO_COMPANION_REFERENCE_MAX_ITEMS,
    }))).toBe(true);
    expect(isStudioCompanionReferenceProjection(projection({ itemCount: 33 }))).toBe(false);
    expect(isStudioCompanionReferenceProjection(projection({ resolvedItemCount: 5 }))).toBe(false);
    expect(isStudioCompanionReferenceProjection(projection({ resolvedItemCount: 0 }))).toBe(false);
    expect(isStudioCompanionReferenceProjection(projection({ canPickColor: false }))).toBe(true);
    expect(isStudioCompanionReferenceProjection(projection({
      resolvedItemCount: 0,
      canPickColor: false,
    }))).toBe(true);
    expect(isStudioCompanionReferenceProjection(projection({ revision: 0 }))).toBe(false);
    expect(isStudioCompanionReferenceProjection(projection({ generation: 0 }))).toBe(false);
    expect(isStudioCompanionReferenceProjection(projection({ extra: true }))).toBe(false);
  });

  it("never invokes accessors and rejects inherited or symbol pollution", () => {
    const getter = vi.fn(() => 9);
    const hostile = projection();
    Object.defineProperty(hostile, "revision", { enumerable: true, get: getter });
    expect(isStudioCompanionReferenceProjection(hostile)).toBe(false);
    expect(getter).not.toHaveBeenCalled();

    expect(isStudioCompanionReferenceProjection(Object.assign(
      Object.create({ polluted: true }),
      projection()
    ))).toBe(false);
    expect(isStudioCompanionReferenceProjection({ ...projection(), [Symbol("polluted")]: true }))
      .toBe(false);
    expect(isStudioCompanionReferenceProjection(Object.assign(
      Object.create(null) as object,
      projection()
    ))).toBe(true);
  });

  it("validates exact WebP, dimension, pixel, byte, and positive cursor bounds", () => {
    expect(isStudioCompanionReferencePreviewFrame(frame())).toBe(true);
    expect(isStudioCompanionReferencePreviewFrame(frame({
      width: STUDIO_COMPANION_REFERENCE_MAX_EDGE,
      height: Math.floor(STUDIO_COMPANION_REFERENCE_MAX_PIXELS / STUDIO_COMPANION_REFERENCE_MAX_EDGE),
      blob: new Blob(
        [new Uint8Array(STUDIO_COMPANION_REFERENCE_MAX_BYTES)],
        { type: "image/webp" }
      ),
    }))).toBe(true);
    expect(isStudioCompanionReferencePreviewFrame(frame({ width: 1_281 }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame(frame({ width: 1_280, height: 1_000 }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame(frame({ generation: 0 }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame(frame({ revision: 0 }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame(frame({ referenceRevision: 0 }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame(frame({ sequence: 0 }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame(frame({
      blob: new Blob([], { type: "image/webp" }),
    }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame(frame({
      blob: new Blob(["png"], { type: "image/png" }),
    }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame(frame({
      blob: new Blob(
        [new Uint8Array(STUDIO_COMPANION_REFERENCE_MAX_BYTES + 1)],
        { type: "image/webp" }
      ),
    }))).toBe(false);
    expect(isStudioCompanionReferencePreviewFrame({ ...frame(), extra: true })).toBe(false);
  });

  it("does not invoke frame or point accessors", () => {
    const frameGetter = vi.fn(() => 2);
    const hostileFrame = frame();
    Object.defineProperty(hostileFrame, "generation", { enumerable: true, get: frameGetter });
    expect(isStudioCompanionReferencePreviewFrame(hostileFrame)).toBe(false);
    expect(frameGetter).not.toHaveBeenCalled();

    const pointGetter = vi.fn(() => 0.5);
    const point = { x: 0.5, y: 0.5 };
    Object.defineProperty(point, "x", { enumerable: true, get: pointGetter });
    expect(isStudioCompanionReferenceControl({
      kind: "reference-pick-color",
      point,
      referenceRevision: 7,
      sequence: 4,
    })).toBe(false);
    expect(pointGetter).not.toHaveBeenCalled();
  });

  it("accepts only the two bounded exact control shapes", () => {
    expect(isStudioCompanionReferenceControl({
      kind: "reference-preview-demand",
      active: true,
    })).toBe(true);
    expect(isStudioCompanionReferenceControl({
      kind: "reference-pick-color",
      point: { x: 0, y: 1 },
      referenceRevision: 7,
      sequence: 4,
    })).toBe(true);
    expect(isStudioCompanionReferenceControl({
      kind: "reference-pick-color",
      point: { x: -0.01, y: 0.5 },
      referenceRevision: 7,
      sequence: 4,
    })).toBe(false);
    expect(isStudioCompanionReferenceControl({
      kind: "reference-pick-color",
      point: { x: Number.NaN, y: 0.5 },
      referenceRevision: 7,
      sequence: 4,
    })).toBe(false);
    expect(isStudioCompanionReferenceControl({
      kind: "reference-preview-demand",
      active: true,
      extra: true,
    })).toBe(false);
    expect(isStudioCompanionReferenceControl(Object.assign(Object.create({ active: true }), {
      kind: "reference-preview-demand",
    }))).toBe(false);
  });

  it("accepts color picks only for the active reference revision and a fresh inner sequence", () => {
    const pick = {
      kind: "reference-pick-color",
      point: { x: 0.25, y: 0.75 },
      referenceRevision: 7,
      sequence: 4,
    };
    const expected = { referenceRevision: 7, lastAcceptedSequence: 3 };

    expect(canAcceptStudioCompanionReferencePickColor(pick, expected)).toBe(true);
    expect(canAcceptStudioCompanionReferencePickColor({ ...pick, sequence: 3 }, expected)).toBe(false);
    expect(canAcceptStudioCompanionReferencePickColor({ ...pick, referenceRevision: 6 }, expected))
      .toBe(false);
  });

  it("accepts only the active generation and revisions with a strictly increasing sequence", () => {
    const expected = {
      generation: 2,
      revision: 9,
      referenceRevision: 7,
      lastAcceptedSequence: 3,
    };
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame(), expected)).toBe(true);
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame({ sequence: 3 }), expected)).toBe(false);
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame({ sequence: 2 }), expected)).toBe(false);
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame({ generation: 1 }), expected)).toBe(false);
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame({ generation: 3 }), expected)).toBe(false);
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame({ revision: 8 }), expected)).toBe(false);
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame({ revision: 10 }), expected)).toBe(false);
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame({ referenceRevision: 6 }), expected))
      .toBe(false);
    expect(canAcceptStudioCompanionReferencePreviewFrame(frame(), {
      ...expected,
      lastAcceptedSequence: Number.MAX_SAFE_INTEGER + 1,
    })).toBe(false);
  });
});

describe("Studio companion reference capture planning", () => {
  it("requires explicit demand and blocks active strokes and in-flight work", () => {
    expect(planStudioCompanionReferenceCapture(planner({ demand: false })))
      .toEqual({ kind: "skip", reason: "no-demand" });
    expect(planStudioCompanionReferenceCapture(planner({ activeStroke: true })))
      .toEqual({ kind: "skip", reason: "active-stroke" });
    expect(planStudioCompanionReferenceCapture(planner({ inFlight: true })))
      .toEqual({ kind: "skip", reason: "in-flight" });
  });

  it("captures only dirty cursors and enforces the 500ms cadence", () => {
    expect(planStudioCompanionReferenceCapture(planner())).toEqual({ kind: "capture" });
    expect(planStudioCompanionReferenceCapture(planner({
      lastCaptured: { generation: 2, revision: 9, referenceRevision: 7, at: 1_000 },
    }))).toEqual({ kind: "skip", reason: "clean" });
    expect(planStudioCompanionReferenceCapture(planner({
      current: { generation: 2, revision: 10, referenceRevision: 7 },
      lastCaptured: { generation: 2, revision: 9, referenceRevision: 7, at: 1_750 },
    }))).toEqual({ kind: "defer", delayMs: 250 });
    expect(planStudioCompanionReferenceCapture(planner({
      current: { generation: 2, revision: 10, referenceRevision: 7 },
      lastCaptured: { generation: 2, revision: 9, referenceRevision: 7, at: 1_500 },
    }))).toEqual({ kind: "capture" });
    expect(planStudioCompanionReferenceCapture(planner({
      current: { generation: 3, revision: 1, referenceRevision: 1 },
      lastCaptured: { generation: 2, revision: 99, referenceRevision: 99, at: 1_000 },
    }))).toEqual({ kind: "capture" });
  });

  it("backs off 500/1000/2000ms per matching failure and resets for new content", () => {
    expect(STUDIO_COMPANION_REFERENCE_FAILURE_BACKOFF_MS).toEqual([500, 1_000, 2_000]);
    expect([0, 1, 2, 3, 99].map(studioCompanionReferenceFailureBackoffMs))
      .toEqual([0, 500, 1_000, 2_000, 2_000]);
    for (const [count, delayMs] of [[1, 500], [2, 1_000], [3, 2_000], [20, 2_000]] as const) {
      expect(planStudioCompanionReferenceCapture(planner({
        failure: { generation: 2, revision: 9, referenceRevision: 7, count, at: 2_000 },
      }))).toEqual({ kind: "defer", delayMs });
    }
    expect(planStudioCompanionReferenceCapture(planner({
      current: { generation: 2, revision: 10, referenceRevision: 7 },
      failure: { generation: 2, revision: 9, referenceRevision: 7, count: 3, at: 2_000 },
    }))).toEqual({ kind: "capture" });
  });

  it("combines cadence and failure delays and fails closed for future or regressed state", () => {
    expect(planStudioCompanionReferenceCapture(planner({
      current: { generation: 2, revision: 10, referenceRevision: 7 },
      lastCaptured: { generation: 2, revision: 9, referenceRevision: 7, at: 1_800 },
      failure: { generation: 2, revision: 10, referenceRevision: 7, count: 2, at: 1_500 },
    }))).toEqual({ kind: "defer", delayMs: 500 });
    expect(planStudioCompanionReferenceCapture(planner({ now: -1 })))
      .toEqual({ kind: "skip", reason: "invalid" });
    expect(planStudioCompanionReferenceCapture(planner({
      lastCaptured: { generation: 3, revision: 1, referenceRevision: 1, at: 1_000 },
    }))).toEqual({ kind: "skip", reason: "invalid" });
    expect(planStudioCompanionReferenceCapture(planner({
      failure: { generation: 2, revision: 9, referenceRevision: 7, count: 1, at: 2_001 },
    }))).toEqual({ kind: "skip", reason: "invalid" });
    expect(planStudioCompanionReferenceCapture(planner({
      failure: { generation: 3, revision: 1, referenceRevision: 1, count: 1, at: 1_000 },
    }))).toEqual({ kind: "skip", reason: "invalid" });
    expect(planStudioCompanionReferenceCapture(planner({
      failure: { generation: 2, revision: 10, referenceRevision: 7, count: 1, at: 1_000 },
    }))).toEqual({ kind: "skip", reason: "invalid" });
    expect(planStudioCompanionReferenceCapture({ ...planner(), extra: true } as never))
      .toEqual({ kind: "skip", reason: "invalid" });
  });
});

describe("Studio companion reference object URL ownership", () => {
  it("stages, commits, replaces, rejects, and clears with at most two owned URLs", () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second")
      .mockReturnValueOnce("blob:third");
    const revokeObjectURL = vi.fn();
    const owner = new StudioCompanionReferenceObjectUrlOwner({ createObjectURL, revokeObjectURL });

    const first = owner.stage(frame())!;
    expect(owner.pending()).toBe(first);
    expect(owner.current()).toBeNull();
    expect(owner.ownedCount()).toBe(1);
    expect(owner.commit(first, 1_280, 720)).toBe("blob:first");
    expect(owner.commit(first, 1_280, 720)).toBeNull();
    expect(owner.current()).toBe(first);

    const second = owner.stage(frame({ sequence: 5 }))!;
    expect(owner.ownedCount()).toBe(2);
    expect(owner.reject(second)).toBe(true);
    expect(owner.reject(second)).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
    expect(owner.current()).toBe(first);

    const third = owner.stage(frame({ sequence: 6 }))!;
    expect(owner.commit(third, 1_280, 720)).toBe("blob:third");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    owner.clear();
    owner.clear();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:third");
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(owner.ownedCount()).toBe(0);
  });

  it("deduplicates pending frames and rejects stale, replayed, or forged handles", () => {
    const createObjectURL = vi.fn(() => "blob:pending");
    const revokeObjectURL = vi.fn();
    const owner = new StudioCompanionReferenceObjectUrlOwner({ createObjectURL, revokeObjectURL });
    const pending = owner.stage(frame())!;

    expect(owner.stage(frame())).toBe(pending);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(owner.commit({ ...pending }, 1_280, 720)).toBeNull();
    expect(owner.commit(pending, 1_279, 720)).toBeNull();
    expect(owner.pending()).toBeNull();
    expect(owner.stage(frame({ sequence: 5 }))).not.toBeNull();
    expect(owner.commit(owner.pending()!, 1_280, 720)).toBe("blob:pending");
    expect(owner.stage(frame())).toBeNull();
    expect(owner.stage(frame({ sequence: 3 }))).toBeNull();
    expect(owner.stage(frame({ generation: 1, sequence: 99 }))).toBeNull();
    expect(owner.ownedCount()).toBe(1);
  });

  it("releases an old pending URL before allocating a third and contains allocation failures", () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:current")
      .mockReturnValueOnce("blob:pending")
      .mockImplementationOnce(() => { throw new Error("URL budget exhausted"); });
    const revokeObjectURL = vi.fn();
    const owner = new StudioCompanionReferenceObjectUrlOwner({ createObjectURL, revokeObjectURL });
    owner.commit(owner.stage(frame())!, 1_280, 720);
    owner.stage(frame({ sequence: 5 }));

    expect(owner.stage(frame({ sequence: 6 }))).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pending");
    expect(owner.current()?.url).toBe("blob:current");
    expect(owner.pending()).toBeNull();
    expect(owner.ownedCount()).toBe(1);
  });

  it("keeps the sole pending URL until a newer allocation succeeds", () => {
    const liveUrls = new Set<string>();
    let maximumLiveUrls = 0;
    const createObjectURL = vi.fn()
      .mockImplementationOnce(() => {
        liveUrls.add("blob:pending");
        maximumLiveUrls = Math.max(maximumLiveUrls, liveUrls.size);
        return "blob:pending";
      })
      .mockImplementationOnce(() => { throw new Error("temporary allocation failure"); })
      .mockImplementationOnce(() => {
        liveUrls.add("blob:replacement");
        maximumLiveUrls = Math.max(maximumLiveUrls, liveUrls.size);
        return "blob:replacement";
      });
    const revokeObjectURL = vi.fn((url: string) => { liveUrls.delete(url); });
    const owner = new StudioCompanionReferenceObjectUrlOwner({ createObjectURL, revokeObjectURL });
    const pending = owner.stage(frame())!;

    expect(owner.stage(frame({ sequence: 5 }))).toBeNull();
    expect(owner.pending()).toBe(pending);
    expect(owner.ownedCount()).toBe(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    const replacement = owner.stage(frame({ sequence: 6 }))!;
    expect(replacement.url).toBe("blob:replacement");
    expect(owner.pending()).toBe(replacement);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pending");
    expect(maximumLiveUrls).toBe(2);
    expect(liveUrls).toEqual(new Set(["blob:replacement"]));
  });

  it("rejects a recycled pending URL string without revoking the live candidate", () => {
    const createObjectURL = vi.fn(() => "blob:pending");
    const revokeObjectURL = vi.fn();
    const owner = new StudioCompanionReferenceObjectUrlOwner({ createObjectURL, revokeObjectURL });
    const pending = owner.stage(frame())!;

    expect(owner.stage(frame({ sequence: 5 }))).toBeNull();
    expect(owner.pending()).toBe(pending);
    expect(owner.ownedCount()).toBe(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("fails closed for invalid or colliding URLs without revoking the current display", () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:current")
      .mockReturnValueOnce("https://example.com/not-owned")
      .mockReturnValueOnce("blob:current");
    const revokeObjectURL = vi.fn(() => { throw new Error("already revoked"); });
    const owner = new StudioCompanionReferenceObjectUrlOwner({ createObjectURL, revokeObjectURL });
    owner.commit(owner.stage(frame())!, 1_280, 720);

    expect(owner.stage(frame({ sequence: 5 }))).toBeNull();
    expect(owner.stage(frame({ sequence: 6 }))).toBeNull();
    expect(owner.current()?.url).toBe("blob:current");
    expect(owner.ownedCount()).toBe(1);
    owner.clear();
    expect(owner.ownedCount()).toBe(0);
  });

  it("clears current and pending entries that fall behind the authoritative revisions", () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:current")
      .mockReturnValueOnce("blob:pending");
    const revokeObjectURL = vi.fn();
    const owner = new StudioCompanionReferenceObjectUrlOwner({ createObjectURL, revokeObjectURL });
    owner.commit(owner.stage(frame())!, 1_280, 720);
    owner.stage(frame({ revision: 10, referenceRevision: 8, sequence: 5 }));

    expect(owner.clearStale({ generation: 2, revision: 10, referenceRevision: 8 })).toBe(1);
    expect(owner.current()).toBeNull();
    expect(owner.pending()?.url).toBe("blob:pending");
    expect(owner.clearStale({ generation: 3, revision: 1, referenceRevision: 1 })).toBe(1);
    expect(owner.ownedCount()).toBe(0);
    expect(owner.clearStale({ generation: 3, revision: 1, referenceRevision: 1 })).toBe(0);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("never lets an older stale threshold revoke a newer generation", () => {
    const revokeObjectURL = vi.fn();
    const owner = new StudioCompanionReferenceObjectUrlOwner({
      createObjectURL: () => "blob:new-generation",
      revokeObjectURL,
    });
    const newest = owner.stage(frame({ generation: 3, revision: 1, referenceRevision: 1 }))!;
    owner.commit(newest, 1_280, 720);

    expect(owner.clearStale({ generation: 2, revision: 99, referenceRevision: 99 })).toBe(0);
    expect(owner.current()).toBe(newest);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("uses descriptor snapshots after validation and contains hostile brand probes", () => {
    const safe = frame();
    const hostile = new Proxy(safe, {
      get() {
        throw new Error("ordinary reads are forbidden");
      },
    });
    expect(() => canAcceptStudioCompanionReferencePreviewFrame(hostile, {
      generation: 2,
      revision: 9,
      referenceRevision: 7,
      lastAcceptedSequence: 3,
    })).not.toThrow();
    expect(canAcceptStudioCompanionReferencePreviewFrame(hostile, {
      generation: 2,
      revision: 9,
      referenceRevision: 7,
      lastAcceptedSequence: 3,
    })).toBe(true);

    const createObjectURL = vi.fn(() => "blob:descriptor-snapshot");
    const owner = new StudioCompanionReferenceObjectUrlOwner({
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });
    expect(() => owner.stage(hostile)).not.toThrow();
    expect(createObjectURL).toHaveBeenCalledWith(safe.blob);

    const hostileBlob = new Proxy(safe.blob, {
      getPrototypeOf() {
        throw new Error("brand probe failed");
      },
    });
    expect(() => isStudioCompanionReferencePreviewFrame(frame({ blob: hostileBlob }))).not.toThrow();
    expect(isStudioCompanionReferencePreviewFrame(frame({ blob: hostileBlob }))).toBe(false);
  });
});
