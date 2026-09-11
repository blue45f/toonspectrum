import { describe, expect, it } from "vitest";

import { aggregateStudioAnalytics } from "./studio-analytics";
import { planStudioAutomationRecipe } from "./studio-automation-recipe";
import { auditStudioPresentation } from "./studio-presentation-layout";
import { matchesStudioProjectStorageEvent } from "./studio-project-storage-event";
import { planStudioStoryboard } from "./studio-storyboard-planner";
import { planStudioTemplateApplication } from "./studio-template-system";
import { buildStudioMotionSchedule, planStudioVoiceRegeneration } from "./studio-voice-motion";
import { planStudioWebtoon3dRender } from "./studio-webtoon-3d-render";
import { analyzeStudioWebtoonQuality } from "./studio-webtoon-quality";
import {
  createDefaultStudioProjectFeatureSuite,
  ensureStudioProjectFeatureSuite,
  readStudioProjectFeatureSuite,
  studioProjectFeatureSuiteStorageKey,
  updateStudioProjectFeatureSuite,
} from "./studio-project-feature-suite-store";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("Studio project feature suite store", () => {
  it("creates one valid, executable state for all connected feature models", () => {
    const state = createDefaultStudioProjectFeatureSuite(
      "project-alpha",
      "2026-09-11T03:00:00.000Z",
    );

    expect(planStudioStoryboard(state.storyBeats).shots).toHaveLength(3);
    expect(analyzeStudioWebtoonQuality(state.quality).score).toBeGreaterThan(0);
    expect(planStudioWebtoon3dRender(state.render3d.scene, state.render3d.request).status).toBe("ready");
    expect(planStudioVoiceRegeneration({
      profiles: state.voiceMotion.profiles,
      lines: state.voiceMotion.lines,
      existingSegments: state.voiceMotion.segments,
      commercialUse: true,
      now: "2026-09-11T03:00:00.000Z",
    }).status).toBe("ready");
    expect(buildStudioMotionSchedule(state.voiceMotion.cues).at(-1)?.endMs).toBeGreaterThan(0);
    expect(planStudioTemplateApplication(state.design.template, state.design.values).status).toBe("ready");
    expect(auditStudioPresentation(state.design.slides).status).toBe("ready");
    expect(aggregateStudioAnalytics(state.analyticsEvents).episodes).toHaveLength(1);

    const automation = planStudioAutomationRecipe(
      state.automation.recipe,
      state.automation.recipe.steps.map((step) => step.commandId),
      state.automation.context,
    );
    expect(automation.status).toBe("confirmation");
    expect(automation.confirmationStepIds).toEqual(["step:publish"]);
  });

  it("persists project-isolated updates through one storage authority", () => {
    const storage = new MemoryStorage();
    const initial = ensureStudioProjectFeatureSuite(storage, "project-alpha");
    expect(initial.storyBeats).toHaveLength(3);

    const next = updateStudioProjectFeatureSuite(storage, "project-alpha", (current) => ({
      ...current,
      storyBeats: [
        ...current.storyBeats,
        {
          id: "beat:extra",
          sceneId: "scene:extra",
          order: current.storyBeats.length,
          kind: "transition",
          summary: "새 장면으로 전환한다",
          dialogue: "",
          characterIds: [],
          locationId: null,
        },
      ],
    }));

    expect(next.storyBeats).toHaveLength(4);
    expect(readStudioProjectFeatureSuite(storage, "project-alpha")?.storyBeats).toHaveLength(4);
    expect(readStudioProjectFeatureSuite(storage, "project-beta")).toBeNull();
    expect(storage.values.has(studioProjectFeatureSuiteStorageKey("project-alpha"))).toBe(true);
  });

  it("matches storage events exactly instead of using project-id substrings", () => {
    const key = studioProjectFeatureSuiteStorageKey("project-alpha");
    const collidingKey = studioProjectFeatureSuiteStorageKey("project-alpha-copy");

    expect(matchesStudioProjectStorageEvent(key, key)).toBe(true);
    expect(matchesStudioProjectStorageEvent(null, key)).toBe(true);
    expect(matchesStudioProjectStorageEvent(collidingKey, key)).toBe(false);
    expect(matchesStudioProjectStorageEvent(`prefix:${key}:suffix`, key)).toBe(false);
  });

  it("falls back safely when persisted data is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem(studioProjectFeatureSuiteStorageKey("project-alpha"), "{invalid");

    expect(readStudioProjectFeatureSuite(storage, "project-alpha")).toBeNull();
    expect(ensureStudioProjectFeatureSuite(storage, "project-alpha").projectId).toBe("project-alpha");
  });
});
