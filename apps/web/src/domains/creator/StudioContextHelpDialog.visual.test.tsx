// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioContextHelpDialog } from "./StudioContextHelpDialog";

afterEach(cleanup);

describe("StudioContextHelpDialog visual guidance", () => {
  it("shows a workspace overview and six visual help paths without changing dialog semantics", () => {
    render(
      <StudioContextHelpDialog
        open
        toolCommandId={null}
        onClose={vi.fn()}
        onOpenSection={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "도움말 홈" })).toBeTruthy();
    const hero = document.querySelector('[data-studio-help-hero-visual="true"] img');
    expect(hero?.getAttribute("src")).toBe("/brand/production-os-workspace.svg");
    const visuals = [...document.querySelectorAll('[data-studio-help-visual="true"] img')];
    expect(visuals).toHaveLength(6);
    expect(visuals.map((image) => image.getAttribute("src"))).toEqual([
      "/brand/theme-scenes/ink-studio.svg",
      "/brand/theme-scenes/graphite-studio.svg",
      "/brand/theme-scenes/contrast-studio.svg",
      "/brand/theme-scenes/midnight-studio.svg",
      "/brand/theme-scenes/paper-studio.svg",
      "/brand/theme-scenes/aurora-studio.svg",
    ]);
    expect(visuals.every((image) => image.getAttribute("loading") === "lazy")).toBe(true);
  });
});
