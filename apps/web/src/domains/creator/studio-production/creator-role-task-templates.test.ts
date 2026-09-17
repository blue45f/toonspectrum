import { describe, expect, it } from "vitest";

import {
  createCreatorRoleTemplateTasks,
  creatorRoleTaskTemplates,
} from "./creator-role-task-templates";

describe("creator role task templates", () => {
  it("shows only templates for active production roles", () => {
    expect(creatorRoleTaskTemplates(["lineart", "reviewer"]).map((entry) => entry.id))
      .toEqual(["lineart-pass", "review-gate"]);
  });

  it("creates real ordered tasks without granting a role assignment", () => {
    const selected = creatorRoleTaskTemplates(["story"])[0]!;
    const tasks = createCreatorRoleTemplateTasks(
      selected,
      "김작가",
      null,
      (index) => `generated-${index}`,
    );

    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      id: "generated-0",
      role: "story",
      assigneeIds: [],
      dependencyIds: [],
    });
    expect(tasks[1]?.dependencyIds).toEqual(["generated-0"]);
    expect(tasks[2]?.dependencyIds).toEqual(["generated-1"]);
  });
});
