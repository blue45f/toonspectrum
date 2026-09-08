// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioHelpHubDialog } from "./StudioHelpHubDialog";

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

function renderHub(overrides: Partial<React.ComponentProps<typeof StudioHelpHubDialog>> = {}) {
  const onClose = vi.fn();
  const onOpenLegacySection = vi.fn();
  render(
    <StudioHelpHubDialog
      open
      initialTab="home"
      initialQuery=""
      toolCommandId="tool.pen"
      actions={{}}
      onOpenLegacySection={onOpenLegacySection}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose, onOpenLegacySection };
}

describe("StudioHelpHubDialog", () => {
  it("shows context from the active tool and searches symptom guidance", () => {
    renderHub();
    expect(screen.getByTestId("studio-help-hub").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("현재 도구")).toBeTruthy();
    expect(screen.getAllByText("펜").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "저장 의심" },
    });
    expect(screen.getByText("작업이 사라졌거나 저장이 의심될 때")).toBeTruthy();
  });

  it("routes troubleshooting cards to the measured technical surfaces", () => {
    const { onOpenLegacySection } = renderHub();
    fireEvent.click(screen.getByRole("button", { name: "문제 해결" }));
    fireEvent.click(screen.getByRole("button", { name: /느림 · 검은 화면 · 입력 문제/u }));
    expect(onOpenLegacySection).toHaveBeenCalledExactlyOnceWith("diagnostics");
  });

  it("persists explicit guide progress locally rather than guessing completion", () => {
    renderHub();
    fireEvent.click(screen.getByRole("button", { name: "따라 배우기" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "기본 조작 확인" }));
    expect(window.localStorage.getItem("toonspectrum-studio-help:guide-progress:v1")).toContain(
      '\"canvas\"',
    );
  });

  it("closes with Escape", () => {
    const { onClose } = renderHub();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
