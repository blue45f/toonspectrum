// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  requestAuthModalOpen,
  subscribeAuthModalRequests,
} from "./auth-modal-intent";

describe("auth modal intent", () => {
  it("delivers an immutable recovery intent and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAuthModalRequests(listener);

    requestAuthModalOpen({ reason: "free-ai", source: "studio-composition" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      reason: "free-ai",
      source: "studio-composition",
    });
    expect(Object.isFrozen(listener.mock.calls[0]![0])).toBe(true);

    unsubscribe();
    requestAuthModalOpen({ reason: "protected-action", source: "other" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
