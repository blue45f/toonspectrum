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
    fireEvent.click(screen.getByRole("button", { name: "드로잉 아틀리에 도구 바로 열기" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("canvas");
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "드로잉 아틀리에로 걷기" }));
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
  it("finds a teammate by real location, work status and permission role", () => {
    const onSelectPeer = vi.fn();
    render(<StudioVirtualSpaceDirectory manifest={DEFAULT_STUDIO_WORLD_MANIFEST} peers={[{
      participant: { sessionId: "reviewer", displayName: "검수자", role: "commenter" },
      state: studioVirtualSpaceState({ x: 300, y: 200 }, "down", "reviewing", false, 0, "review"),
      lastSeen: 1, sequence: 1,
    }]} onMove={vi.fn()} onOpen={vi.fn()} onSelectPeer={onSelectPeer} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "reviewing commenter" } });
    fireEvent.click(screen.getByRole("button", { name: /검수자/u }));
    expect(onSelectPeer).toHaveBeenCalledExactlyOnceWith("reviewer");
    expect(screen.getByText("의견 참여자")).toBeTruthy();
    expect(screen.getByText(/원고 검토 중/u)).toBeTruthy();
  });
  it("명시적으로 다가가기를 선택하면 이동만 요청하고 대화나 도구를 시작하지 않는다", () => {
    const onApproachPeer = vi.fn(), onSelectPeer = vi.fn(), onOpen = vi.fn();
    const props = { manifest: DEFAULT_STUDIO_WORLD_MANIFEST, peers: [{
      participant: { sessionId: "writer-session", displayName: "Nabi", role: "editor" as const },
      state: studioVirtualSpaceState({ x: 300, y: 200 }, "down", "available", false, 0, "writers"), lastSeen: 1, sequence: 1,
    }], onMove: vi.fn(), onOpen, onSelectPeer, onApproachPeer, expanded: true };
    const view = render(<StudioVirtualSpaceDirectory {...props} />);
    const button = screen.getByRole("button", { name: "Nabi 님에게 다가가기" });
    fireEvent.click(button);
    expect(onApproachPeer).toHaveBeenCalledExactlyOnceWith("writer-session");
    expect(onSelectPeer).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    view.rerender(<StudioVirtualSpaceDirectory {...props} approachingPeerId="writer-session" />);
    expect(screen.getByText("다가가는 중…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Nabi 님에게 다가가기" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Nabi 님에게 다가가기" }));
    expect(onApproachPeer).toHaveBeenCalledOnce();
  });
  it.each(["focused", "away", "movement-unavailable"] as const)("%s 상태에서는 자동으로 팀원에게 접근하지 않는다", (condition) => {
    const onApproachPeer = vi.fn();
    render(<StudioVirtualSpaceDirectory manifest={DEFAULT_STUDIO_WORLD_MANIFEST} peers={[{
      participant: { sessionId: "writer-session", displayName: "Nabi", role: "editor" },
      state: studioVirtualSpaceState({ x: 300, y: 200 }, "down", condition === "movement-unavailable" ? "available" : condition, false, 0, "writers"), lastSeen: 1, sequence: 1,
    }]} onMove={vi.fn()} onOpen={vi.fn()} onSelectPeer={vi.fn()} onApproachPeer={onApproachPeer} approachDisabled={condition === "movement-unavailable"} expanded />);
    const button = screen.getByRole("button", { name: "Nabi 님에게 다가가기" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onApproachPeer).not.toHaveBeenCalled();
  });
});

it("does not execute a composing Enter and prioritizes direct tool opening on explicit Enter", () => {
  const onOpen = vi.fn(), onMove = vi.fn();
  render(<StudioVirtualSpaceDirectory manifest={DEFAULT_STUDIO_WORLD_MANIFEST} peers={[]} onMove={onMove} onOpen={onOpen} onSelectPeer={vi.fn()} expanded />);
  const input = screen.getByRole("searchbox"); fireEvent.change(input, { target: { value: "drawing" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true }); expect(onOpen).not.toHaveBeenCalled(); expect(onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" }); expect(onOpen).toHaveBeenCalledExactlyOnceWith("canvas"); expect(onMove).not.toHaveBeenCalled();
});
