// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWebtoonAssistantModal } from "./StudioWebtoonAssistantModal";

import type { StudioWebtoonAssistantModalProps } from "./StudioWebtoonAssistantContent";

const request = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./studio-webtoon-assistant-loader", () => ({ studioWebtoonAssistantLoader: request }));
const mounted = vi.fn();
function Fixture(props: StudioWebtoonAssistantModalProps) {
  const [value, setValue] = useState("");
  useEffect(() => { mounted(); }, []);
  if (!props.open) return null;
  return <section aria-label="assistant fixture"><input aria-label="draft" value={value} onChange={(event) => setValue(event.target.value)} /><span>{props.canvasWidth} × {props.canvasHeight}</span><button onClick={props.onClose}>close fixture</button></section>;
}
const module = { StudioWebtoonAssistantModal: Fixture };
function deferred() {
  let resolve!: (value: typeof module) => void;
  const promise = new Promise<typeof module>((accept) => { resolve = accept; });
  return { promise, resolve };
}
beforeEach(() => { request.load.mockReset(); mounted.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("assistant intent-only loading", () => {
  it("does not request code or install a UI while closed", () => {
    render(<StrictMode><StudioWebtoonAssistantModal open={false} onClose={() => {}} /></StrictMode>);
    expect(request.load).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(mounted).not.toHaveBeenCalled();
  });
  it("loads on first open and forwards the unchanged canvas and close props", async () => {
    request.load.mockResolvedValue(module);
    const onClose = vi.fn();
    const result = render(<StudioWebtoonAssistantModal open={false} onClose={onClose} canvasWidth={690} canvasHeight={15000} />);
    result.rerender(<StudioWebtoonAssistantModal open onClose={onClose} canvasWidth={690} canvasHeight={15000} />);
    expect(screen.getByRole("status").textContent).toContain("여는 중");
    expect(await screen.findByText("690 × 15000")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "close fixture" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(request.load).toHaveBeenCalledOnce();
  });
  it("retains the same mounted instance and unsaved input across close/reopen", async () => {
    request.load.mockResolvedValue(module);
    const result = render(<StudioWebtoonAssistantModal open onClose={() => {}} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "draft" }), { target: { value: "작업 중" } });
    result.rerender(<StudioWebtoonAssistantModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    result.rerender(<StudioWebtoonAssistantModal open onClose={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("작업 중");
    expect(mounted).toHaveBeenCalledOnce();
    expect(request.load).toHaveBeenCalledOnce();
  });
  it("keeps the canvas mounted and retries a failed import without navigation", async () => {
    request.load.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce(module);
    render(<><canvas data-testid="canvas" /><StudioWebtoonAssistantModal open onClose={() => {}} /></>);
    const canvas = screen.getByTestId("canvas");
    expect(await screen.findByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("textbox")).not.toBeNull();
    expect(screen.getByTestId("canvas")).toBe(canvas);
    expect(request.load).toHaveBeenCalledTimes(2);
  });
  it("never mounts a late result after the pending request was cancelled", async () => {
    const pending = deferred(); request.load.mockReturnValue(pending.promise);
    const result = render(<StudioWebtoonAssistantModal open onClose={() => {}} />);
    result.rerender(<StudioWebtoonAssistantModal open={false} onClose={() => {}} />);
    await act(async () => pending.resolve(module));
    expect(mounted).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    result.rerender(<StudioWebtoonAssistantModal open onClose={() => {}} />);
    expect(await screen.findByRole("textbox")).not.toBeNull();
  });
  it("supports Escape and the explicit cancel button while loading", () => {
    const pending = deferred(); request.load.mockReturnValue(pending.promise);
    const onClose = vi.fn();
    render(<StudioWebtoonAssistantModal open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "열기 취소" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("does not mount a late result after unmounting", async () => {
    const pending = deferred(); request.load.mockReturnValue(pending.promise);
    const result = render(<StudioWebtoonAssistantModal open onClose={() => {}} />);
    result.unmount();
    await act(async () => pending.resolve(module));
    expect(mounted).not.toHaveBeenCalled();
  });
  it("does not duplicate the content mount under StrictMode replay", async () => {
    request.load.mockResolvedValue(module);
    render(<StrictMode><StudioWebtoonAssistantModal open onClose={() => {}} /></StrictMode>);
    await waitFor(() => expect(screen.getAllByRole("textbox")).toHaveLength(1));
  });
});
