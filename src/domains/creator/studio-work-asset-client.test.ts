import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteUnreferencedStudioWorkAssetUpload,
  downloadStudioWorkAsset,
  readBoundedStudioWorkAssetResponse,
  StudioWorkAssetRequestError,
  uploadStudioWorkAsset,
} from "./studio-work-asset-client";

import type { StudioWorkAssetManifest } from "@/lib/studio-work-asset-contract";


const { del, get, put } = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/src/infrastructure/api", () => ({
  api: { raw: { delete: del, get, put } },
  apiPath: (path: string) => `/api${path}`,
  isHttpError: () => false,
  toApiError: async (error: unknown, fallback: string) =>
    new Error(error instanceof Error ? error.message : fallback),
}));

const reference = { assetId: "asset / 한글", elementType: "image" as const };
const descriptor = {
  version: 1 as const,
  element: {
    id: reference.assetId,
    type: reference.elementType,
    x: 1,
    y: 2,
    width: 100,
    height: 200,
    rotation: 0,
  },
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function manifest(bytes: Uint8Array): Promise<StudioWorkAssetManifest> {
  return {
    version: 1,
    assetId: reference.assetId,
    elementType: "image",
    mimeType: "image/png",
    byteSize: bytes.byteLength,
    sha256: await sha256(bytes),
    intrinsicImage: { width: 1, height: 1, decodedRgbaBytes: 4 },
    descriptor,
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}

describe("studio work asset client", () => {
  beforeEach(() => {
    del.mockReset();
    get.mockReset();
    put.mockReset();
  });

  it("downloads manifest and binary separately, then verifies MIME, size, and SHA-256", async () => {
    const bytes = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);
    const expected = await manifest(bytes);
    get
      .mockResolvedValueOnce(jsonResponse(expected))
      .mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": "image/png" } }));

    const result = await downloadStudioWorkAsset("work / 1", reference);

    expect(result.manifest).toEqual(expected);
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
    expect(get.mock.calls[0]?.[0]).toBe("/api/creator/works/work%20%2F%201/assets/asset%20%2F%20%ED%95%9C%EA%B8%80");
    expect(get.mock.calls[1]?.[0]).toContain("/content");
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      searchParams: { elementType: "image" },
    });
  });

  it("fails closed on a stale/tampered body and never returns a Blob", async () => {
    const expectedBytes = Uint8Array.of(1, 2, 3, 4);
    get
      .mockResolvedValueOnce(jsonResponse(await manifest(expectedBytes)))
      .mockResolvedValueOnce(new Response(Uint8Array.of(1, 2, 3, 5), {
        headers: { "Content-Type": "image/png" },
      }));
    await expect(downloadStudioWorkAsset("work-1", reference))
      .rejects.toBeInstanceOf(StudioWorkAssetRequestError);
  });

  it("rejects Content-Length before reading and cancels an over-limit stream", async () => {
    const bytes = Uint8Array.of(1, 2, 3, 4);
    const expected = await manifest(bytes);
    get
      .mockResolvedValueOnce(jsonResponse(expected))
      .mockResolvedValueOnce(new Response(Uint8Array.of(1, 2, 3, 4, 5), {
        headers: { "Content-Type": "image/png", "Content-Length": "5" },
      }));
    await expect(downloadStudioWorkAsset("work-1", reference))
      .rejects.toThrow(/Content-Length/u);

    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.of(1, 2, 3));
        controller.enqueue(Uint8Array.of(4, 5, 6));
      },
      cancel,
    });
    get
      .mockResolvedValueOnce(jsonResponse(expected))
      .mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "image/png" } }));
    await expect(downloadStudioWorkAsset("work-1", reference))
      .rejects.toThrow(/허용 크기/u);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("allows the non-stream fallback only after an exact bounded length", async () => {
    const arrayBuffer = vi.fn(async () => Uint8Array.of(1, 2, 3, 4).buffer);
    const response = {
      headers: new Headers({ "Content-Length": "4" }),
      body: null,
      arrayBuffer,
    } as unknown as Response;
    await expect(readBoundedStudioWorkAssetResponse(response, 4, 8))
      .resolves.toEqual(Uint8Array.of(1, 2, 3, 4));
    expect(arrayBuffer).toHaveBeenCalledOnce();

    const unbounded = {
      ...response,
      headers: new Headers(),
      arrayBuffer: vi.fn(async () => new ArrayBuffer(100)),
    } as unknown as Response;
    await expect(readBoundedStudioWorkAssetResponse(unbounded, 4, 8))
      .rejects.toThrow(/길이가 확인된/u);
    expect(unbounded.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects a same-ID response with a different type", async () => {
    const bytes = Uint8Array.of(1);
    const wrong = {
      ...(await manifest(bytes)),
      elementType: "vrm",
      mimeType: "model/gltf-binary",
      intrinsicImage: null,
      descriptor: {
        ...descriptor,
        element: { ...descriptor.element, type: "vrm" },
      },
    };
    get.mockResolvedValueOnce(jsonResponse(wrong));
    await expect(downloadStudioWorkAsset("work-1", reference))
      .rejects.toBeInstanceOf(StudioWorkAssetRequestError);
    expect(get).toHaveBeenCalledOnce();
  });

  it("uploads multipart without putting bytes or data URLs in JSON/CRDT-shaped fields", async () => {
    const bytes = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);
    const expected = await manifest(bytes);
    put.mockResolvedValueOnce(jsonResponse(expected));
    await expect(uploadStudioWorkAsset(
      "work-1",
      reference,
      descriptor,
      new Blob([bytes], { type: "image/png" })
    )).resolves.toEqual(expected);
    const options = put.mock.calls[0]?.[1] as { body?: unknown; headers?: unknown };
    expect(options.body).toBeInstanceOf(FormData);
    expect(options).not.toHaveProperty("headers");
    const form = options.body as FormData;
    expect(form.get("elementType")).toBe("image");
    expect(form.get("descriptor")).toBe(JSON.stringify(descriptor));
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(String(form.get("descriptor"))).not.toContain("data:");
  });

  it("deletes only an exact receipt-bound orphan and validates the response", async () => {
    del.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    await expect(deleteUnreferencedStudioWorkAssetUpload(
      "work / 1",
      reference,
      "a".repeat(64)
    )).resolves.toBe(true);
    expect(del).toHaveBeenCalledWith(
      "/api/creator/works/work%20%2F%201/assets/asset%20%2F%20%ED%95%9C%EA%B8%80",
      expect.objectContaining({
        searchParams: {
          elementType: "image",
          expectedSha256: "a".repeat(64),
        },
      })
    );

    del.mockResolvedValueOnce(jsonResponse({ deleted: "yes" }));
    await expect(deleteUnreferencedStudioWorkAssetUpload(
      "work-1",
      reference,
      "a".repeat(64)
    )).rejects.toBeInstanceOf(StudioWorkAssetRequestError);
  });

});
