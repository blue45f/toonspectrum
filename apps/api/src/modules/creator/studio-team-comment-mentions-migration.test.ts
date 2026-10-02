import { readFile } from "node:fs/promises";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { creatorWorkTeamCommentMessages } from "../../platform/database/schema";

describe("Studio team comment mentions persistence contract", () => {
  it("stores a bounded mentions snapshot on each message in the Drizzle schema", () => {
    const messages = getTableConfig(creatorWorkTeamCommentMessages);
    const mentions = messages.columns.find((column) => column.name === "mentions");

    expect(mentions?.columnType).toBe("PgJsonb");
    expect(mentions?.notNull).toBe(true);
    expect(mentions?.hasDefault).toBe(true);
    expect(messages.checks.map((entry) => entry.name)).toContain(
      "creator_work_team_comment_message_mentions_check"
    );
  });

  it("ships an idempotent forward-only migration for existing databases", async () => {
    const migration = await readFile(new URL(
      "../../platform/database/migrations/0100_creator_work_team_comment_mentions.sql",
      import.meta.url
    ), "utf8");

    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "mentions" jsonb NOT NULL DEFAULT \'[]\'::jsonb'
    );
    expect(migration).toContain(
      'DROP CONSTRAINT IF EXISTS "creator_work_team_comment_message_mentions_check"'
    );
    expect(migration).toContain(
      'ADD CONSTRAINT "creator_work_team_comment_message_mentions_check"'
    );
    expect(migration).toContain("jsonb_array_length(\"mentions\") <= 20");
    expect(migration).toContain("mention ->> 'name'");
    expect(migration).toContain("mention -> 'userId'");
    expect(migration).not.toMatch(/DROP\s+TABLE/iu);
    expect(migration).not.toMatch(/DROP\s+COLUMN/iu);
    expect(migration).not.toMatch(/TRUNCATE/iu);
  });
});
