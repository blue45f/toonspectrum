// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { Settings2 } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioToolHintBubble } from "./components/StudioToolHintBubble";
import { StudioRailToolButton } from "./studio-chrome-ui";

import type { ReactNode } from "react";

vi.mock("./StudioToolHint", () => ({
  StudioToolHintTarget: ({ children, preferredSide }: {
    children: ReactNode;
    preferredSide?: string;
  }) => <div data-testid="rail-hint" data-preferred-side={preferredSide}>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("vertical rail coach placement", () => {
  it.each(["More toolbar settings", "3D Background", "3D Character"])(
    "places the %s coach beside the rail, including the footer",
    (label) => {
      render(<StudioRailToolButton icon={Settings2} label={label} description="Tool guidance" />);
      expect(screen.getByTestId("rail-hint").getAttribute("data-preferred-side")).toBe("right");
    },
  );

  it.each([720, 800, 1000])("keeps an expanded footer coach clear of tools at height %i", (height) => {
    vi.stubGlobal("innerWidth", 1280);
    vi.stubGlobal("innerHeight", height);
    const anchor = {
      left: 176, right: 216, top: height - 64, bottom: height - 24, width: 40, height: 40,
    };
    const html = renderToStaticMarkup(
      <StudioToolHintBubble
        hint={{ id: "rail-settings", title: "More", description: "Toolbar settings" }}
        anchor={anchor}
        preferredSide="right"
      />,
    );
    const template = document.createElement("template");
    template.innerHTML = html;
    const bubble = template.content.querySelector<HTMLElement>('[role="tooltip"]');
    expect(bubble?.dataset.side).toBe("right");
    expect(bubble?.dataset.studioToolHintExpanded).toBe("true");
    expect(Number.parseFloat(bubble?.style.left ?? "0")).toBeGreaterThan(anchor.right);
    expect(Number.parseFloat(bubble?.style.top ?? "0")).toBeGreaterThanOrEqual(10);
    expect(Number.parseFloat(bubble?.style.top ?? "0") + 312).toBeLessThanOrEqual(height - 10);
    // Hoverable guidance remains available; do not solve occlusion by disabling pointer events.
    expect(bubble?.className).toContain("pointer-events-auto");
  });
});
