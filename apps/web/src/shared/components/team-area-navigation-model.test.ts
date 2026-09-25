import { describe, expect, it } from "vitest";

import { teamAreaSectionForPath } from "./team-area-navigation-model";

describe("teamAreaSectionForPath", () => {
  it.each([
    ["/team", "overview"],
    ["/team/", "overview"],
    ["/team/people", "people"],
    ["/team/people/workspace-a", "people"],
    ["/production/workspaces", "people"],
    ["/production/workspaces/workspace-a/usage", "people"],
    ["/team/recruiting", "recruiting"],
    ["/team/recruiting/interviews", "recruiting"],
    ["/collaborate/workspace", "recruiting"],
  ] as const)("maps %s to %s", (pathname, expected) => {
    expect(teamAreaSectionForPath(pathname)).toBe(expected);
  });
});
