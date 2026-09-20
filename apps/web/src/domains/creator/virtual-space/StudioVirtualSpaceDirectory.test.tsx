// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceDirectory } from "./StudioVirtualSpaceDirectory";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { studioVirtualSpaceState } from "./studio-virtual-space-model";

afterEach(cleanup);
describe("Virtual Studio directory", () => {
  it("finds either language and opens the real tool without requiring a walk", () => {
    const onMove = vi.fn(), onOpen = vi.fn();
    render(<StudioVirtualSpaceDirectory manifest={DEFAULT_STUDIO_WORLD_MANIFEST} peers={[]} onMove={onMove} onOpen={onOpen} onSelectPeer={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ＤＲＡＷＩＮＧ" } });
    fireEvent.click(screen.getByRole("button", { name: "드로잉 스튜디오 도구 바로 열기" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("canvas");
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "드로잉 스튜디오로 걷기" }));
    expect(onMove).toHaveBeenCalledWith(DEFAULT_STUDIO_WORLD_MANIFEST.interactions.find((item) => item.zoneId === "drawing")?.point);
  });
  it("selects an authenticated teammate without starting an activity, and never invents a result", () => {
    const onSelectPeer = vi.fn(), onMove = vi.fn(), onOpen = vi.fn();
    render(<StudioVirtualSpaceDirectory manifest={DEFAULT_STUDIO_WORLD_MANIFEST} peers={[{
      participant: { sessionId: "writer-session", displayName: "Nabi", role: "editor" },
      state: studioVirtualSpaceState({ x: 300, y: 200 }, "down", "focused", false, 0, "writers"),
      lastSeen: 1, sequence: 1,
    }]} onMove={onMove} onOpen={onOpen} onSelectPeer={onSelectPeer} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nabi" } });
    fireEvent.click(screen.getByRole("button", { name: /Nabi/u }));
    expect(onSelectPeer).toHaveBeenCalledExactlyOnceWith("writer-session");
    expect(onMove).not.toHaveBeenCalled(); expect(onOpen).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no such teammate" } });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("없어요");
  });
});

it("does not execute a composing Enter and prioritizes direct tool opening on explicit Enter", () => {
  const onOpen = vi.fn(), onMove = vi.fn();
  render(<StudioVirtualSpaceDirectory manifest={DEFAULT_STUDIO_WORLD_MANIFEST} peers={[]} onMove={onMove} onOpen={onOpen} onSelectPeer={vi.fn()} expanded />);
  const input = screen.getByRole("searchbox"); fireEvent.change(input, { target: { value: "drawing" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true }); expect(onOpen).not.toHaveBeenCalled(); expect(onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" }); expect(onOpen).toHaveBeenCalledExactlyOnceWith("canvas"); expect(onMove).not.toHaveBeenCalled();
});
