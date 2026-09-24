// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useStudioPageHistorySnapshots } from "./useStudioPageHistorySnapshots";

afterEach(cleanup);

describe("useStudioPageHistorySnapshots", () => {
  it("seeds the requested initial page sequence for a local project document", () => {
    const { result } = renderHook(() => useStudioPageHistorySnapshots({
      effectiveWorkId: "local-document",
      markStudioDocumentChanged: () => true,
      workId: null,
      initialCanvasHeight: 1350,
      initialPageCount: 8,
      initialPage: (_pageId, pageIndex) => ({
        canvasH: 1350,
        elements: [],
        name: `카드 ${pageIndex + 1}`,
      }),
    }));

    expect(result.current.pages).toHaveLength(8);
    expect(result.current.pages.map((page) => page.name)).toEqual([
      "카드 1",
      "카드 2",
      "카드 3",
      "카드 4",
      "카드 5",
      "카드 6",
      "카드 7",
      "카드 8",
    ]);
    expect(result.current.pages.every((page) => page.canvasH === 1350)).toBe(true);
  });

  it("keeps cloud work hydration single-page and clamps unsafe local counts", () => {
    const cloud = renderHook(() => useStudioPageHistorySnapshots({
      effectiveWorkId: "cloud-work",
      markStudioDocumentChanged: () => true,
      workId: "cloud-work",
      initialPageCount: 24,
    }));
    expect(cloud.result.current.pages).toHaveLength(1);
    cloud.unmount();

    const local = renderHook(() => useStudioPageHistorySnapshots({
      effectiveWorkId: "local-work",
      markStudioDocumentChanged: () => true,
      workId: null,
      initialPageCount: 5000,
    }));
    expect(local.result.current.pages).toHaveLength(200);
  });
});
