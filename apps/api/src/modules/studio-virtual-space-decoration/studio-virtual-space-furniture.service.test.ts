import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Image, decode, encode } from "image-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION } from "../../platform/adapters/supabase-object-storage/supabase-object-storage.contract";
import { StudioVirtualSpaceFurnitureService } from "./studio-virtual-space-furniture.service";

const boundary = vi.hoisted(() => ({
  query: vi.fn(),
  uploadImmutable: vi.fn(),
  createSignedReadUrl: vi.fn(),
}));

vi.mock("../../platform/database", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const { studioVirtualSpaceCustomFurniture, studioVirtualSpaceDecorationLayouts } = await import(
    "../../platform/database/schema/studio-virtual-space-decoration.schema"
  );
  const { users } = await import("../../platform/database/schema/auth.schema");
  return {
    studioVirtualSpaceCustomFurniture,
    studioVirtualSpaceDecorationLayouts,
    users,
    db: drizzle((query, parameters, method) => boundary.query(query, parameters, method)),
  };
});

const storage = {
  uploadImmutable: boundary.uploadImmutable,
  createSignedReadUrl: boundary.createSignedReadUrl,
  verifyPrivatePurposeBuckets: vi.fn().mockResolvedValue({ ready: true, privatePurposeBuckets: 3 }),
  deleteGeneratedObject: vi.fn().mockResolvedValue(undefined),
};

const service = new StudioVirtualSpaceFurnitureService(storage as never);

function png(width: number, height: number): Uint8Array {
  return new Uint8Array(encode(
    new Image(width, height, new Uint8Array(width * height * 4).fill(120), "RGBA") as never,
    { format: "png" },
  ));
}

const DIGEST = `sha256:${"a".repeat(64)}`;
const OBJECT_PATH = `sha256/aa/${"a".repeat(64)}`;

function body(over: Record<string, unknown> = {}) {
  return {
    declaredMime: "image/png",
    name: "나무 의자",
    dataBase64: Buffer.from(png(40, 40)).toString("base64"),
    ...over,
  };
}

const ACTIVE = { rows: [["active"]] };

beforeEach(() => {
  boundary.query.mockReset();
  boundary.uploadImmutable.mockReset();
  boundary.createSignedReadUrl.mockReset();
  boundary.uploadImmutable.mockResolvedValue({
    contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
    purpose: "source",
    digest: DIGEST,
    objectPath: OBJECT_PATH,
    byteLength: 1,
    contentType: "image/png",
  });
  boundary.createSignedReadUrl.mockResolvedValue({ url: "https://signed.example/x", expiresInSeconds: 900 });
});

describe("ownership", () => {
  it("refuses an anonymous upload", async () => {
    await expect(service.upload(undefined, body())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses a suspended account", async () => {
    boundary.query.mockResolvedValue({ rows: [["suspended"]] });

    await expect(service.upload("u1", body())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("admission", () => {
  it("rejects a WebP that was declared as PNG before touching storage", async () => {
    boundary.query.mockResolvedValue(ACTIVE);

    await expect(service.upload("u1", body({ declaredMime: "image/png", dataBase64: Buffer.from("not an image").toString("base64") })))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(boundary.uploadImmutable).not.toHaveBeenCalled();
  });

  it("refuses a missing body", async () => {
    boundary.query.mockResolvedValue(ACTIVE);

    await expect(service.upload("u1", {})).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("store ordering", () => {
  it("stores the re-encoded png, not the bytes the client sent", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE)
      .mockResolvedValueOnce({ rows: [["f1", "u1", "나무 의자", "image/png", OBJECT_PATH, DIGEST, 40, 40, 99, new Date(0)]] });

    await service.upload("u1", body());

    const uploaded = boundary.uploadImmutable.mock.calls[0][0];
    expect(uploaded.purpose).toBe("source");
    expect(uploaded.contentType).toBe("image/png");
    // PNG 시그니처로 시작해야 원본이 아니라 재인코딩 결과다.
    expect([...uploaded.bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("scales a large upload down to the render edge", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE)
      .mockResolvedValueOnce({
        rows: [["f1", "u1", "큰 소파", "image/png", OBJECT_PATH, DIGEST, 256, 171, 10, new Date(0)]],
      });

    await service.upload("u1", body({
      name: "큰 소파",
      dataBase64: Buffer.from(png(900, 600)).toString("base64"),
    }));

    // DB 는 비어 있는 행을 돌려주므로, 실제로 저장된 바이트를 다시 디코드해 크기를 잰다.
    // 이 경로가 실제로 900x600 이 아니어야 한다는 것을 확인한다.
    const uploaded = boundary.uploadImmutable.mock.calls[0][0].bytes as Uint8Array;
    const stored = decode(uploaded) as { width: number; height: number };
    expect(stored.width).toBe(256);
    expect(stored.height).toBe(171);
  });
});

describe("read url", () => {
  it("scopes the read-url lookup to the owner, not just the furniture id", async () => {
    boundary.query.mockResolvedValueOnce(ACTIVE).mockResolvedValueOnce({ rows: [] });

    await expect(service.createReadUrl("u1", "someone-elses")).rejects.toBeInstanceOf(NotFoundException);

    // 모의 DB 는 WHERE 절과 무관하게 같은 값을 돌려준다. 그래서 생성된 SQL 로 소유권
    // 필터가 실제로 붙었는지 확인해야 한다. id 만 남기면 이 검사가 빨개진다.
    const [sql, params] = boundary.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/"studio_virtual_space_custom_furniture"\."userId" = \$/u);
    expect(sql).toMatch(/"studio_virtual_space_custom_furniture"\."id" = \$/u);
    expect(params).toContain("u1");
    expect(boundary.createSignedReadUrl).not.toHaveBeenCalled();
  });

  it("builds the object reference from stored columns rather than client input", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE)
      .mockResolvedValueOnce({ rows: [["f1", "u1", "의자", "image/png", OBJECT_PATH, DIGEST, 40, 40, 512, new Date(0)]] });

    await service.createReadUrl("u1", "f1");

    const request = boundary.createSignedReadUrl.mock.calls[0][0];
    expect(request.object).toMatchObject({
      contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
      purpose: "source",
      digest: DIGEST,
      objectPath: OBJECT_PATH,
      byteLength: 512,
    });
    expect(request.expiresInSeconds).toBe(900);
  });
});
