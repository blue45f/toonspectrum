import { describe, expect, it } from "vitest";
import { workspaceTaskRoute } from "./workspace-task-route";

describe("workspace task chrome ownership", () => {
  it.each(["/help", "/settings", "/my", "/sitemap", "/discover", "/ranking", "/showcase", "/market", "/studio/new", "/studio/import/", "/studio/assets", "/studio/review", "/studio/versions",
    "/studio/p/library%2Fid/overview", "/studio/p/library/review", "/studio/work/work-id/review",
    "/studio/remix/source/present", "/production", "/production/projects/p/episodes/e"])(
    "gives operational %s the common task chrome", (path) => expect(workspaceTaskRoute(path)).not.toBeNull());
  it.each(["/", "/home", "/studio", "/team", "/hub", "/studio/p/a/space",
    "/studio/canvas", "/studio/bg3d", "/studio/work/a/canvas", "/studio/work/a/animation",
    "/studio/compose/abc", "/studio/assets/brushes/new", "/production/review/p/r",
    "/admin", "/unknown", "/studio/p/a/no-such-tab", "/studio/new/extra", "/production/projects/p/unknown"])(
    "does not wrap an owned shell, editor, external or unknown route %s", (path) => expect(workspaceTaskRoute(path)).toBeNull());
  it.each(["?token=secret", "?reviewToken=secret", "?invite=secret"])("keeps external invitations minimal %s", (search) => {
    expect(workspaceTaskRoute("/studio/share", search)).toBeNull();
  });
  it("uses focused chrome for creation and project-stage pages", () => {
    expect(workspaceTaskRoute("/studio/new")?.chrome).toBe("focused");
    expect(workspaceTaskRoute("/studio/import")?.chrome).toBe("focused");
    expect(workspaceTaskRoute("/studio/p/project-1/overview")?.chrome).toBe("focused");
    expect(workspaceTaskRoute("/studio/p/project-1/review")?.chrome).toBe("focused");
    expect(workspaceTaskRoute("/studio/assets")?.chrome).toBeUndefined();
  });
  it("does not let context values choose the task identity or title", () => {
    expect(workspaceTaskRoute("/studio/review", "?project=x&title=private"))
      .toEqual(workspaceTaskRoute("/studio/review"));
  });
});
