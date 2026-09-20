// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeviceTest } from "./CreatorMeetingPanel";

vi.mock("../collaboration-ui", () => ({ CollabField: () => null, CollabNotice: () => null, collabButton: "", collabInput: "", collabPrimary: "" }));
vi.mock("@/infrastructure/api", () => ({ api: {}, getApiErrorMessage: vi.fn() }));
beforeEach(() => { vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("local device test", () => {
  it("opens devices only by gesture and stops tracks on unmount", async () => {
    const stop = vi.fn(), getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    const view = render(<DeviceTest />); expect(getUserMedia).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByText("장치 테스트 시작")); });
    expect(getUserMedia).toHaveBeenCalledOnce(); view.unmount(); expect(stop).toHaveBeenCalledOnce();
  });
  it("a stop gesture while permission is pending prevents late capture", async () => {
    let resolve!: (value: MediaStream) => void; const stop = vi.fn();
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((r) => { resolve = r; }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    render(<DeviceTest />); fireEvent.click(screen.getByText("장치 테스트 시작")); fireEvent.click(screen.getByText("장치 끄기"));
    await act(async () => { resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
    expect(stop).toHaveBeenCalledOnce(); expect(screen.getByRole("status").textContent).toBe("꺼짐");
  });
});


describe("device lifecycle cleanup", () => {
  function device() {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    return { stop, getUserMedia };
  }
  it.each([["audio", true, false], ["video", false, true]])("opens only the requested %s capability", async (mode, audio, video) => {
    const { getUserMedia, stop } = device(); render(<DeviceTest />);
    fireEvent.change(screen.getByRole("combobox", { hidden: true }), { target: { value: mode } });
    await act(async () => { fireEvent.click(screen.getByText("장치 테스트 시작")); });
    expect(getUserMedia).toHaveBeenCalledWith({ audio, video });
    fireEvent.click(screen.getByText("장치 끄기")); expect(stop).toHaveBeenCalledOnce();
  });
  it("releases all tracks on page hiding and never restarts on return", async () => {
    const { getUserMedia, stop } = device(); render(<DeviceTest />);
    await act(async () => { fireEvent.click(screen.getByText("장치 테스트 시작")); });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange")); expect(stop).toHaveBeenCalledOnce();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange")); expect(getUserMedia).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("꺼짐");
  });
  it("stops the stream when its disclosure closes", async () => {
    const { stop } = device(); const view = render(<DeviceTest />);
    const details = view.container.querySelector("details")!;
    details.open = true; fireEvent(details, new Event("toggle"));
    await act(async () => { fireEvent.click(screen.getByText("장치 테스트 시작")); });
    details.open = false; fireEvent(details, new Event("toggle")); expect(stop).toHaveBeenCalledOnce();
  });
  it("stops actual capture after thirty seconds and does not reopen it", async () => {
    vi.useFakeTimers(); const { getUserMedia, stop } = device(); render(<DeviceTest />);
    await act(async () => { fireEvent.click(screen.getByText("장치 테스트 시작")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(stop).toHaveBeenCalledOnce(); expect(getUserMedia).toHaveBeenCalledOnce();
  });
  it("does not duplicate permission prompts, including immediate double clicks", async () => {
    let finish!: (value: MediaStream) => void; const stop = vi.fn();
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { finish = resolve; }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    render(<DeviceTest />);
    fireEvent.click(screen.getByText("장치 테스트 시작")); fireEvent.click(screen.getByText("장치 테스트 시작"));
    fireEvent.click(screen.getByText("장치 끄기"));
    expect(getUserMedia).toHaveBeenCalledOnce();
    await act(async () => { finish({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
    expect(stop).toHaveBeenCalledOnce(); expect(screen.getByRole("status").textContent).toBe("꺼짐");
  });
  it("a late permission error after stop cannot replace the stopped state", async () => {
    let reject!: (error: Error) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((_resolve, no) => { reject = no; }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    render(<DeviceTest />); fireEvent.click(screen.getByText("장치 테스트 시작")); fireEvent.click(screen.getByText("장치 끄기"));
    await act(async () => { reject(new Error("permission denied")); });
    expect(screen.getByRole("status").textContent).toBe("꺼짐");
  });
  it("times out an unanswered permission prompt without pretending it can close the browser dialog", async () => {
    vi.useFakeTimers(); let finish!: (value: MediaStream) => void; const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(() => new Promise<MediaStream>((resolve) => { finish = resolve; })) } });
    render(<DeviceTest />); fireEvent.click(screen.getByText("장치 테스트 시작"));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(screen.getByRole("status").textContent).toContain("권한 응답이 없어");
    await act(async () => { finish({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
    expect(stop).toHaveBeenCalledOnce(); expect(screen.getByRole("status").textContent).toContain("권한 응답이 없어");
  });
});
