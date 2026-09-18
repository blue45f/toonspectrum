import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { CURATED_LEARNING_RESOURCES } from "../../learn/learning-resources";
import {
  recommendStudioLearningResources,
  resolveStudioLearningFocus,
} from "./studio-contextual-learning";

describe("Studio contextual learning", () => {
  it("maps assistant tools to the production skill that the artist is using", () => {
    assert.deepEqual(resolveStudioLearningFocus("scroll-pacing", "lineart").primarySteps, ["storyboard"]);
    assert.deepEqual(resolveStudioLearningFocus("color-harmony", "storyboard").primarySteps, ["color"]);
    assert.deepEqual(resolveStudioLearningFocus("croquis-pose", "flat-color").primarySteps, ["character", "drawing"]);
    assert.deepEqual(resolveStudioLearningFocus("spec-slicer", "draft").primarySteps, ["publish"]);
  });

  it("lets focus timer follow the currently selected production stage", () => {
    assert.deepEqual(resolveStudioLearningFocus("focus-timer", "background-3d").primarySteps, ["background", "3d"]);
    assert.deepEqual(resolveStudioLearningFocus("focus-timer", "finishing-sfx").primarySteps, ["lettering", "publish"]);
  });

  it("prefers verified internal practice material for the active context", () => {
    const focus = resolveStudioLearningFocus("croquis-pose", "storyboard");
    const results = recommendStudioLearningResources(CURATED_LEARNING_RESOURCES, focus, 4);
    assert.equal(results.length, 4);
    assert.equal(results[0].verified, true);
    assert.equal(results[0].source, "toonstudio");
    assert.ok(results.some((resource) => resource.practicePath));
    assert.ok(results.every((resource) => resource.steps.some((step) => [
      ...focus.primarySteps,
      ...focus.secondarySteps,
    ].includes(step))));
  });

  it("bounds recommendation count even when an invalid large value arrives", () => {
    const focus = resolveStudioLearningFocus("spec-slicer", "storyboard");
    const results = recommendStudioLearningResources(CURATED_LEARNING_RESOURCES, focus, 999);
    assert.ok(results.length <= 8);
    assert.ok(results.length > 0);
  });
});
