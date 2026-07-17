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

  it("keeps viewer-specific unread state on the pin projection only", () => {
    let document = createEmptyStudioCommentsDocument();
    document = addThread(document, "thread-read", {
      type: "point", pageId: "page-1", x: 0.25, y: 0.25,
    }, "2026-07-18T00:00:00.000Z");
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
    expect(pins[0]).toMatchObject({ count: 2, unreadCount: 1 });
    expect(document.threads.every((thread) => !("unread" in thread))).toBe(true);
  });
});
