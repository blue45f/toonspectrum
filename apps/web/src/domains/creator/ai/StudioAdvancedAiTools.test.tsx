// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { StudioAdvancedAiTools } from "./StudioAdvancedAiTools";

afterEach(() => cleanup());

function renderTools(userId?: string) {
  const view = render(
    <MemoryRouter>
      <StudioAdvancedAiTools userId={userId} />
    </MemoryRouter>,
  );
  const details = view.container.querySelector<HTMLDetailsElement>(
    '[data-studio-advanced-ai-tools="true"]',
  );
  expect(details).not.toBeNull();
  expect(view.queryByRole("tabpanel")).toBeNull();
  details!.open = true;
  fireEvent(details!, new Event("toggle"));
  return view;
}

describe("StudioAdvancedAiTools", () => {
  it("starts with the non-destructive local stroke proposal workflow", () => {
    renderTools();

    expect(screen.getByRole("tab", { name: /획 제안/u }).getAttribute("aria-selected"))
      .toBe("true");
    expect(screen.getByRole("tabpanel", { name: /획 제안/u }).textContent)
      .toMatch(/원본 획은 자동으로 수정하지 않아요/u);
  });


  it("mounts advanced runtimes only after the disclosure opens", () => {
    const view = render(
      <MemoryRouter>
        <StudioAdvancedAiTools />
      </MemoryRouter>,
    );

    expect(view.queryByRole("tabpanel")).toBeNull();
    expect(view.container.querySelector('[data-studio-advanced-ai-tools="true"]')?.getAttribute("open"))
      .toBeNull();
  });

  it("supports keyboard tab navigation with instance-safe ids", () => {
    renderTools();
    const stroke = screen.getByRole("tab", { name: /획 제안/u });
    const threeD = screen.getByRole("tab", { name: /AI 3D/u });

    expect(stroke.id).not.toBe(threeD.id);

    const home = new KeyboardEvent("keydown", {
      key: "Home",
      bubbles: true,
      cancelable: true,
    });
    fireEvent(stroke, home);
    expect(home.defaultPrevented).toBe(true);
    expect(stroke.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(stroke, { key: "End" });
    expect(threeD.getAttribute("aria-selected")).toBe("true");
    expect(threeD.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(threeD, { key: "ArrowRight" });
    expect(stroke.getAttribute("aria-selected")).toBe("true");
    expect(stroke.getAttribute("tabindex")).toBe("0");
  });

  it("explains login and personal-key requirements before exposing external 3D generation", () => {
    renderTools();

    fireEvent.click(screen.getByRole("tab", { name: /AI 3D/u }));

    expect(screen.getByRole("tabpanel", { name: /AI 3D/u }).textContent)
      .toMatch(/개인 키|자동 전환하지 않습니다/u);
    expect(screen.getByRole("button", { name: "로그인하고 계속" })).not.toBeNull();
  });
});
