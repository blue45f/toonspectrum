// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInsertHubDirectDragBoundary } from "./StudioInsertHubDirectDragBoundary";
import { STUDIO_INSERT_DRAG_MIME } from "./studio-insert-drag-core";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

function toolBelt(
  activeSurfaceReviewLocked: boolean,
): StudioToolBeltContentProps {
  return {
    activeSurfaceReviewLocked,
    canvasH: 1_200,
    assets: [],
    studioOptionalAssets: { bgSceneSections: [] },
    sceneTemplates: { templates: [] },
  } as unknown as StudioToolBeltContentProps;
}

function insertionCard() {
  return (
    <article data-studio-insert-entry="action:text">
      <button type="button" aria-label="즐겨찾기 추가">
        즐겨찾기
      </button>
      <button type="button" aria-label="텍스트 텍스트 추가">
        텍스트 추가
      </button>
    </article>
  );
}

afterEach(cleanup);

describe("StudioInsertHubDirectDragBoundary", () => {
  it("adds a direct-drag affordance and writes the owned insert MIME", async () => {
    const setData = vi.fn();
    const view = render(
      <StudioInsertHubDirectDragBoundary toolBelt={toolBelt(false)}>
        {insertionCard()}
      </StudioInsertHubDirectDragBoundary>,
    );
    const buttons = view.container.querySelectorAll("button");
    const useButton = buttons.item(buttons.length - 1);

    await waitFor(() => expect(useButton.draggable).toBe(true));
    expect(useButton.dataset.studioInsertDirectDrag).toBe("true");
    expect(useButton.getAttribute("aria-describedby")).toBeTruthy();

    const dataTransfer = {
      effectAllowed: "none",
      setData,
    };
    fireEvent.dragStart(useButton, { dataTransfer });

    expect(setData).toHaveBeenCalledWith(
      STUDIO_INSERT_DRAG_MIME,
      JSON.stringify({ kind: "text" }),
    );
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("removes native dragging when the review surface is locked", async () => {
    const view = render(
      <StudioInsertHubDirectDragBoundary toolBelt={toolBelt(false)}>
        {insertionCard()}
      </StudioInsertHubDirectDragBoundary>,
    );
    const buttons = view.container.querySelectorAll("button");
    const useButton = buttons.item(buttons.length - 1);
    await waitFor(() => expect(useButton.draggable).toBe(true));

    view.rerender(
      <StudioInsertHubDirectDragBoundary toolBelt={toolBelt(true)}>
        {insertionCard()}
      </StudioInsertHubDirectDragBoundary>,
    );

    await waitFor(() => expect(useButton.draggable).toBe(false));
    expect(useButton.dataset.studioInsertDirectDrag).toBeUndefined();
  });
});
