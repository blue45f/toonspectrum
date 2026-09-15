// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInsertHubDirectDragBoundary } from "./StudioInsertHubDirectDragBoundary";
import { STUDIO_INSERT_DRAG_MIME } from "./studio-insert-drag-core";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

function toolBelt(): StudioToolBeltContentProps {
  return {
    activeSurfaceReviewLocked: false,
    canvasH: 1_200,
    assets: [],
    studioOptionalAssets: { bgSceneSections: [] },
    sceneTemplates: { templates: [] },
  } as unknown as StudioToolBeltContentProps;
}

afterEach(cleanup);

describe("StudioInsertHubDirectDragBoundary explicit handle", () => {
  it("prefers the visible drag handle without hijacking the primary CTA", async () => {
    const setData = vi.fn();
    const view = render(
      <StudioInsertHubDirectDragBoundary toolBelt={toolBelt()}>
        <article data-studio-insert-entry="action:text">
          <button type="button">즐겨찾기</button>
          <button type="button" data-studio-insert-drag-handle="true">끌기</button>
          <button type="button">텍스트 추가</button>
        </article>
      </StudioInsertHubDirectDragBoundary>,
    );
    const [favorite, dragHandle, primary] = [...view.container.querySelectorAll("button")];

    await waitFor(() => expect(dragHandle.draggable).toBe(true));
    expect(favorite.draggable).toBe(false);
    expect(primary.draggable).toBe(false);
    expect(dragHandle.dataset.studioInsertDirectDrag).toBe("true");

    fireEvent.dragStart(dragHandle, {
      dataTransfer: { effectAllowed: "none", setData },
    });
    expect(setData).toHaveBeenCalledWith(
      STUDIO_INSERT_DRAG_MIME,
      JSON.stringify({ kind: "text" }),
    );
  });
});
