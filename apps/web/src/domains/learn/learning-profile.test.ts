import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  DEFAULT_LEARNING_PROFILE,
  LEARNING_PROFILE_STORAGE_KEY,
  loadLearningProfile,
  parseLearningProfile,
  saveLearningProfile,
} from "./learning-profile";

describe("learning profile persistence", () => {
  it("recovers safely from missing, malformed, oversized and unsupported records", () => {
    for (const raw of [null, "", "{", "null", "[]", "x".repeat(10_001), JSON.stringify({ version: 2 })]) {
      assert.deepEqual(parseLearningProfile(raw), DEFAULT_LEARNING_PROFILE);
    }
  });

  it("keeps valid fields and defaults each invalid field independently", () => {
    assert.deepEqual(parseLearningProfile(JSON.stringify({ version: 1, goal: "visual", level: "advanced", sessionMinutes: 45 })), {
      version: 1,
      goal: "visual",
      level: "advanced",
      sessionMinutes: 45,
    });
    assert.deepEqual(parseLearningProfile(JSON.stringify({ version: 1, goal: "unknown", level: 7, sessionMinutes: 999 })), DEFAULT_LEARNING_PROFILE);
  });

  it("returns independent default objects", () => {
    const first = parseLearningProfile(null);
    const second = parseLearningProfile(null);
    assert.notEqual(first, second);
  });

  it("loads and saves through a bounded storage contract", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const profile = { version: 1 as const, goal: "publish" as const, level: "advanced" as const, sessionMinutes: 45 as const };
    assert.equal(saveLearningProfile(storage, profile), true);
    assert.equal(values.has(LEARNING_PROFILE_STORAGE_KEY), true);
    assert.deepEqual(loadLearningProfile(storage), profile);
  });

  it("does not crash when browser storage is unavailable", () => {
    const unavailable = {
      getItem: () => { throw new DOMException("denied", "SecurityError"); },
      setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
    };
    assert.deepEqual(loadLearningProfile(unavailable), DEFAULT_LEARNING_PROFILE);
    assert.equal(saveLearningProfile(unavailable, DEFAULT_LEARNING_PROFILE), false);
    assert.deepEqual(loadLearningProfile(null), DEFAULT_LEARNING_PROFILE);
    assert.equal(saveLearningProfile(null, DEFAULT_LEARNING_PROFILE), false);
  });
});
