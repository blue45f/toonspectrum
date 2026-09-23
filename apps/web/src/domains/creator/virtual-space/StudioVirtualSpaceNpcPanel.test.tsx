// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceNpcPanel } from "./StudioVirtualSpaceNpcPanel";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { studioNpcInteraction } from "./studio-virtual-space-npc-director";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (_ko: string, en: string) => en }));
afterEach(cleanup);

describe("StudioVirtualSpaceNpcPanel", () => {
  it("exposes each NPC as a native keyboard-focusable tool button without activating on render or focus", () => {
    const interact = vi.fn();
    const view = render(<StudioVirtualSpaceNpcPanel manifest={DEFAULT_STUDIO_WORLD_MANIFEST} onInteract={interact} />);
    const buttons = view.getAllByRole("button");
    expect(buttons).toHaveLength(DEFAULT_STUDIO_WORLD_MANIFEST.npcs.length);
    expect(interact).not.toHaveBeenCalled();
    const producer = view.getByRole("button", { name: /Yoon · Producer · NPC · Producer/u });
    producer.focus();
    expect(document.activeElement).toBe(producer);
    expect(interact).not.toHaveBeenCalled();
    fireEvent.click(producer);
    const definition = DEFAULT_STUDIO_WORLD_MANIFEST.npcs.find((npc) => npc.skinKey === "npc-producer")!;
    expect(interact).toHaveBeenCalledExactlyOnceWith(studioNpcInteraction(DEFAULT_STUDIO_WORLD_MANIFEST, definition));
  });

  it("maps all four role selections to their existing tools and never fabricates a missing action", () => {
    const interact = vi.fn();
    const view = render(<StudioVirtualSpaceNpcPanel manifest={DEFAULT_STUDIO_WORLD_MANIFEST} onInteract={interact} />);
    for (const button of view.getAllByRole("button")) fireEvent.click(button);
    const expected = DEFAULT_STUDIO_WORLD_MANIFEST.npcs
      .map((npc) => studioNpcInteraction(DEFAULT_STUDIO_WORLD_MANIFEST, npc))
      .filter((interaction): interaction is NonNullable<typeof interaction> => interaction !== null)
      .map((interaction) => interaction.action);
    expect(interact.mock.calls.map(([interaction]) => interaction.action)).toEqual(expected);
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
