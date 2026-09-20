import { describe, expect, it } from "vitest";
import { TOONSTUDIO_MOBILE_TABS, TOONSTUDIO_PRIMARY_NAVIGATION } from "../site-navigation";
import { supportsRoutePurposeScene } from "../site-experience/site-experience-policy";
import { workspaceNavigationActiveId, workspaceNavigationContext, workspaceNavigationHref } from "./workspace-navigation-model";

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

describe("workspace identity continuity", () => {
  it.each(["/home", "/team", "/hub"])("carries only project identity into %s", (href) => {
    const context = workspaceNavigationContext("/home", "?project=old+work&panel=work&tab=members&private=never-copy");
    expect(workspaceNavigationHref(href, context)).toBe(`${href}?project=old+work`);
  });
  it("retains personal scope instead of falling back to the most recent work", () => {
    const context = workspaceNavigationContext("/team", "?scope=personal&project=not-selected");
    expect(workspaceNavigationHref("/home", context)).toBe("/home?scope=personal");
  });
  it("uses the live route identity rather than a conflicting query", () => {
    const context = workspaceNavigationContext("/studio/p/a%2Fb/space", "?project=other&scope=personal");
    expect(workspaceNavigationHref("/hub", context)).toBe("/hub?project=a%2Fb");
  });
  it("encodes identities without creating new query parameters or outside links", () => {
    const href = workspaceNavigationHref("/team", { projectId: "a&panel=work#outside" });
    expect(new URLSearchParams(href.split("?")[1]).get("project")).toBe("a&panel=work#outside");
    expect(new URLSearchParams(href.split("?")[1]).has("panel")).toBe(false);
  });
  it("keeps malformed encoded live identities explicit and never throws", () => {
    expect(workspaceNavigationContext("/studio/p/%E0%A4/space", "")).toEqual({ projectId: "%E0%A4" });
  });
  it.each(["/studio", "/collaborate", "/market", "https://outside.example/home"])("does not propagate private identity to %s", (href) => {
    expect(workspaceNavigationHref(href, { projectId: "private-work" })).toBe(href);
  });
});
