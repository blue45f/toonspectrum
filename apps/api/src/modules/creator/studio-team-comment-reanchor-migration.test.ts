import { readFile } from "node:fs/promises";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  creatorWorkTeamCommentActivities,
  creatorWorkTeamCommentMutations,
} from "../../../../../lib/db/schema";

describe("Studio team comment re-anchor persistence contract", () => {
  it("allows message-free re-anchor activity and retry receipts in the Drizzle schema", () => {
    const activity = getTableConfig(creatorWorkTeamCommentActivities);
    const mutation = getTableConfig(creatorWorkTeamCommentMutations);
    const activityChecks = activity.checks.map((entry) => entry.name);
    const mutationChecks = mutation.checks.map((entry) => entry.name);

    expect(activityChecks).toContain("creator_work_team_comment_activity_action_check");
    expect(activityChecks).toContain("creator_work_team_comment_activity_message_state_check");
    expect(mutationChecks).toContain("creator_work_team_comment_mutation_operation_check");
    expect(mutationChecks).toContain("creator_work_team_comment_mutation_message_state_check");
    expect(mutation.columns.find((column) => column.name === "messageId")?.notNull).toBe(false);
  });

  it("ships a forward-only migration for existing databases", async () => {
    const migration = await readFile(new URL(
      "../../../../../lib/db/migrations/0016_creator_work_team_comment_reanchor.sql",
      import.meta.url
    ), "utf8");

    expect(migration).toContain("'reanchored'");
    expect(migration).toContain("'thread_reanchor'");
    expect(migration).toContain('ALTER COLUMN "messageId" DROP NOT NULL');
    expect(migration).toContain(
      'ADD CONSTRAINT "creator_work_team_comment_mutation_message_state_check"'
    );
    expect(migration).toContain(
      '("operation" IN (\'thread_create\', \'reply_add\') AND "messageId" IS NOT NULL)'
    );
    expect(migration).toContain(
      '("operation" = \'thread_reanchor\' AND "messageId" IS NULL)'
    );
    expect(migration).not.toMatch(/DROP\s+TABLE/iu);
    expect(migration).not.toMatch(/TRUNCATE/iu);
  });
});
