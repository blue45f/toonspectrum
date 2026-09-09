import { describe, expect, it, vi } from "vitest";

import {
  openStudioHelpHub,
  studioHelpHubListenerCount,
  subscribeStudioHelpHub,
} from "./studio-help-hub-channel";

describe("studio help hub channel", () => {
  it("reports an unmounted host instead of silently accepting a request", () => {
    expect(studioHelpHubListenerCount()).toBe(0);
    expect(openStudioHelpHub({ initialTab: "solve" })).toBe(false);
  });

  it("delivers a request only to live subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioHelpHub(listener);
    expect(studioHelpHubListenerCount()).toBe(1);
    expect(openStudioHelpHub({ initialTab: "learn", toolCommandId: "tool.pen" })).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      initialTab: "learn",
      toolCommandId: "tool.pen",
    });
    unsubscribe();
    expect(studioHelpHubListenerCount()).toBe(0);
  });
});
