// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeStudioPublishCompliance, validateStudioPublishCompliance } from "./studio-publish-compliance";
import { validateStudioPublishPreflight } from "./studio-publish-preflight";
import { StudioPublishPreflightPanel, type StudioPublishPreflightPanelProps } from "./StudioPublishPreflightPanel";

beforeEach(() => {
  // jsdom has no layout; retain the modal helper's real focus and visibility checks.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    new DOMRect(0, 0, 100, 40),
  ] as unknown as DOMRectList);
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function props(): StudioPublishPreflightPanelProps {
  const compliance = normalizeStudioPublishCompliance(null);
  return {
    open: true,
    onClose: vi.fn(),
    profile: "generic",
    onProfileChange: vi.fn(),
    aiUsage: "none",
    onAiUsageChange: vi.fn(),
    disclosure: "",
    onDisclosureChange: vi.fn(),
    compliance,
    onComplianceChange: vi.fn(),
    complianceResult: validateStudioPublishCompliance(compliance),
    result: validateStudioPublishPreflight({ title: "QA", tags: [], pages: [] }),
    onDownloadReport: vi.fn(),
  };
}

describe("StudioPublishPreflightPanel keyboard ownership", () => {
  it("contains focus, isolates the editor and restores the publish trigger on close", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "수정 게시";
    document.body.append(trigger);
    trigger.focus();
    const options = props();
    const view = render(<StudioPublishPreflightPanel {...options} />);
    const dialog = screen.getByRole("dialog", { name: "Publish Pack 사전검사" });
    const first = screen.getByRole("button", { name: "Publish Pack 사전검사 닫기" });
    const last = screen.getByRole("button", { name: "확인", exact: true });

    expect(document.activeElement).toBe(first);
    expect(trigger.hasAttribute("inert")).toBe(true);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    trigger.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(options.onClose).toHaveBeenCalledTimes(1);

    view.rerender(<StudioPublishPreflightPanel {...options} open={false} />);
    expect(trigger.hasAttribute("inert")).toBe(false);
    expect(trigger.hasAttribute("aria-hidden")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the active option focused across updates and uses the latest close handler", () => {
    const options = props();
    const view = render(<StudioPublishPreflightPanel {...options} />);
    const profile = screen.getByRole("combobox", { name: /^게시 목적지/ });
    profile.focus();
    const onClose = vi.fn();
    view.rerender(<StudioPublishPreflightPanel {...options} profile="tapas" onClose={onClose} />);
    expect(document.activeElement).toBe(profile);
    fireEvent.keyDown(profile, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(options.onClose).not.toHaveBeenCalled();
  });
});
