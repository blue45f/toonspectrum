import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../packages/studio-format-gateway/src/krita-bundle", () => {
  throw new Error("Project metadata must not initialize the Krita archive parser");
});

describe("project graph compatibility schema boundary", () => {
  it("validates project permissions without evaluating optional file importers", async () => {
    const { studioProjectAccessSchema } = await import("./studio-project-graph-contract");
    const access = {
      view: true, comment: true, edit: true, manageMembers: true,
      respondInvite: true, owner: true, role: "owner",
    };
    expect(studioProjectAccessSchema.parse(access)).toEqual(access);
    expect(studioProjectAccessSchema.safeParse({ ...access, role: "forged-owner" }).success).toBe(false);
  });
});
