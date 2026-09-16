import { describe, expect, it } from "vitest";

import {
  canManageCommunityCafe,
  canModerateCommunityCafe,
  canPublishCommunityCafePost,
  communityCafeRoleRank,
} from "./community-governance";

describe("community cafe role policy", () => {
  it("orders owner, admin, moderator, member and anonymous roles", () => {
    expect(communityCafeRoleRank("owner")).toBeGreaterThan(
      communityCafeRoleRank("admin"),
    );
    expect(communityCafeRoleRank("admin")).toBeGreaterThan(
      communityCafeRoleRank("moderator"),
    );
    expect(communityCafeRoleRank("moderator")).toBeGreaterThan(
      communityCafeRoleRank("member"),
    );
    expect(communityCafeRoleRank(null)).toBe(0);
  });

  it("separates management and moderation privileges", () => {
    expect(canManageCommunityCafe("owner")).toBe(true);
    expect(canManageCommunityCafe("admin")).toBe(true);
    expect(canManageCommunityCafe("moderator")).toBe(false);
    expect(canModerateCommunityCafe("moderator")).toBe(true);
    expect(canModerateCommunityCafe("member")).toBe(false);
  });

  it("enforces member versus staff posting policy", () => {
    expect(canPublishCommunityCafePost("member", "members")).toBe(true);
    expect(canPublishCommunityCafePost("member", "staff")).toBe(false);
    expect(canPublishCommunityCafePost("moderator", "staff")).toBe(true);
    expect(canPublishCommunityCafePost(null, "members")).toBe(false);
  });
});
