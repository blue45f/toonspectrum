import { describe, expect, it } from "vitest";

import {
  createStudioSpatialInviteFragment,
  parseStudioSpatialInviteFragment,
  studioSpatialInviteDestination,
} from "./studio-spatial-invite-context";

const token = "A".repeat(43);

describe("spatial invitation context", () => {
  it("keeps the secret in the fragment and carries a non-authoritative project entry hint", () => {
    const hash = createStudioSpatialInviteFragment(token, {
      kind: "project-space",
      projectId: "work-123",
    });
    expect(hash).toBe(`#invite=${token}&entry=project-space&project=work-123`);
    expect(parseStudioSpatialInviteFragment(hash)).toEqual({
      token,
      context: { kind: "project-space", projectId: "work-123" },
    });
    expect(studioSpatialInviteDestination(
      { kind: "project-space", projectId: "work-123" },
      "workspace-1",
    )).toBe("/studio/p/work-123/space?lobby=1");
  });

  it("falls back to the team lobby for malformed or injected hints", () => {
    expect(parseStudioSpatialInviteFragment(
      `#invite=${token}&entry=project-space&project=..%2Fadmin`,
    )).toEqual({ token, context: { kind: "team-lobby" } });
    expect(parseStudioSpatialInviteFragment(
      "#invite=bad&entry=project-space&project=work-123",
    )).toEqual({ token: null, context: { kind: "team-lobby" } });
    expect(studioSpatialInviteDestination({ kind: "team-lobby" }, "workspace-1"))
      .toBe("/team?workspace=workspace-1&lobby=1");
  });

  it("routes interview invitations back through the hiring authority", () => {
    const hash = createStudioSpatialInviteFragment(token, { kind: "interview-waiting" });
    expect(parseStudioSpatialInviteFragment(hash).context)
      .toEqual({ kind: "interview-waiting" });
    expect(studioSpatialInviteDestination({ kind: "interview-waiting" }, "workspace-1"))
      .toBe("/team/recruiting?panel=rooms&waiting=1&workspace=workspace-1");
  });
});
