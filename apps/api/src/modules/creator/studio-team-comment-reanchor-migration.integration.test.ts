import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const INTEGRATION_URL =
  process.env.STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL?.trim() ||
  process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL or "
      + "STUDIO_LIVE_POSTGRES_INTEGRATION_URL; team comment migration invariants cannot be skipped"
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;
const MESSAGE_STATE_CONSTRAINT =
  "creator_work_team_comment_mutation_message_state_check";

interface Fixture {
  userId: string;
  workId: string;
  threadId: string;
  messageIds: [string, string, string];
}

interface PostgresConstraintError {
  constraint?: string;
}

// The caller-provided database must already have the forward migrations applied. Local runs skip
// this contract test unless an explicit direct PostgreSQL URL is supplied.
describeWithDirectPostgres("Studio team comment mutation message-state PostgreSQL invariant", () => {
  let pool: Pool;
  const fixtureUserIds: string[] = [];

  beforeAll(() => {
    if (!INTEGRATION_URL) throw new Error("integration URL was not provided");
    pool = new Pool({
      connectionString: INTEGRATION_URL,
      application_name: `toonspectrum-comment-message-state-${randomUUID()}`,
      max: 2,
    });
  });

  afterEach(async () => {
    const userIds = fixtureUserIds.splice(0);
    if (userIds.length === 0) return;
    await pool.query('DELETE FROM "user" WHERE "id" = ANY($1::text[])', [userIds]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function createFixture(): Promise<Fixture> {
    const userId = randomUUID();
    const workId = randomUUID();
    const threadId = randomUUID();
    const messageIds: [string, string, string] = [randomUUID(), randomUUID(), randomUUID()];

    await pool.query('INSERT INTO "user" ("id", "name") VALUES ($1, $2)', [
      userId,
      "Comment invariant integration",
    ]);
    fixtureUserIds.push(userId);
    await pool.query(
      'INSERT INTO "creator_work" ("id", "userId", "title") VALUES ($1, $2, $3)',
      [workId, userId, "Comment invariant integration"]
    );
    await pool.query(
      `INSERT INTO "creator_work_team_comment_thread"
         ("id", "workId", "anchor", "createdBy")
       VALUES ($1, $2, $3::jsonb, $4)`,
      [threadId, workId, JSON.stringify({ type: "page", pageId: "page-1" }), userId]
    );
    await Promise.all(messageIds.map((messageId, index) => pool.query(
      `INSERT INTO "creator_work_team_comment_message"
         ("id", "threadId", "authorUserId", "body")
       VALUES ($1, $2, $3, $4)`,
      [messageId, threadId, userId, `message-${index + 1}`]
    )));

    return { userId, workId, threadId, messageIds };
  }

  async function insertMutation(
    fixture: Fixture,
    operation: "thread_create" | "reply_add" | "thread_reanchor",
    messageId: string | null
  ) {
    return pool.query(
      `INSERT INTO "creator_work_team_comment_mutation"
         ("workId", "actorUserId", "mutationId", "operation", "requestHash",
          "threadId", "messageId", "response")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        fixture.workId,
        fixture.userId,
        randomUUID(),
        operation,
        "a".repeat(64),
        fixture.threadId,
        messageId,
        JSON.stringify({ ok: true }),
      ]
    );
  }

  it("accepts create/reply receipts with messages and re-anchor receipts without messages", async () => {
    const fixture = await createFixture();

    await expect(insertMutation(fixture, "thread_create", fixture.messageIds[0])).resolves.toBeDefined();
    await expect(insertMutation(fixture, "reply_add", fixture.messageIds[1])).resolves.toBeDefined();
    await expect(insertMutation(fixture, "thread_reanchor", null)).resolves.toBeDefined();
  });

  it.each([
    ["thread_create", null],
    ["reply_add", null],
    ["thread_reanchor", "message"],
  ] as const)("rejects the invalid %s/messageId combination", async (operation, messageState) => {
    const fixture = await createFixture();
    const messageId = messageState === "message" ? fixture.messageIds[0] : null;

    let rejection: PostgresConstraintError | undefined;
    try {
      await insertMutation(fixture, operation, messageId);
    } catch (error) {
      rejection = error as PostgresConstraintError;
    }

    expect(rejection?.constraint).toBe(MESSAGE_STATE_CONSTRAINT);
  });
});
