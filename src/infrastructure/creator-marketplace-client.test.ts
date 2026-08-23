import { createHash, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";


import {
  createCreatorMarketplaceBuiltinDelivery,
  createCreatorMarketplacePortableDelivery,
  deleteCreatorMarketplaceResource,
  getCreatorMarketplaceResource,
  listCreatorMarketplaceResources,
  listMyCreatorMarketplaceResources,
  publishCreatorMarketplaceResource,
} from "./creator-marketplace-client";
import { NotFoundError } from "./use-api-resource";

import type {
  CreatorMarketplaceResourceManifest,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

import {
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "@/lib/creator-marketplace-resource-contract";

const { apiDelete, apiGet, apiPost, toApiError } = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toApiError: vi.fn(async (error: unknown, fallback: string) =>
    new Error(fallback, { cause: error })
  ),
}));

vi.mock("@/src/infrastructure/api", () => ({
  api: {
    delete: apiDelete,
    get: apiGet,
    post: apiPost,
  },
  toApiError,
}));

async function manifest(): Promise<CreatorMarketplaceResourceManifest> {
  const delivery = await createCreatorMarketplacePortableDelivery("filter", {
    engine: "studio-filter-stack-v1",
    values: {
      pipeline: ["levels", "halftone"],
      strength: 0.65,
    },
  });
  return {
    schemaVersion: 1,
    packageId: "original/filter/webtoon-finish",
    name: "웹툰 마감 필터",
    description: "portable JSON 필터",
    kind: "filter",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: ["마감"],
    license: "toonspectrum-standard",
    attributionText: "",
    containsAi: false,
    rightsConfirmed: true,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["webgpu", "webgl2"] },
    entries: [{
      id: "filter/webtoon-finish",
      kind: "filter",
      name: "웹툰 마감",
      delivery,
    }],
  };
}

function record(input: CreatorMarketplaceResourceManifest): CreatorMarketplaceResourceRecord {
  const {
    rightsConfirmed: _rightsConfirmed,
    ...publicManifest
  } = input;
  return {
    ...publicManifest,
    id: randomUUID(),
    manifestHash: createHash("sha256")
      .update(canonicalizeCreatorMarketplaceJson(input))
      .digest("hex"),
    manifestByteSize: creatorMarketplaceJsonByteSize(input),
    publisher: { id: "author", name: "작가", avatar: null },
    createdAt: "2026-07-27T01:00:00.000Z",
    updatedAt: "2026-07-27T01:00:00.000Z",
    isOwner: true,
    access: "free",
  };
}

