import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "../../../../../lib/creator-marketplace-resource-contract";

import {
  creatorMarketplacePublisherGateKey,
} from "./creator-marketplace-publish-gate";
import { CreatorMarketplaceResourceDuplicateError } from "./creator-marketplace.repository-contract";
import { CreatorMarketplaceService } from "./creator-marketplace.service";

import type {
  CreatorMarketplacePublishGate,
  CreatorMarketplacePublishLease,
} from "./creator-marketplace-publish-gate";
import type { PublishCreatorMarketplaceResourceDto } from "./creator-marketplace.dto";
import type {
  CreatorMarketplaceResourceRepository,
  CreatorMarketplaceResourceStoredRow,
} from "./creator-marketplace.repository-contract";
import type {
  CreatorMarketplaceResourceManifest,
} from "../../../../../lib/creator-marketplace-resource-contract";

function digest(value: unknown): string {
  return createHash("sha256")
    .update(canonicalizeCreatorMarketplaceJson(value))
    .digest("hex");
}

function manifest(): CreatorMarketplaceResourceManifest {
  const definition = {
    snapshot: {
      renderer: "perfect-freehand",
      dynamics: { size: 0.8, opacity: 1 },
    },
  };
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: "brush" as const,
    runtime: "studio-brush-v1" as const,
    definition,
  };
  return {
    schemaVersion: 1,
    packageId: "original/brush/ink-starter",
    name: "오리지널 잉크 스타터",
    description: "작가가 직접 만든 portable brush JSON",
    kind: "brush",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: ["잉크"],
    license: "toonspectrum-standard",
    attributionText: "",
    containsAi: false,
    rightsConfirmed: true,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: "brush/ink-starter",
      kind: "brush",
      name: "잉크 스타터",
      delivery: {
        mode: "portable-json",
        mediaType: "application/vnd.toonspectrum.brush+json",
        payload,
        byteSize: creatorMarketplaceJsonByteSize(payload),
        sha256: digest(payload),
      },
    }],
  };
}

function storedRow(
  input: CreatorMarketplaceResourceManifest = manifest(),
  overrides: Partial<CreatorMarketplaceResourceStoredRow> = {}
): CreatorMarketplaceResourceStoredRow {
  return {
    id: randomUUID(),
    publisherId: "publisher-1",
    publisherName: "테스트 작가",
    publisherAvatar: "#334155",
    manifest: input,
    manifestHash: digest(input),
    manifestByteSize: creatorMarketplaceJsonByteSize(input),
    createdAt: new Date("2026-07-27T01:02:03.000Z"),
    updatedAt: new Date("2026-07-27T01:02:03.000Z"),
    ...overrides,
  };
}

