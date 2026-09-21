// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioWorldAuthoringEntry } from "./StudioWorldAuthoringEntry";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

const loader = vi.hoisted(() => vi.fn());
vi.mock("./load-studio-world-authoring", () => ({ loadStudioWorldAuthoring: loader }));
const Props = { projectId: "work-a", manifest: DEFAULT_STUDIO_WORLD_MANIFEST, onReset: vi.fn(), onChange: vi.fn(), basePublishedRevisionId: "revision-a" };
const Loaded = ({ projectId }: { projectId: string }) => <p>Editor for {projectId}</p>;
beforeEach(() => { loader.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); Props.onChange.mockClear(); Props.onReset.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("retryable on-demand world authoring", () => {
  it("recovers a failed module only after an explicit retry without touching world state", async () => {
    loader.mockRejectedValueOnce(new Error("fixture network error")).mockResolvedValueOnce({ default: Loaded });
    render(<StudioWorldAuthoringEntry {...Props} />);
    expect((await screen.findByRole("alert")).textContent).toContain("초안은 그대로 유지됩니다");
    expect(loader).toHaveBeenCalledTimes(1); expect(Props.onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "공간 편집 다시 불러오기" }));
    await screen.findByText("Editor for work-a"); expect(loader).toHaveBeenCalledTimes(2);
    expect(Props.onChange).not.toHaveBeenCalled(); expect(Props.onReset).not.toHaveBeenCalled();
  });
  it("never mounts a late editor from an older scope", async () => {
    let complete!: (value: { default: typeof Loaded }) => void;
    loader.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; })).mockResolvedValueOnce({ default: Loaded });
    const view = render(<StudioWorldAuthoringEntry {...Props} />);
    view.rerender(<StudioWorldAuthoringEntry {...Props} projectId="work-b" basePublishedRevisionId="revision-b" />);
    await screen.findByText("Editor for work-b");
    await act(async () => complete({ default: Loaded }));
    expect(screen.queryByText("Editor for work-a")).toBeNull(); expect(Props.onChange).not.toHaveBeenCalled();
  });
  it("does not offer a writable retry when editing is disabled", async () => {
    loader.mockRejectedValue(new Error("fixture unavailable"));
    render(<StudioWorldAuthoringEntry {...Props} disabled />);
    await screen.findByRole("alert");
    const retry = screen.getByRole("button", { name: "공간 편집 다시 불러오기" });
    expect(retry.matches(":disabled")).toBe(true); fireEvent.click(retry); expect(loader).toHaveBeenCalledTimes(1);
  });
});
