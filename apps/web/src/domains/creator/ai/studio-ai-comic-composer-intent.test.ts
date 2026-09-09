import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consumeStudioAiComicComposerOpenRequest,
  requestStudioAiComicComposerOpen,
  subscribeStudioAiComicComposerOpenRequest,
  type StudioAiComicComposerIntentTarget,
} from "./studio-ai-comic-composer-intent";
import type { StudioAiComicComposerHandoff } from "./studio-ai-comic-composer-handoff";

class IntentTarget implements StudioAiComicComposerIntentTarget {
  private listeners = new Map<string, Set<EventListener>>();
  addEventListener(type: string, listener: EventListener) {
    const group = this.listeners.get(type) ?? new Set<EventListener>();
    group.add(listener);
    this.listeners.set(type, group);
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event: Event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

const HANDOFF = {
  version: 1,
  source: "episode-production-director",
  episodeTitle: "테스트",
  storyText: "테스트 대본",
  characterDescription: "주인공",
  variants: 2,
  modeLabel: "균형 제작",
  totalCuts: 2,
  projectedOutputCount: 4,
  generationWorkUnits: 4,
  scenes: [],
} satisfies StudioAiComicComposerHandoff;

afterEach(() => consumeStudioAiComicComposerOpenRequest());

describe("AI comic composer cross-surface intent", () => {
  it("delivers an already-pending full handoff exactly once", () => {
    requestStudioAiComicComposerOpen(HANDOFF, null);
    const listener = vi.fn();
    const target = new IntentTarget();
    const unsubscribe = subscribeStudioAiComicComposerOpenRequest(listener, target);

    expect(listener).toHaveBeenCalledWith(HANDOFF);
    expect(consumeStudioAiComicComposerOpenRequest()).toBeNull();
    unsubscribe();
  });

  it("delivers a mounted request and consumes it", () => {
    const target = new IntentTarget();
    const listener = vi.fn();
    const unsubscribe = subscribeStudioAiComicComposerOpenRequest(listener, target);

    requestStudioAiComicComposerOpen(HANDOFF, target);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(HANDOFF);
    unsubscribe();
  });
});
