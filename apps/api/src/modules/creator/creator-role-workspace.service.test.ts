import { ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeCreatorRoleWorkspacePreference,
} from "../../../../web/src/shared/lib/creator-role-workspace-contract";
import { CreatorRoleWorkspaceService } from "./creator-role-workspace.service";

const repository = {
  get: vi.fn(),
  save: vi.fn(),
  batchPublicProfiles: vi.fn(),
  directory: vi.fn(),
};

describe("CreatorRoleWorkspaceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a normalized preference using optimistic revision control", async () => {
    const saved = {
      projectKey: "project:series-a",
      revision: 4,
      updatedAt: "2026-09-17T10:00:00.000Z",
      document: normalizeCreatorRoleWorkspacePreference({
        activeRole: "producer",
        onboardingComplete: true,
      }),
    };
    repository.save.mockResolvedValue(saved);
    const service = new CreatorRoleWorkspaceService(repository as never);

    await expect(service.saveWorkspace(
      "user-1",
      "project:series-a",
      3,
      saved.document,
    )).resolves.toEqual(saved);
    expect(repository.save).toHaveBeenCalledWith(
      "user-1",
      "project:series-a",
      3,
      saved.document,
    );
  });

  it("returns the latest document in a revision conflict", async () => {
    const latest = {
      projectKey: "work:work-1",
      revision: 7,
      updatedAt: "2026-09-17T10:01:00.000Z",
      document: normalizeCreatorRoleWorkspacePreference({
        activeRole: "story",
      }),
    };
    repository.save.mockResolvedValue(null);
    repository.get.mockResolvedValue(latest);
    const service = new CreatorRoleWorkspaceService(repository as never);

    const promise = service.saveWorkspace(
      "user-1",
      "work:work-1",
      5,
      normalizeCreatorRoleWorkspacePreference({ activeRole: "line-art" }),
    );
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({ latest }),
    });
  });

  it("passes closed directory filters to the repository", async () => {
    repository.directory.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    const service = new CreatorRoleWorkspaceService(repository as never);

    await service.directory({
      role: "background",
      specialty: "background-3d",
      collaborationStatus: "available",
      q: "배경",
      limit: 20,
      offset: 0,
    });

    expect(repository.directory).toHaveBeenCalledWith({
      role: "background",
      specialty: "background-3d",
      collaborationStatus: "available",
      q: "배경",
      limit: 20,
      offset: 0,
    });
  });
});