describe("creator marketplace client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("실제 portable JSON payload의 canonical 크기·SHA-256을 생성한다", async () => {
    const left = await createCreatorMarketplacePortableDelivery("brush", {
      snapshot: {
        z: 2,
        a: { y: true, x: 1 },
      },
    });
    const right = await createCreatorMarketplacePortableDelivery("brush", {
      snapshot: {
        a: { x: 1, y: true },
        z: 2,
      },
    });

    expect(left.mode).toBe("portable-json");
    expect(left.payload).toMatchObject({
      schemaVersion: 1,
      resourceKind: "brush",
      runtime: "studio-brush-v1",
      definition: { snapshot: { z: 2 } },
    });
    expect(left.sha256).toBe(right.sha256);
    expect(left.byteSize).toBe(right.byteSize);
  });

  it("2D/3D는 portable binary 대신 procedural-recipe delivery를 만든다", async () => {
    await expect(
      createCreatorMarketplacePortableDelivery("asset", {
        recipeId: "rounded-rect",
        parameters: { paletteRef: "builtin/palette/noir" },
      })
    ).resolves.toMatchObject({
      mode: "procedural-recipe",
      mediaType: "application/vnd.toonspectrum.asset+json",
    });
  });

  it("builtin-ref도 canonical runtimeRef digest를 생성한다", async () => {
    const left = await createCreatorMarketplaceBuiltinDelivery(
      "template",
      "studio-scene-template:webtoon-basic"
    );
    const right = await createCreatorMarketplaceBuiltinDelivery(
      "template",
      "studio-scene-template:webtoon-basic"
    );
    const changed = await createCreatorMarketplaceBuiltinDelivery(
      "template",
      "studio-scene-template:webtoon-action"
    );

    expect(left).toMatchObject({
      mode: "builtin-ref",
      runtimeRef: "studio-scene-template:webtoon-basic",
      byteSize: 0,
    });
    expect(left.sha256).toBe(right.sha256);
    expect(left.sha256).not.toBe(changed.sha256);
  });

  it("브라우저 SubtleCrypto와 Node가 같은 canonical SHA-256을 만든다", async () => {
    const delivery = await createCreatorMarketplacePortableDelivery("palette", {
      colors: ["#111827", "#ef4444", "#f8fafc"],
    });
    const expected = createHash("sha256")
      .update(canonicalizeCreatorMarketplaceJson(delivery.payload))
      .digest("hex");

    expect(delivery.sha256).toBe(expected);
  });

  it("잘못된 built-in prefix와 종류별 definition을 client 경계에서 거절한다", async () => {
    await expect(
      createCreatorMarketplaceBuiltinDelivery("template", "studio-asset:wrong")
    ).rejects.toThrow("built-in");
    await expect(
      createCreatorMarketplacePortableDelivery("filter", {
        engine: "studio-filter-stack-v1",
        values: {},
      })
    ).rejects.toThrow();
  });

  it("공개/내 목록의 cursor·필터·AbortSignal을 API에 전달하고 응답을 검증한다", async () => {
    const controller = new AbortController();
    apiGet.mockResolvedValue({ items: [], limit: 12, hasMore: false, nextCursor: null });

    await listCreatorMarketplaceResources({
      limit: 12,
      cursor: "cursor_1",
      kind: "brush",
      license: "cc0-1.0",
    }, controller.signal);
    await listMyCreatorMarketplaceResources({ search: "잉크" }, controller.signal);

    expect(apiGet).toHaveBeenNthCalledWith(1, "/creator/marketplace/resources", {
      params: {
        limit: 12,
        cursor: "cursor_1",
        search: undefined,
        tag: undefined,
        kind: "brush",
        license: "cc0-1.0",
      },
      signal: controller.signal,
    });
    expect(apiGet).toHaveBeenNthCalledWith(
      2,
      "/creator/marketplace/resources/mine",
      expect.objectContaining({
        params: expect.objectContaining({ search: "잉크" }),
        signal: controller.signal,
      })
    );
  });

  it("게시 payload와 반환 record 모두 strict contract로 검증하고 실제 콘텐츠를 보존한다", async () => {
    const input = await manifest();
    const response = record(input);
    apiPost.mockResolvedValue(response);

    await expect(publishCreatorMarketplaceResource(input)).resolves.toMatchObject({
      entries: [{
        delivery: {
          mode: "portable-json",
          payload: {
            schemaVersion: 1,
            resourceKind: "filter",
            runtime: "studio-filter-v1",
            definition: {
              engine: "studio-filter-stack-v1",
              values: {
                pipeline: ["levels", "halftone"],
                strength: 0.65,
              },
            },
          },
        },
      }],
    });
    expect(apiPost).toHaveBeenCalledWith(
      "/creator/marketplace/resources",
      input,
      { signal: undefined }
    );

    apiPost.mockResolvedValue({ ...response, leaked: true });
    await expect(publishCreatorMarketplaceResource(input)).rejects.toThrow();
  });

  it("삭제 id를 인코딩하고 네트워크 오류를 안전한 메시지로 변환한다", async () => {
    apiDelete.mockResolvedValue(undefined);
    await deleteCreatorMarketplaceResource("123e4567-e89b-42d3-a456-426614174000");
    expect(apiDelete).toHaveBeenCalledWith(
      "/creator/marketplace/resources/123e4567-e89b-42d3-a456-426614174000"
    );

    apiDelete.mockRejectedValue(new Error("private upstream"));
    await expect(deleteCreatorMarketplaceResource("id/with/slash"))
      .rejects.toThrow("공유 리소스를 삭제하지 못했습니다.");
  });

  it("단건 조회는 record를 검증해 돌려주고 404는 NotFoundError로 흐름 제어한다", async () => {
    const input = await manifest();
    const response = record(input);
    const id = response.id;
    apiGet.mockResolvedValueOnce(response).mockRejectedValueOnce({
      response: { status: 404 },
    });

    await expect(getCreatorMarketplaceResource(id)).resolves.toMatchObject({
      id,
      packageId: "original/filter/webtoon-finish",
    });
    expect(apiGet).toHaveBeenNthCalledWith(
      1,
      `/creator/marketplace/resources/${id}`,
      { signal: undefined }
    );

    await expect(getCreatorMarketplaceResource(id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("단건 조회의 5xx는 일반 에러 메시지로 변환한다", async () => {
    toApiError.mockImplementationOnce(
      async (_error: unknown, fallback: string) => new Error(fallback)
    );
    apiGet.mockRejectedValueOnce({ response: { status: 503 } });

    await expect(getCreatorMarketplaceResource(randomUUID())).rejects.toThrow(
      "공유 리소스를 불러오지 못했습니다."
    );
  });
});