describe("CreatorMarketplaceService", () => {
  const repository = {
    list: vi.fn<CreatorMarketplaceResourceRepository["list"]>(),
    publish: vi.fn<CreatorMarketplaceResourceRepository["publish"]>(),
    deleteOwned: vi.fn<CreatorMarketplaceResourceRepository["deleteOwned"]>(),
  };
  const lease: CreatorMarketplacePublishLease = {
    publisherKeyHash: new Uint8Array(32).fill(7),
    token: "test-creator-marketplace-publish-lease-token",
    fence: "1",
    expiresAt: new Date("2026-07-27T01:02:33.000Z"),
  };
  const publishGate = {
    acquire: vi.fn<CreatorMarketplacePublishGate["acquire"]>(),
    release: vi.fn<CreatorMarketplacePublishGate["release"]>(),
  };
  let service: CreatorMarketplaceService;

  beforeEach(() => {
    vi.clearAllMocks();
    publishGate.acquire.mockResolvedValue({
      status: "acquired",
      lease,
    });
    publishGate.release.mockResolvedValue(true);
    service = new CreatorMarketplaceService(repository, publishGate);
  });

  it("portable JSON 실제 콘텐츠를 보존해 게시하고 rights 확인 내부 필드는 응답에서 제거한다", async () => {
    const input = manifest();
    const publisherId = `publisher-${randomUUID()}`;
    repository.publish.mockImplementation(async (write) =>
      storedRow(write.manifest, {
        id: write.id,
        publisherId: write.publisherId,
        manifestHash: write.manifestHash,
        manifestByteSize: write.manifestByteSize,
      })
    );

    const result = await service.publish(
      publisherId,
      input as PublishCreatorMarketplaceResourceDto
    );

    expect(result.entries[0]?.delivery).toMatchObject({
      mode: "portable-json",
      payload: input.entries[0]?.delivery.mode === "portable-json"
        ? input.entries[0].delivery.payload
        : {},
    });
    expect(result).not.toHaveProperty("rightsConfirmed");
    expect(repository.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: input,
        manifestHash: digest(input),
        manifestByteSize: creatorMarketplaceJsonByteSize(input),
      })
    );
    expect(publishGate.acquire).toHaveBeenCalledWith(
      creatorMarketplacePublisherGateKey(publisherId)
    );
  });

  it("항목 콘텐츠 hash 불일치를 fail-closed로 거절한다", async () => {
    const input = manifest();
    const invalid = structuredClone(input);
    const delivery = invalid.entries[0]!.delivery;
    if (delivery.mode !== "builtin-ref") delivery.sha256 = "0".repeat(64);

    await expect(
      service.publish(
        `publisher-${randomUUID()}`,
        invalid as PublishCreatorMarketplaceResourceDto
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(publishGate.acquire).not.toHaveBeenCalled();
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it("builtin-ref도 canonical runtimeRef digest가 일치해야 게시한다", async () => {
    const valid = manifest();
    valid.kind = "template";
    valid.packageId = "original/template/webtoon-basic";
    valid.entries[0]!.kind = "template";
    valid.entries[0]!.id = "template/webtoon-basic";
    const runtimeRef = "studio-scene-template:webtoon-basic";
    valid.entries[0]!.delivery = {
      mode: "builtin-ref",
      runtimeRef,
      byteSize: 0,
      sha256: digest({ mode: "builtin-ref", runtimeRef }),
    };
    repository.publish.mockImplementation(async (write) =>
      storedRow(write.manifest, {
        id: write.id,
        publisherId: write.publisherId,
        manifestHash: write.manifestHash,
        manifestByteSize: write.manifestByteSize,
      })
    );

    await expect(
      service.publish(
        `publisher-${randomUUID()}`,
        valid as PublishCreatorMarketplaceResourceDto
      )
    ).resolves.toMatchObject({
      entries: [{ delivery: { mode: "builtin-ref", runtimeRef } }],
    });

    valid.entries[0]!.delivery = {
      ...valid.entries[0]!.delivery,
      runtimeRef: "studio-scene-template:tampered",
    };
    await expect(
      service.publish(
        `publisher-${randomUUID()}`,
        valid as PublishCreatorMarketplaceResourceDto
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("동일 패키지 버전/manifest 충돌을 409로 변환한다", async () => {
    repository.publish.mockRejectedValue(new CreatorMarketplaceResourceDuplicateError());

    await expect(
      service.publish(
        `publisher-${randomUUID()}`,
        manifest() as PublishCreatorMarketplaceResourceDto
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("게시 mutation을 사용자별 시간당 20회로 제한한다", async () => {
    const publisherId = `rate-${randomUUID()}`;
    repository.publish.mockImplementation(async (write) =>
      storedRow(write.manifest, {
        id: write.id,
        publisherId: write.publisherId,
        manifestHash: write.manifestHash,
        manifestByteSize: write.manifestByteSize,
      })
    );

    for (let index = 0; index < 20; index += 1) {
      const input = manifest();
      input.packageId = `original/brush/rate-${index}`;
      input.resourceVersion = `1.0.${index}`;
      await service.publish(publisherId, input as PublishCreatorMarketplaceResourceDto);
    }

    publishGate.acquire.mockResolvedValueOnce({ status: "rate_limited" });
    const error = await service
      .publish(publisherId, manifest() as PublishCreatorMarketplaceResourceDto)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(repository.publish).toHaveBeenCalledTimes(20);
    expect(publishGate.release).toHaveBeenCalledTimes(20);
  });

  it("분산 gate 저장소가 없으면 resource write 전에 fail-closed 한다", async () => {
    publishGate.acquire.mockRejectedValueOnce(
      new Error("postgres connection secret detail")
    );

    const error = await service
      .publish(
        `publisher-${randomUUID()}`,
        manifest() as PublishCreatorMarketplaceResourceDto
      )
      .catch((cause: unknown) => cause);

    expect(error).toMatchObject({ status: 503 });
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain(
      "postgres connection secret detail"
    );
    expect(repository.publish).not.toHaveBeenCalled();
    expect(publishGate.release).not.toHaveBeenCalled();
  });

  it("commit 뒤 release 장애는 성공을 모호하게 만들지 않고 짧은 lease 만료에 맡긴다", async () => {
    const input = manifest();
    repository.publish.mockImplementation(async (write) =>
      storedRow(write.manifest, {
        id: write.id,
        publisherId: write.publisherId,
        manifestHash: write.manifestHash,
        manifestByteSize: write.manifestByteSize,
      })
    );
    publishGate.release.mockRejectedValueOnce(new Error("release unavailable"));

    await expect(
      service.publish(
        `publisher-${randomUUID()}`,
        input as PublishCreatorMarketplaceResourceDto
      )
    ).resolves.toMatchObject({ packageId: input.packageId });
    expect(publishGate.release).toHaveBeenCalledOnce();
  });

  it("keyset cursor를 발급하고 다음 요청에서 정확한 createdAt/id 경계로 복원한다", async () => {
    const first = storedRow(manifest(), {
      id: "123e4567-e89b-42d3-a456-426614174001",
      createdAt: new Date("2026-07-27T03:00:00.000Z"),
    });
    const second = storedRow(manifest(), {
      id: "123e4567-e89b-42d3-a456-426614174002",
      createdAt: new Date("2026-07-27T02:00:00.000Z"),
    });
    const sentinel = storedRow(manifest(), {
      id: "123e4567-e89b-42d3-a456-426614174003",
      createdAt: new Date("2026-07-27T01:00:00.000Z"),
    });
    repository.list.mockResolvedValueOnce([first, second, sentinel]);

    const page = await service.list({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/u);

    repository.list.mockResolvedValueOnce([]);
    await service.list({ limit: 2, cursor: page.nextCursor! });

    expect(repository.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: {
          createdAt: second.createdAt,
          id: second.id,
        },
      })
    );
  });

  it("변조되거나 비정상인 cursor를 DB 조회 전에 거절한다", async () => {
    const malformed = Buffer.from(JSON.stringify({
      version: 1,
      createdAt: "not-a-date",
      id: "not-an-id",
    })).toString("base64url");

    await expect(service.list({ limit: 10, cursor: malformed }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it.each(["entry", "manifest-hash", "manifest-size"] as const)(
    "DB에서 읽은 %s 무결성 변조를 공개 record로 투영하지 않는다",
    async (corruption) => {
      const row = storedRow();
      if (corruption === "entry") {
        const delivery = row.manifest.entries[0]!.delivery;
        if (delivery.mode !== "builtin-ref") delivery.sha256 = "f".repeat(64);
        row.manifestHash = digest(row.manifest);
        row.manifestByteSize = creatorMarketplaceJsonByteSize(row.manifest);
      } else if (corruption === "manifest-hash") {
        row.manifestHash = "e".repeat(64);
      } else {
        row.manifestByteSize += 1;
      }
      repository.list.mockResolvedValueOnce([row]);

      await expect(service.list({ limit: 10 })).rejects.toMatchObject({
        status: 503,
      });
    }
  );

  it("소유자 삭제만 repository에 위임하고 존재하지 않는 행은 404로 숨긴다", async () => {
    repository.deleteOwned.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const id = randomUUID();

    await expect(service.deleteOwned("publisher", id)).resolves.toEqual({ deleted: true });
    await expect(service.deleteOwned("publisher", id)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
