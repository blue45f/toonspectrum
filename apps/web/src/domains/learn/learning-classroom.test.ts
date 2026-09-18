import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  CLASSROOM_STORAGE_KEY,
  CLASSROOM_TEMPLATES,
  createClassroomPlan,
  loadClassroomPlan,
  parseClassroomPlan,
  saveClassroomPlan,
} from "./learning-classroom";

describe("academy classroom plan", () => {
  it("creates bounded curriculum templates with valid week ordering", () => {
    assert.equal(CLASSROOM_TEMPLATES.length, 3);
    for (const template of CLASSROOM_TEMPLATES) {
      const plan = createClassroomPlan(template.id);
      assert.equal(plan.templateId, template.id);
      assert.deepEqual(plan.weeks.map((week) => week.week), plan.weeks.map((_, index) => index + 1));
      assert.ok(plan.weeks.every((week) => week.lessonIds.length > 0));
    }
  });

  it("recovers safely from malformed or unsupported storage", () => {
    for (const raw of [null, "", "{", "[]", "null", JSON.stringify({ version: 2 }), "x".repeat(250_001)]) {
      const plan = parseClassroomPlan(raw);
      assert.equal(plan.version, 1);
      assert.equal(plan.templateId, "webtoon-foundation");
    }
  });

  it("drops unknown lesson and external-resource ids from untrusted input", () => {
    const base = createClassroomPlan("story-direction");
    const raw = JSON.stringify({
      ...base,
      weeks: [{ week: 99, title: "검증", summary: "", lessonIds: ["story-board", "unknown"], resourceIds: ["kocca-storyboard", "bad"] }],
      assignments: [{ id: "a", title: "콘티", week: 99, lessonId: "unknown", dueDate: "2026-10-01", notes: "memo" }],
    });
    const parsed = parseClassroomPlan(raw);
    assert.deepEqual(parsed.weeks[0].lessonIds, ["story-board"]);
    assert.deepEqual(parsed.weeks[0].resourceIds, ["kocca-storyboard"]);
    assert.equal(parsed.assignments[0].week, 1);
    assert.equal(parsed.assignments[0].lessonId, null);
  });

  it("persists through the small storage contract and handles storage denial", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const plan = createClassroomPlan("visual-production");
    assert.equal(saveClassroomPlan(storage, plan), true);
    assert.equal(values.has(CLASSROOM_STORAGE_KEY), true);
    assert.equal(loadClassroomPlan(storage).templateId, "visual-production");
    assert.equal(saveClassroomPlan({ setItem: () => { throw new Error("denied"); } }, plan), false);
    assert.equal(loadClassroomPlan({ getItem: () => { throw new Error("denied"); } }).version, 1);
  });
});
