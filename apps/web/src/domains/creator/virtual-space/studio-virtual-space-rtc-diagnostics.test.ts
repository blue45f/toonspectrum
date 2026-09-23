// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioLiveCollaborationContextValue } from "../live/studio-live-collaboration-context";
import {
  readStudioMediaDiagnostics,
  studioRtcLiveStatus,
} from "./studio-virtual-space-rtc-diagnostics";

const descriptor = (value: unknown) => ({ configurable: true, value });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Virtual Studio RTC diagnostics", () => {
  it("reads capability and permission state without requesting media", async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", descriptor({ getUserMedia }));
    Object.defineProperty(navigator, "permissions", descriptor({
      query: vi.fn(async ({ name }: { name: string }) => ({ state: name === "microphone" ? "prompt" : "denied" })),
    }));
    Object.defineProperty(globalThis, "isSecureContext", descriptor(true));
    vi.stubGlobal("RTCPeerConnection", class RTCPeerConnection {});

    await expect(readStudioMediaDiagnostics()).resolves.toEqual({
      secureContext: true,
      webRtcSupported: true,
      mediaDevicesSupported: true,
      microphone: "prompt",
      camera: "denied",
    });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports unsupported devices without producing a browser permission prompt", async () => {
    Object.defineProperty(navigator, "mediaDevices", descriptor(undefined));
    Object.defineProperty(navigator, "permissions", descriptor(undefined));
    Object.defineProperty(globalThis, "isSecureContext", descriptor(false));
    vi.stubGlobal("RTCPeerConnection", undefined);

    await expect(readStudioMediaDiagnostics()).resolves.toEqual({
      secureContext: false,
      webRtcSupported: false,
      mediaDevicesSupported: false,
      microphone: "unsupported",
      camera: "unsupported",
    });
  });

  it("separates workspace role, room admission and ready transport states", () => {
    const base = {
      room: null,
      mode: "server",
      availability: "ready",
      canChat: true,
      serverAvailable: true,
      usingLocalFallback: false,
      sync: { phase: "ready" },
      recovery: null,
    } as unknown as StudioLiveCollaborationContextValue;

    expect(studioRtcLiveStatus({ ...base, canChat: false })).toBe("workspace-read-only");
    expect(studioRtcLiveStatus({ ...base, sync: { phase: "admission-denied" } } as StudioLiveCollaborationContextValue))
      .toBe("admission-denied");

    Object.defineProperty(globalThis, "isSecureContext", descriptor(true));
    vi.stubGlobal("RTCPeerConnection", class RTCPeerConnection {});
    const direct = {};
    expect(studioRtcLiveStatus({
      ...base,
      room: { ready: true, mode: "server", direct },
    } as unknown as StudioLiveCollaborationContextValue)).toBe("ready");
  });
});
