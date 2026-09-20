import { describe, expect, it } from "vitest";
import { TOONSTUDIO_MOBILE_TABS, TOONSTUDIO_PRIMARY_NAVIGATION } from "../site-navigation";
import { supportsRoutePurposeScene } from "../site-experience/site-experience-policy";
import { workspaceNavigationActiveId } from "./workspace-navigation-model";

describe("studio-first navigation contract", () => {
  it.each([
    ["/", "workspace-home"], ["/home?scope=personal", "workspace-home"],
    ["/studio/p/a%2Fb/space/", "workspace-home"], ["/studio/p/a/review?view=inbox", "studio"],
    ["/production/projects/a", "studio"], ["/collaborate/new", "workspace-team"],
    ["/team?project=a", "workspace-team"], ["/market/resources", "workspace-hub"],
    ["/ranking", "workspace-hub"], ["/settings", null],
  ])("keeps %s in the right global destination", (path, id) => {
    expect(workspaceNavigationActiveId(path!)).toBe(id);
  });
  it("uses the same four labels on mobile and desktop", () => {
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.id)).toEqual(TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => item.id));
    expect(TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => item.label.ko)).toEqual(["스튜디오", "작품", "팀", "둘러보기"]);
  });
  it.each(["/", "/home", "/team", "/hub"])("does not duplicate workspace chrome with a promotional scene on %s", (path) => {
    expect(supportsRoutePurposeScene(path)).toBe(false);
  });
});
