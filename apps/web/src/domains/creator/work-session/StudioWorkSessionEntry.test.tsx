// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioWorkSessionEntry } from "./StudioWorkSessionEntry";

const { load, mounted, unmounted } = vi.hoisted(() => ({ load: vi.fn(), mounted: vi.fn(), unmounted: vi.fn() }));
vi.mock("./load-studio-work-session-workspace", () => ({ loadStudioWorkSessionWorkspace: load }));
function Workspace({ workId }: { readonly workId: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => { mounted(workId); return () => { unmounted(workId); }; }, [workId]);
  return <button onClick={() => setCount((n) => n + 1)}>{workId}:{count}</button>;
}
const toggle = () => screen.getByRole("button", { name: "공동 작업 세션" });
beforeEach(() => { load.mockReset().mockResolvedValue({ default: Workspace }); mounted.mockReset(); unmounted.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("explicit work-session loading and recovery", () => {
  it("does not import or mount a workspace until explicitly opened", async () => {
    render(<StudioWorkSessionEntry workId="work-a" />);
    expect(load).not.toHaveBeenCalled(); expect(mounted).not.toHaveBeenCalled();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle()); await screen.findByRole("button", { name: "work-a:0" });
    expect(load).toHaveBeenCalledTimes(1); expect(mounted).toHaveBeenCalledWith("work-a");
  });
  it("keeps a loaded workspace stable across parent renders", async () => {
    const view = render(<StudioWorkSessionEntry workId="work-a" />);
    fireEvent.click(toggle()); fireEvent.click(await screen.findByRole("button", { name: "work-a:0" }));
    view.rerender(<StudioWorkSessionEntry workId="work-a" />);
    expect(screen.getByRole("button", { name: "work-a:1" })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1); expect(mounted).toHaveBeenCalledTimes(1);
  });
  it("retries a rejected lazy resource without reloading the page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    load.mockRejectedValueOnce(new Error("temporary module load failure"));
    render(<StudioWorkSessionEntry workId="work-a" />); fireEvent.click(toggle());
    const retry = await screen.findByRole("button", { name: "세션 화면 다시 불러오기" });
    expect(load).toHaveBeenCalledTimes(1); expect(mounted).not.toHaveBeenCalled();
    fireEvent.click(retry); await screen.findByRole("button", { name: "work-a:0" });
    expect(load).toHaveBeenCalledTimes(2); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("also recovers by closing and reopening after a failed attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    load.mockRejectedValueOnce(new Error("temporary module load failure"));
    render(<StudioWorkSessionEntry workId="work-a" />); fireEvent.click(toggle());
    await screen.findByRole("alert"); fireEvent.click(toggle());
    expect(screen.queryByRole("alert")).toBeNull(); expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle()); await screen.findByRole("button", { name: "work-a:0" });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("closes on a work change without reading the new work or reviving an old entry", async () => {
    const view = render(<StudioWorkSessionEntry workId="work-a" />);
    fireEvent.click(toggle()); await screen.findByRole("button", { name: "work-a:0" });
    view.rerender(<StudioWorkSessionEntry workId="work-b" />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(unmounted).toHaveBeenCalledWith("work-a"); expect(load).toHaveBeenCalledTimes(1);
    view.rerender(<StudioWorkSessionEntry workId="work-a" />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle()); await screen.findByRole("button", { name: "work-a:0" });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("ignores an import that finishes after its entry closes", async () => {
    let finish!: (value: { default: typeof Workspace }) => void;
    load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<StudioWorkSessionEntry workId="work-a" />); fireEvent.click(toggle());
    expect(screen.getByRole("status")).toBeTruthy(); fireEvent.click(toggle());
    await act(async () => { finish({ default: Workspace }); });
    expect(mounted).not.toHaveBeenCalled(); expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(toggle()); await screen.findByRole("button", { name: "work-a:0" });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not automatically retry repeated failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    load.mockRejectedValue(new Error("offline"));
    render(<StudioWorkSessionEntry workId="work-a" />); fireEvent.click(toggle());
    fireEvent.click(await screen.findByRole("button", { name: "세션 화면 다시 불러오기" }));
    await screen.findByRole("button", { name: "세션 화면 다시 불러오기" });
    expect(load).toHaveBeenCalledTimes(2); expect(mounted).not.toHaveBeenCalled();
  });
  it("does not mount a pending import into a different work", async () => {
    let finish!: (value: { default: typeof Workspace }) => void;
    load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<StudioWorkSessionEntry workId="work-a" />); fireEvent.click(toggle());
    view.rerender(<StudioWorkSessionEntry workId="work-b" />);
    await act(async () => { finish({ default: Workspace }); });
    expect(mounted).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle()); await screen.findByRole("button", { name: "work-b:0" });
    expect(mounted).toHaveBeenCalledExactlyOnceWith("work-b");
  });
});
