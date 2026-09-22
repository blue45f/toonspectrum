// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceNpcPanel } from "./StudioVirtualSpaceNpcPanel";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldInteractions } from "./studio-virtual-space-world-manifest";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (_ko: string, en: string) => en }));
afterEach(cleanup);

describe("StudioVirtualSpaceNpcPanel", () => {
  it("exposes each NPC as a native keyboard-focusable tool button without activating on render or focus", () => {
    const interact = vi.fn();
    const view = render(<StudioVirtualSpaceNpcPanel manifest={DEFAULT_STUDIO_WORLD_MANIFEST} onInteract={interact} />);
    const buttons = view.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(interact).not.toHaveBeenCalled();
    const writer = view.getByRole("button", { name: /Yoon · Story editor · NPC · Writer · Open Script desk/u });
    writer.focus();
    expect(document.activeElement).toBe(writer);
    expect(interact).not.toHaveBeenCalled();
    fireEvent.click(writer);
    const expected = studioWorldInteractions(DEFAULT_STUDIO_WORLD_MANIFEST).find((interaction) => interaction.action === "story");
    expect(interact).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it("maps all four role selections to their existing tools and never fabricates a missing action", () => {
    const interact = vi.fn();
    const view = render(<StudioVirtualSpaceNpcPanel manifest={DEFAULT_STUDIO_WORLD_MANIFEST} onInteract={interact} />);
    for (const button of view.getAllByRole("button")) fireEvent.click(button);
    expect(interact.mock.calls.map(([interaction]) => interaction.action)).toEqual(["community", "story", "canvas", "assets"]);
    view.rerender(<StudioVirtualSpaceNpcPanel manifest={{ ...DEFAULT_STUDIO_WORLD_MANIFEST, interactions: [], props: [] }} onInteract={interact} />);
    expect(view.queryAllByRole("button")).toEqual([]);
  });

  it("does not list absent actors or claim online attendance", () => {
    const view = render(<StudioVirtualSpaceNpcPanel manifest={{ ...DEFAULT_STUDIO_WORLD_MANIFEST, npcs: [] }} onInteract={vi.fn()} />);
    expect(view.container.childElementCount).toBe(0);
    view.rerender(<StudioVirtualSpaceNpcPanel manifest={DEFAULT_STUDIO_WORLD_MANIFEST} onInteract={vi.fn()} />);
    expect(view.getByRole("region", { name: "Studio NPC helpers" })).toBeTruthy();
    expect(view.queryByText(/online/iu)).toBeNull();
  });
});
