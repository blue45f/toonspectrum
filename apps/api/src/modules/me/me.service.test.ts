import { BadRequestException, ConflictException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DrizzleMeCollectionRepository,
  ME_COLLECTION_REPOSITORY,
  meCollectionRepositoryProvider,
} from "./me-collection.repository";
import { MeService } from "./me.service";

import type { MeCollectionRepository } from "./me-collection.repository";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

const repository = {
  createOwned: vi.fn(),
  renameOwned: vi.fn(),
  deleteOwned: vi.fn(),
  setItem: vi.fn(),
  toggleItem: vi.fn(),
  mergeOwned: vi.fn(),
};

function service(): MeService {
  return new MeService(repository as unknown as MeCollectionRepository);
}

describe("MeService collection mutations", () => {
  beforeEach(() => {
    for (const method of Object.values(repository)) method.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes a swappable collection repository provider", () => {
    expect(meCollectionRepositoryProvider.provide).toBe(ME_COLLECTION_REPOSITORY);
    expect(meCollectionRepositoryProvider.useFactory()).toBeInstanceOf(
      DrizzleMeCollectionRepository
    );
  });

  it.each(["created", "replayed"] as const)(
    "returns the exact canonical ID for a %s create",
    async (status) => {
      repository.createOwned.mockResolvedValue({ status, id: CLIENT_ID });

      await expect(service().updateCollection("owner-1", {
        action: "create",
        id: CLIENT_ID,
        name: "컬렉션",
        emoji: "📚",
      })).resolves.toEqual({
        ok: true,
        id: CLIENT_ID,
        created: status === "created",
      });
      expect(repository.createOwned).toHaveBeenCalledWith({
        id: CLIENT_ID,
        userId: "owner-1",
        name: "컬렉션",
        emoji: "📚",
      });
    }
  );

  it("maps every ID collision to one generic conflict without owner metadata", async () => {
    repository.createOwned.mockResolvedValue({ status: "conflict" });

    const result = service().updateCollection("owner-1", {
      action: "create",
      id: CLIENT_ID,
      name: "컬렉션",
      emoji: "📚",
    });
    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.not.toThrow(/other-owner|기존 이름/u);
  });

  it("uses an idempotent included state and preserves the legacy toggle contract", async () => {
    repository.setItem.mockResolvedValue({ status: "updated", included: true });
    repository.toggleItem.mockResolvedValue({ status: "updated", included: false });

    await expect(service().updateCollection("owner-1", {
      action: "set-item",
      id: "seed-col-1",
      titleId: "title-1",
      included: true,
    })).resolves.toEqual({
      ok: true,
      id: "seed-col-1",
      titleId: "title-1",
      included: true,
    });
    expect(repository.setItem).toHaveBeenCalledWith(
      "owner-1",
      "seed-col-1",
      "title-1",
      true
    );

    await expect(service().updateCollection("owner-1", {
      action: "toggle",
      id: "seed-col-1",
      titleId: "title-1",
    })).resolves.toMatchObject({ included: false });
  });

  it("does not expose whether a missing item collection belongs to another user", async () => {
    repository.setItem.mockResolvedValue({ status: "not_found" });
    await expect(service().updateCollection("intruder", {
      action: "set-item",
      id: "seed-col-1",
      titleId: "title-1",
      included: true,
    })).rejects.toEqual(new BadRequestException("권한 없음"));
  });

  it("keeps legacy rename and delete no-op response semantics during rolling deploy", async () => {
    repository.renameOwned.mockResolvedValue({ status: "not_found" });
    repository.deleteOwned.mockResolvedValue({ status: "not_found" });

    await expect(service().updateCollection("owner-1", {
      action: "rename",
      id: "seed-col-1",
      name: "새 이름",
    })).resolves.toEqual({ ok: true, id: "seed-col-1" });
    await expect(service().updateCollection("owner-1", {
      action: "delete",
      id: "seed-col-1",
    })).resolves.toEqual({ ok: true, id: "seed-col-1" });
  });

  it("returns a guest-to-server ID map when a canonical UUID collides globally", async () => {
    const instance = service();
    repository.mergeOwned.mockResolvedValue({ [CLIENT_ID]: "server-generated-id" });
    vi.spyOn(instance, "getMe").mockResolvedValue({ collections: [] } as never);

    await expect(instance.merge("owner-1", {
      collections: [{
        id: CLIENT_ID,
        name: "게스트 컬렉션",
        emoji: "📚",
        titleIds: [],
      }],
    })).resolves.toEqual({
      collections: [],
      collectionIdMap: { [CLIENT_ID]: "server-generated-id" },
    });
    expect(repository.mergeOwned).toHaveBeenCalledWith("owner-1", [{
      clientId: CLIENT_ID,
      name: "게스트 컬렉션",
      emoji: "📚",
      titleIds: [],
    }]);
  });

  it("keeps duplicate-name canonical collections distinct", async () => {
    const secondId = "550e8400-e29b-41d4-a716-446655440001";
    const instance = service();
    repository.mergeOwned.mockResolvedValue({
      [CLIENT_ID]: CLIENT_ID,
      [secondId]: secondId,
    });
    vi.spyOn(instance, "getMe").mockResolvedValue({ collections: [] } as never);

    const result = await instance.merge("owner-1", {
      collections: [
        { id: CLIENT_ID, name: "같은 이름", titleIds: [] },
        { id: secondId, name: "같은 이름", titleIds: [] },
      ],
    });

    expect(result.collectionIdMap).toEqual({
      [CLIENT_ID]: CLIENT_ID,
      [secondId]: secondId,
    });
    expect(repository.mergeOwned).toHaveBeenCalledWith("owner-1", [
      { clientId: CLIENT_ID, name: "같은 이름", emoji: "📚", titleIds: [] },
      { clientId: secondId, name: "같은 이름", emoji: "📚", titleIds: [] },
    ]);
  });

  it("converges a concurrent same-owner insert on the client UUID", async () => {
    const instance = service();
    repository.mergeOwned.mockResolvedValue({ [CLIENT_ID]: CLIENT_ID });
    vi.spyOn(instance, "getMe").mockResolvedValue({ collections: [] } as never);

    const result = await instance.merge("owner-1", {
      collections: [{ id: CLIENT_ID, name: "동시 병합", titleIds: [] }],
    });

    expect(result.collectionIdMap).toEqual({ [CLIENT_ID]: CLIENT_ID });
    expect(repository.mergeOwned).toHaveBeenCalledOnce();
  });
});
