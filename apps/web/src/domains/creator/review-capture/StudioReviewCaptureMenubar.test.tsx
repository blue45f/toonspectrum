// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioMenubarContent } from "../StudioMenubarContent";
import { createHandlers, createProps } from "../StudioMenubarContent.test-fixture";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("../studio-page-lazy-ui", () => ({
  StudioExportMenuPanel: () => null,
  StudioMainMenu: () => <nav aria-label="메뉴" />,
  preloadStudioExportMenuPanel: vi.fn(),
}));
vi.mock("../StudioWorkspaceMenuGate", () => ({ StudioWorkspaceMenuGate: () => null }));
beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  window.localStorage.removeItem("toonspectrum-studio-project-center:favorites:v1");
  window.localStorage.removeItem("toonspectrum-studio-project-center:recent-actions:v1");
});
afterEach(cleanup);

describe("review capture project menu entry", () => {
  it("exposes one explicit action through the existing project center", () => {
    const open = vi.fn();
    render(<StudioMenubarContent {...createProps({ projectActionsOpen: true,
      stableHandlers: { ...createHandlers(), openPinnedReviewCapture: open } })} />);
    const button = screen.getByRole("button", { name: "저장된 원고로 검수본 만들기" });
    expect(open).not.toHaveBeenCalled(); expect(button.className).toContain("min-h-11");
    fireEvent.click(button); expect(open).toHaveBeenCalledOnce();
  });
  it.each([{ saving: true }, { isExporting: true }, { collaborationDocumentLocked: true }])(
    "prevents concurrent capture while the document is busy or locked: %j", (state) => {
      const open = vi.fn();
      render(<StudioMenubarContent {...createProps({ ...state, projectActionsOpen: true,
        stableHandlers: { ...createHandlers(), openPinnedReviewCapture: open } })} />);
      const button = screen.getByRole("button", { name: "저장된 원고로 검수본 만들기" });
      expect(button).toHaveProperty("disabled", true); fireEvent.click(button);
      expect(open).not.toHaveBeenCalled();
    },
  );
});
