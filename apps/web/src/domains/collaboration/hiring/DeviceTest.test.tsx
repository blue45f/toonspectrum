// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeviceTest } from "./CreatorMeetingPanel";

vi.mock("../collaboration-ui", () => ({ CollabField: () => null, CollabNotice: () => null, collabButton: "", collabInput: "", collabPrimary: "" }));
vi.mock("@/infrastructure/api", () => ({ api: {}, getApiErrorMessage: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
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
