// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioVirtualFurnitureReadUrl,
  listStudioVirtualCustomFurniture,
  studioVirtualCustomFurnitureTextureKey,
  uploadStudioVirtualCustomFurniture,
} from "./studio-virtual-custom-furniture-client";

const fetchMock = vi.hoisted(() => vi.fn());

// Vitest 가 vi.mock 을 import 위로 끌어올린다. 그래야 정적 import 를 맨 위에 둘 수 있다.
vi.mock("@/platform/api", () => ({ apiFetch: fetchMock }));

function fileOf(bytes: number[], name = "의자.png", type = "image/png"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 64, 0, 0, 0, 64, 8, 6, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
  0, 0, 0, 10, 0, 0, 0, 0, 63, 0, 0, 63, 0, 0];

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("texture key", () => {
  it("lives in its own namespace so it cannot collide with an atlas key", () => {
    const key = studioVirtualCustomFurnitureTextureKey("asset-1");

    expect(key).toBe("studio-virtual-custom-furniture-asset-1");
    expect(key.startsWith("studio-experience-v8-")).toBe(false);
  });
});

describe("list", () => {
  it("drops rows the client cannot use instead of rendering them broken", async () => {
    fetchMock.mockResolvedValue(ok([{ id: "a1", name: "의자" }, { name: "no id" }, null, 7]));

    const result = await listStudioVirtualCustomFurniture();

    expect(result).toEqual([{ id: "a1", name: "의자" }]);
  });

  it("returns an empty list when the server is unreachable", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => null } as Response);

    expect(await listStudioVirtualCustomFurniture()).toEqual([]);
  });
});

describe("upload", () => {
  it("sends the sniffed mime, not the one the browser claimed", async () => {
    fetchMock.mockResolvedValue(ok({ id: "a1", name: "의자", width: 64, height: 64, createdAt: "x" }));

    // 브라우저는 JPEG 라고 말하지만 실제 바이트는 PNG 다.
    await uploadStudioVirtualCustomFurniture(fileOf(PNG, "a.jpg", "image/jpeg"));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.declaredMime).toBe("image/png");
  });

  it("accepts a real WebP and strips the extension from the name", async () => {
    fetchMock.mockResolvedValue(ok({ id: "a1", name: "책장", width: 64, height: 64, createdAt: "x" }));

    await uploadStudioVirtualCustomFurniture(fileOf(WEBP, "책장.webp"));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.declaredMime).toBe("image/webp");
    expect(body.name).toBe("책장");
  });

  it("refuses a non image before touching the network", async () => {
    const result = await uploadStudioVirtualCustomFurniture(fileOf([1, 2, 3, 4], "a.txt", "text/plain"));

    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    expect(await uploadStudioVirtualCustomFurniture(fileOf([], "a.png"))).toMatchObject({ ok: false });
  });

  it("surfaces the server's own reason instead of a bare failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "가구가 36개를 넘을 수 없어요." }) } as Response);

    const result = await uploadStudioVirtualCustomFurniture(fileOf(PNG));

    expect(result).toMatchObject({ ok: false, error: "가구가 36개를 넘을 수 없어요." });
  });
});

describe("read url", () => {
  it("returns the signed url the server issued", async () => {
    fetchMock.mockResolvedValue(ok({ url: "https://signed.example/x", expiresInSeconds: 900 }));

    expect(await createStudioVirtualFurnitureReadUrl("asset-1")).toBe("https://signed.example/x");
  });

  it("returns null when the furniture is not the caller's", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => null } as Response);

    expect(await createStudioVirtualFurnitureReadUrl("someone-elses")).toBeNull();
  });
});
