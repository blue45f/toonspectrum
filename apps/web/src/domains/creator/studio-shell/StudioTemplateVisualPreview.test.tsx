// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { studioTemplateById } from "../studio-template-catalog";
import { StudioTemplateVisualPreview } from "./StudioTemplateVisualPreview";

afterEach(() => {
  cleanup();
});

describe("StudioTemplateVisualPreview", () => {
  it("renders the canonical template composition and navigates pages", () => {
    const template = studioTemplateById("presentation-webtoon-pitch");
    if (!template) throw new Error("pitch template is required");

    const view = render(
      <StudioTemplateVisualPreview
        template={template}
        locale="ko"
        showNavigation
      />,
    );

    const preview = view.container.querySelector(
      '[data-studio-template-preview="presentation-webtoon-pitch"]',
    );
    expect(preview).toBeTruthy();
    expect(preview?.getAttribute("data-template-page-id")).toBe("cover");
    expect(screen.getByText("1. 표지")).toBeTruthy();
    expect(screen.getByText("1/8")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다음 템플릿 페이지" }));
    expect(preview?.getAttribute("data-template-page-id")).toBe("logline");
    expect(screen.getByText("2. 로그라인")).toBeTruthy();
    expect(screen.getByText("2/8")).toBeTruthy();
  });

  it("exposes a visual surface for every public template", () => {
    const template = studioTemplateById("webtoon-action-sequence");
    if (!template) throw new Error("action template is required");
    const view = render(
      <StudioTemplateVisualPreview template={template} locale="ko" compact />,
    );
    expect(view.container.querySelector("[data-studio-template-preview]")).toBeTruthy();
    expect(view.container.querySelector('[data-template-page-id="action"]')).toBeTruthy();
  });
});
