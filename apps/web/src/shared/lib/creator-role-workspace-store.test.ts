import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CreatorRoleWorkspaceConflictError,
} from "@/infrastructure/creator-role-workspace-client";
import {
  getCreatorRoleWorkspaceStoreState,
  loadCreatorRoleWorkspace,
  persistCreatorRoleWorkspace,
  resetCreatorRoleWorkspaceStore,
  subscribeCreatorRoleWorkspace,
} from "./creator-role-workspace-store";
import {
  normalizeCreatorRoleWorkspacePreference,
} from "./creator-role-workspace-contract";

const doubles = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/infrastructure/creator-role-workspace-client", async (original) => {
  const actual = await original<
    typeof import("@/infrastructure/creator-role-workspace-client")
  >();
  return {
    ...actual,
    getCreatorRoleWorkspace: doubles.get,
    saveCreatorRoleWorkspace: doubles.save,
  };
});

describe("creator role workspace store", () => {
  beforeEach(() => {
    doubles.get.mockReset();
    doubles.save.mockReset();
    localStorage.clear();
    resetCreatorRoleWorkspaceStore();
  });

  it("loads the server snapshot and notifies subscribers", async () => {
    doubles.get.mockResolvedValue({
      projectKey: "project:series-a",
      revision: 3,
      updatedAt: "2026-09-17T10:00:00.000Z",
      source: "server",
      document: normalizeCreatorRoleWorkspacePreference({
        activeRole: "story",
        onboardingComplete: true,
      }),
    });
    const listener = vi.fn();
    const unsubscribe = subscribeCreatorRoleWorkspace("project:series-a", listener);

    const state = await loadCreatorRoleWorkspace("project:series-a");

    expect(state.status).toBe("ready");
    expect(state.snapshot.revision).toBe(3);
    expect(state.snapshot.document.activeRole).toBe("story");
    expect(listener).toHaveBeenCalled();
    expect(JSON.parse(
      localStorage.getItem(
        "toonspectrum:creator-role-workspace:v1:project%3Aseries-a",
      ) ?? "{}",
    )).toMatchObject({ revision: 3 });
    unsubscribe();
  });

  it("keeps an optimistic local recovery copy when the server is unavailable", async () => {
    doubles.get.mockRejectedValue(new Error("offline"));
    await loadCreatorRoleWorkspace("draft");
    doubles.save.mockRejectedValue(new Error("offline"));

    const state = await persistCreatorRoleWorkspace(
      "draft",
      normalizeCreatorRoleWorkspacePreference({
        activeRole: "line-art",
        workspacePreset: "lineart",
      }),
    );

    expect(state.status).toBe("offline");
    expect(state.snapshot.document.activeRole).toBe("line-art");
    expect(getCreatorRoleWorkspaceStoreState("draft").error).toBe("offline");
  });

  it("adopts the latest server document on an optimistic revision conflict", async () => {
    doubles.get.mockResolvedValue({
      projectKey: "work:work-1",
      revision: 1,
      updatedAt: "2026-09-17T10:00:00.000Z",
      source: "server",
      document: normalizeCreatorRoleWorkspacePreference({
        activeRole: "story",
      }),
    });
    await loadCreatorRoleWorkspace("work:work-1");
    const latest = {
      projectKey: "work:work-1",
      revision: 2,
      updatedAt: "2026-09-17T10:01:00.000Z",
      source: "server" as const,
      document: normalizeCreatorRoleWorkspacePreference({
        activeRole: "producer",
      }),
    };
    doubles.save.mockRejectedValue(
      new CreatorRoleWorkspaceConflictError(latest),
    );

    await expect(persistCreatorRoleWorkspace(
      "work:work-1",
      normalizeCreatorRoleWorkspacePreference({ activeRole: "line-art" }),
    )).rejects.toBeInstanceOf(CreatorRoleWorkspaceConflictError);

    expect(getCreatorRoleWorkspaceStoreState("work:work-1").snapshot).toEqual(latest);
  });
});
