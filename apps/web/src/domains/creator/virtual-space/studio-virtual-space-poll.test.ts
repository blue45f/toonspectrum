import { describe, expect, it } from "vitest";

import {
  castStudioPollVote,
  closeStudioPoll,
  createStudioPoll,
  parseStudioPoll,
  serializeStudioPoll,
  studioPollStatus,
  studioPollTimeLeftMs,
  tallyStudioPoll,
  STUDIO_POLL_MAX_OPTIONS,
  STUDIO_POLL_MIN_OPTIONS,
} from "./studio-virtual-space-poll";

const NOW = 1_700_000_000_000;

function makePoll(overrides: Record<string, unknown> = {}) {
  return createStudioPoll({
    question: "오늘 점심 메뉴는?",
    options: ["김밥", "라면", "샐러드"],
    anonymous: false,
    createdBySessionId: "alice",
    createdByName: "앨리스",
    nowMs: NOW,
    id: "poll-1",
    ...overrides,
  });
}

describe("studio-virtual-space-poll", () => {
  it("creates a poll with validated options", () => {
    const result = makePoll();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.poll.options).toHaveLength(3);
    expect(result.poll.question).toBe("오늘 점심 메뉴는?");
    expect(result.poll.votes).toHaveLength(0);
    expect(result.poll.closed).toBe(false);
    expect(result.poll.deadlineMs).toBeNull();
  });

  it("rejects invalid poll definitions", () => {
    expect(makePoll({ question: " " }).ok).toBe(false);
    expect(makePoll({ question: "x".repeat(201) }).ok).toBe(false);
    expect(makePoll({ options: ["하나"] }).ok).toBe(false);
    expect(makePoll({ options: Array(STUDIO_POLL_MAX_OPTIONS + 1).fill("선택") }).ok).toBe(false);
    expect(makePoll({ options: ["a", "a"] }).ok).toBe(false);
    expect(makePoll({ options: ["a", "  "] }).ok).toBe(false);
    expect(makePoll({ options: ["a", "x".repeat(61)] }).ok).toBe(false);
    expect(makePoll({ closesInMs: -1000 }).ok).toBe(false);
    expect(makePoll({ createdBySessionId: "" }).ok).toBe(false);
    expect(STUDIO_POLL_MIN_OPTIONS).toBe(2);
  });

  it("records a deadline and reports status transitions", () => {
    const result = makePoll({ closesInMs: 60_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.poll.deadlineMs).toBe(NOW + 60_000);
    expect(studioPollStatus(result.poll, NOW)).toBe("open");
    expect(studioPollTimeLeftMs(result.poll, NOW)).toBe(60_000);
    expect(studioPollStatus(result.poll, NOW + 60_001)).toBe("expired");
    expect(studioPollTimeLeftMs(result.poll, NOW + 60_001)).toBe(0);
    expect(studioPollStatus(closeStudioPoll(result.poll), NOW)).toBe("closed");
    const noDeadline = makePoll();
    expect(noDeadline.ok).toBe(true);
    if (noDeadline.ok) expect(studioPollTimeLeftMs(noDeadline.poll, NOW)).toBeNull();
  });

  it("prevents duplicate votes from the same voter", () => {
    const created = makePoll();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const optionId = created.poll.options[0].id;
    const first = castStudioPollVote(created.poll, {
      voterSessionId: "bob",
      voterName: "밥",
      optionId,
      nowMs: NOW,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = castStudioPollVote(first.poll, {
      voterSessionId: "bob",
      voterName: "밥",
      optionId: created.poll.options[1].id,
      nowMs: NOW,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("duplicate-vote");
    const tally = tallyStudioPoll(first.poll);
    expect(tally.totalVotes).toBe(1);
    expect(tally.uniqueVoters).toBe(1);
    expect(tally.results[0].optionId).toBe(optionId);
    expect(tally.results[0].count).toBe(1);
    expect(tally.results[0].percent).toBe(100);
    expect(tally.results[0].voters).toEqual([{ sessionId: "bob", name: "밥" }]);
  });

  it("keeps anonymous polls free of voter identities", () => {
    const created = makePoll({ anonymous: true, id: "poll-anon" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const voted = castStudioPollVote(created.poll, {
      voterSessionId: "bob",
      voterName: "밥",
      optionId: created.poll.options[1].id,
      nowMs: NOW,
    });
    expect(voted.ok).toBe(true);
    if (!voted.ok) return;
    const vote = voted.poll.votes[0];
    expect(vote.voterName).toBe("");
    expect(vote.voterSessionId).toBe("");
    expect(vote.receipt).not.toContain("bob");
    const again = castStudioPollVote(voted.poll, {
      voterSessionId: "bob",
      voterName: "밥",
      optionId: created.poll.options[0].id,
      nowMs: NOW,
    });
    expect(again.ok).toBe(false);
  });

  it("rejects votes on closed or expired polls and unknown options", () => {
    const created = makePoll({ closesInMs: 1_000, id: "poll-exp" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const expired = castStudioPollVote(created.poll, {
      voterSessionId: "bob",
      voterName: "밥",
      optionId: created.poll.options[0].id,
      nowMs: NOW + 2_000,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("poll-expired");
    const closed = castStudioPollVote(closeStudioPoll(created.poll), {
      voterSessionId: "bob",
      voterName: "밥",
      optionId: created.poll.options[0].id,
      nowMs: NOW,
    });
    expect(closed.ok).toBe(false);
    const unknown = castStudioPollVote(created.poll, {
      voterSessionId: "bob",
      voterName: "밥",
      optionId: "nope",
      nowMs: NOW,
    });
    expect(unknown.ok).toBe(false);
  });

  it("round-trips through serialization and rejects malformed payloads", () => {
    const created = makePoll({ id: "poll-ser" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const voted = castStudioPollVote(created.poll, {
      voterSessionId: "carol",
      voterName: "캐롤",
      optionId: created.poll.options[2].id,
      nowMs: NOW,
    });
    expect(voted.ok).toBe(true);
    if (!voted.ok) return;
    const restored = parseStudioPoll(serializeStudioPoll(voted.poll));
    expect(restored?.question).toBe("오늘 점심 메뉴는?");
    expect(restored?.votes).toHaveLength(1);
    expect(tallyStudioPoll(restored!).totalVotes).toBe(1);
    expect(parseStudioPoll("not json")).toBeNull();
    expect(parseStudioPoll(JSON.stringify({ id: "x" }))).toBeNull();
    const tampered = JSON.parse(serializeStudioPoll(voted.poll)) as Record<string, unknown>;
    tampered.options = ["bad"];
    expect(parseStudioPoll(JSON.stringify(tampered))).toBeNull();
  });
});
