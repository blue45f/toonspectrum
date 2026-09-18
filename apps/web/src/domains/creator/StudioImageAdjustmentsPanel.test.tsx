// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioImageAdjustmentsPanel } from "./StudioImageAdjustmentsPanel";

import type { ImageEl } from "./studio-element-model";

describe("StudioImageAdjustmentsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  const dummyImageEl: ImageEl = {
    id: "img-1",
    type: "image",
    src: "data:image/png;base64,sample",
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
  };

  it("renders with colorMatch section in accordion", () => {
    render(
      <StudioImageAdjustmentsPanel
        selected={dummyImageEl}
        filterClipboard={null}
        onSetFilterClipboard={vi.fn()}
        onPatch={vi.fn()}
        effectFavoriteState={{ version: 1, favorites: [], recent: [] }}
        onToggleEffectFavorite={vi.fn()}
        onRememberEffectRecent={vi.fn()}
      />,
    );

    expect(screen.getByText("색감 맞추기")).toBeDefined();
    expect(screen.getByText("자동 명암")).toBeDefined();
  });
});
