import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudioLiveGateway } from "./studio-live.gateway";
import { StudioTeamCommentLivePublisher } from "./studio-team-comment-live.publisher";

const validEvent = {
  version: 1 as const,
  workId: "work-1",
  threadId: "thread-1",
  activitySequence: "42",
  kind: "replied" as const,
};

describe("StudioTeamCommentLivePublisher", () => {
  const gateway = {
    publishTeamCommentChanged: vi.fn(),
  };

  beforeEach(() => {
    gateway.publishTeamCommentChanged.mockReset();
  });

  function publisher(): StudioTeamCommentLivePublisher {
    return new StudioTeamCommentLivePublisher(gateway as unknown as StudioLiveGateway);
  }

  it("validates and forwards the canonical bounded invalidation event", () => {
    gateway.publishTeamCommentChanged.mockReturnValue(true);

    expect(publisher().publish(validEvent)).toEqual({
      published: true,
      event: validEvent,
    });
    expect(gateway.publishTeamCommentChanged).toHaveBeenCalledOnce();
    expect(gateway.publishTeamCommentChanged).toHaveBeenCalledWith(validEvent);
  });

  it.each([
    ["unknown mutation kind", { ...validEvent, kind: "deleted" }],
    ["cross-contract extra data", { ...validEvent, body: "never broadcast comment text" }],
    ["unbounded activity sequence", { ...validEvent, activitySequence: "9".repeat(20) }],
  ])("drops %s before the gateway boundary", (_label, event) => {
    expect(publisher().publish(event)).toEqual({
      published: false,
      reason: "invalid_event",
    });
    expect(gateway.publishTeamCommentChanged).not.toHaveBeenCalled();
  });

  it("reports an uninitialized gateway without throwing into the HTTP mutation", () => {
    gateway.publishTeamCommentChanged.mockReturnValue(false);

    expect(publisher().publish(validEvent)).toEqual({
      published: false,
      reason: "gateway_unavailable",
    });
  });

  it("contains synchronous adapter failures as best-effort delivery failures", () => {
    gateway.publishTeamCommentChanged.mockImplementation(() => {
      throw new Error("adapter unavailable");
    });

    expect(() => publisher().publish(validEvent)).not.toThrow();
    expect(publisher().publish(validEvent)).toEqual({
      published: false,
      reason: "gateway_unavailable",
    });
  });
});
