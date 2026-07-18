import { describe, expect, it } from "vitest";

import {
  addStudioCommentThread,
  createEmptyStudioCommentsDocument,
  listStudioCommentThreadsForAnchor,
  type StudioCommentActor,
  type StudioCommentAnchor,
  type StudioCommentsDocument,
} from "./studio-comments";
import { projectStudioCanvasCommentPins } from "./studio-live-canvas-overlay-model";

const AUTHOR: StudioCommentActor = { id: "author-1", displayName: "편집자" };

function addThread(
  document: StudioCommentsDocument,
  id: string,
  anchor: StudioCommentAnchor,
  updatedAt: string
): StudioCommentsDocument {
  return addStudioCommentThread(
    document,
    { id, anchor, author: AUTHOR, body: `${id} 검토` },
    new Date(updatedAt)
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolvedPinCenter(
  pin: ReturnType<typeof projectStudioCanvasCommentPins>[number],
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth = 390,
  viewportHeight = 667
): { x: number; y: number } {
  return {
    x: clamp(
      (pin.x / canvasWidth) * viewportWidth + (pin.screenOffsetX ?? 0),
      22,
      viewportWidth - 22
    ),
    y: clamp(
      (pin.y / canvasHeight) * viewportHeight + (pin.screenOffsetY ?? 0),
      22,
      viewportHeight - 22
    ),
  };
}

function centerDistance(
  first: { x: number; y: number },
  second: { x: number; y: number }
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

describe("projectStudioCanvasCommentPins", () => {
  it("keeps clustered point pins and exact-location filtering on the same canonical identity", () => {
    const firstAnchor: StudioCommentAnchor = {
      type: "point",
      pageId: "page-1",
      x: 0.123441,
      y: 0.876541,
    };
    const nearbyAnchor: StudioCommentAnchor = {
      type: "point",
      pageId: "page-1",
      x: 0.123449,
      y: 0.876549,
    };
    const separateAnchor: StudioCommentAnchor = {
      type: "point",
      pageId: "page-1",
      x: 0.12356,
      y: 0.87666,
    };
    let document = createEmptyStudioCommentsDocument();
    document = addThread(document, "thread-near-old", firstAnchor, "2026-07-18T00:00:00.000Z");
    document = addThread(document, "thread-far", separateAnchor, "2026-07-18T00:01:00.000Z");
    document = addThread(document, "thread-near-new", nearbyAnchor, "2026-07-18T00:02:00.000Z");

    const pins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 1_000,
      canvasHeight: 2_000,
      boundsByElementId: new Map(),
      unreadThreadIds: new Set(["thread-near-new", "thread-far"]),
    });

    expect(pins).toHaveLength(2);
    const clustered = pins.find((pin) => pin.count === 2);
    expect(clustered).toMatchObject({
      threadIds: ["thread-near-old", "thread-near-new"],
      newestThreadId: "thread-near-new",
      newestUnreadThreadId: "thread-near-new",
      unreadCount: 1,
    });
    expect(clustered).toBeDefined();
    expect(
      listStudioCommentThreadsForAnchor(document, clustered!.anchor, { includeResolved: false })
        .map(({ id }) => id)
    ).toEqual(clustered!.threadIds);
  });

  it("collapses legacy frame metadata when the page-global element target is identical", () => {
    let document = createEmptyStudioCommentsDocument();
    document = addThread(
      document,
      "thread-frame-1",
      {
        type: "element",
        pageId: "page-1",
        frameId: "frame-1",
        elementId: "shared-element-id",
      },
      "2026-07-18T00:00:00.000Z"
    );
    document = addThread(
      document,
      "thread-frame-2",
      {
        type: "element",
        pageId: "page-1",
        frameId: "frame-2",
        elementId: "shared-element-id",
      },
      "2026-07-18T00:01:00.000Z"
    );

    const pins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 800,
      canvasHeight: 1_200,
      boundsByElementId: new Map([
        ["shared-element-id", { x: 100, y: 200, width: 300, height: 150 }],
      ]),
    });

    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ count: 2 });
    expect(pins[0].threadIds).toEqual(["thread-frame-1", "thread-frame-2"]);
  });

  it("nudges distinct nearby anchors in screen pixels so both pins stay clickable", () => {
    let document = createEmptyStudioCommentsDocument();
    document = addThread(document, "thread-a", {
      type: "point", pageId: "page-1", x: 0.4, y: 0.5,
    }, "2026-07-18T00:00:00.000Z");
    document = addThread(document, "thread-b", {
      type: "point", pageId: "page-1", x: 0.401, y: 0.501,
    }, "2026-07-18T00:01:00.000Z");

    const pins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 1_000,
      canvasHeight: 2_000,
      boundsByElementId: new Map(),
    });

    expect(pins).toHaveLength(2);
    expect(pins[0].screenOffsetX ?? 0).toBe(0);
    expect(Math.abs(pins[1].screenOffsetX ?? 0) + Math.abs(pins[1].screenOffsetY ?? 0))
      .toBeGreaterThan(0);
  });

  it("nudges edge collisions toward the canvas interior before the overlay clamp", () => {
    let document = createEmptyStudioCommentsDocument();
    document = addThread(document, "thread-right-a", {
      type: "point", pageId: "page-1", x: 0.999, y: 0.5,
    }, "2026-07-18T00:00:00.000Z");
    document = addThread(document, "thread-right-b", {
      type: "point", pageId: "page-1", x: 0.9995, y: 0.5005,
    }, "2026-07-18T00:01:00.000Z");
    const rightPins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 1_000,
      canvasHeight: 2_000,
      boundsByElementId: new Map(),
    });

    expect(rightPins).toHaveLength(2);
    expect(rightPins[1].screenOffsetX).toBeLessThan(0);
    expect(centerDistance(
      resolvedPinCenter(rightPins[0], 1_000, 2_000),
      resolvedPinCenter(rightPins[1], 1_000, 2_000)
    )).toBeGreaterThanOrEqual(44);

    document = createEmptyStudioCommentsDocument();
    document = addThread(document, "thread-bottom-a", {
      type: "point", pageId: "page-1", x: 0.5, y: 0.999,
    }, "2026-07-18T00:00:00.000Z");
    document = addThread(document, "thread-bottom-b", {
      type: "point", pageId: "page-1", x: 0.5005, y: 0.9995,
    }, "2026-07-18T00:01:00.000Z");
    const bottomPins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 1_000,
      canvasHeight: 2_000,
      boundsByElementId: new Map(),
    });

    expect(bottomPins).toHaveLength(2);
    expect(bottomPins[1].screenOffsetY).toBeLessThan(0);
    expect(centerDistance(
      resolvedPinCenter(bottomPins[0], 1_000, 2_000),
      resolvedPinCenter(bottomPins[1], 1_000, 2_000)
    )).toBeGreaterThanOrEqual(44);
  });

  it("keeps corner collisions at least one touch target apart after the overlay clamp", () => {
    let document = createEmptyStudioCommentsDocument();
    document = addThread(document, "thread-corner-a", {
      type: "point", pageId: "page-1", x: 0.001, y: 0.001,
    }, "2026-07-18T00:00:00.000Z");
    document = addThread(document, "thread-corner-b", {
      type: "point", pageId: "page-1", x: 0.0015, y: 0.0015,
    }, "2026-07-18T00:01:00.000Z");

    const pins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 1_000,
      canvasHeight: 2_000,
      boundsByElementId: new Map(),
    });

    expect(pins).toHaveLength(2);
    expect(centerDistance(
      resolvedPinCenter(pins[0], 1_000, 2_000),
      resolvedPinCenter(pins[1], 1_000, 2_000)
    )).toBeGreaterThanOrEqual(44);
  });

  it("keeps viewer-specific unread state on the pin projection only", () => {
    let document = createEmptyStudioCommentsDocument();
    document = addThread(document, "thread-read", {
      type: "point", pageId: "page-1", x: 0.25, y: 0.25,
    }, "2026-07-18T00:02:00.000Z");
    document = addThread(document, "thread-unread", {
      type: "point", pageId: "page-1", x: 0.25, y: 0.25,
    }, "2026-07-18T00:01:00.000Z");

    const pins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 1_000,
      canvasHeight: 2_000,
      boundsByElementId: new Map(),
      unreadThreadIds: new Set(["thread-unread"]),
    });

    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({
      count: 2,
      unreadCount: 1,
      newestThreadId: "thread-read",
      newestUnreadThreadId: "thread-unread",
    });
    expect(document.threads.every((thread) => !("unread" in thread))).toBe(true);
  });
});
