import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRIVATE_OBJECT_STORAGE_PORT,
  type PrivateObjectStoragePort,
} from "../../platform/private-object-storage/private-object-storage.port";
import { planCreatorPublicationMediaMutation } from "./creator-publication-media.contract";
import { CreatorPublicationMediaRepository } from "./creator-publication-media.repository";
import {
  CreatorPublicationMediaIntegrityError,
  CreatorPublicationMediaService,
  CreatorPublicationMediaStorageUnavailableError,
  fetchCreatorPublicationMediaObject,
} from "./creator-publication-media.service";

const dataUrl = (value: string) =>
  `data:image/png;base64,${Buffer.from(value).toString("base64")}`;

const persist = vi.fn();
const find = vi.fn();
const summary = vi.fn();
const repository = { persist, find, summary } as unknown as CreatorPublicationMediaRepository;

const uploadImmutable = vi.fn();
const createSignedReadUrl = vi.fn();
const verifyPrivatePurposeBuckets = vi.fn();
const deleteGeneratedObject = vi.fn();
const storage = {
  uploadImmutable,
  createSignedReadUrl,
  verifyPrivatePurposeBuckets,
  deleteGeneratedObject,
} as unknown as PrivateObjectStoragePort;

function locatedObject(bytes: Buffer) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    contractVersion: "toonspectrum.private-object-storage.v2" as const,
    providerId: "cloudflare-r2" as const,
    purpose: "export" as const,
    digest: `sha256:${sha256}`,
    objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`,
    byteLength: bytes.byteLength,
    contentType: "image/png" as const,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.CREATOR_PUBLICATION_MEDIA_STORAGE_MODE;
  persist.mockResolvedValue(undefined);
  verifyPrivatePurposeBuckets.mockResolvedValue({ ready: true, privatePurposeBuckets: 1 });
});

afterEach(() => {
  delete process.env.CREATOR_PUBLICATION_MEDIA_STORAGE_MODE;
  vi.unstubAllGlobals();
});

describe("creator publication media service", () => {
  it("declares constructor injection tokens for metadata-free API bootstraps", () => {
    const declared = Reflect.getMetadata(
      "self:paramtypes",
      CreatorPublicationMediaService,
    ) as Array<{ index: number; param: unknown }>;
    expect([...declared].sort((left, right) => left.index - right.index)).toEqual([
      { index: 0, param: CreatorPublicationMediaRepository },
      { index: 1, param: PRIVATE_OBJECT_STORAGE_PORT },
    ]);
  });

  it("enables externalization when storage is configured and keeps optional legacy fallback otherwise", () => {
    const input = { cover: dataUrl("cover") };
    const configured = new CreatorPublicationMediaService(repository, storage)
      .resolveMutationPlan(input);
    expect(configured.shouldExternalize).toBe(true);
    expect(configured.plan.entries).toHaveLength(1);

    const fallback = new CreatorPublicationMediaService(repository)
      .resolveMutationPlan(input);
    expect(fallback.shouldExternalize).toBe(false);

    process.env.CREATOR_PUBLICATION_MEDIA_STORAGE_MODE = "required";
    expect(() => new CreatorPublicationMediaService(repository).resolveMutationPlan(input))
      .toThrowError(expect.objectContaining({ reason: "not-configured" }));
  });

  it("deduplicates identical bytes, persists every slot, and returns only immutable media routes", async () => {
    const input = {
      cover: dataUrl("same-image"),
      pages: [dataUrl("same-image"), dataUrl("second-image")],
    };
    const plan = planCreatorPublicationMediaMutation(input);
    const objects = new Map(
      plan.entries.map((entry) => [
        entry.payload.sha256,
        locatedObject(entry.payload.bytes),
      ]),
    );
    uploadImmutable.mockImplementation(async ({ bytes }: { bytes: Uint8Array }) => {
      const digest = createHash("sha256").update(bytes).digest("hex");
      return objects.get(digest);
    });

    const result = await new CreatorPublicationMediaService(repository, storage)
      .externalize("owner", "work-1", input, plan);

    expect(uploadImmutable).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledWith(
      "owner",
      "work-1",
      expect.arrayContaining([
        expect.objectContaining({ target: { kind: "cover" }, mediaType: "image/png" }),
        expect.objectContaining({ target: { kind: "page", pageIndex: 0 }, mediaType: "image/png" }),
        expect.objectContaining({ target: { kind: "page", pageIndex: 1 }, mediaType: "image/png" }),
      ]),
    );
    expect(result.cover).toMatch(
      /^\/api\/creator\/works\/work-1\/media\/cover\/[a-f0-9]{64}$/u,
    );
    expect(result.pages).toHaveLength(2);
    expect(result.pages?.every((page) => !page.startsWith("data:"))).toBe(true);
  });

  it("rejects an object-store receipt that does not match the uploaded bytes", async () => {
    const input = { cover: dataUrl("expected") };
    const plan = planCreatorPublicationMediaMutation(input);
    uploadImmutable.mockResolvedValue(locatedObject(Buffer.from("different")));

    await expect(new CreatorPublicationMediaService(repository, storage)
      .externalize("owner", "work-1", input, plan))
      .rejects.toBeInstanceOf(CreatorPublicationMediaIntegrityError);
    expect(persist).not.toHaveBeenCalled();
  });

  it("reads a signed HTTPS object only after content type, length, and digest verification", async () => {
    const bytes = Buffer.from("stored-image");
    const object = locatedObject(bytes);
    const digest = object.digest.slice("sha256:".length);
    find.mockResolvedValue({
      workId: "work-1",
      target: { kind: "cover" },
      digest,
      mediaType: object.contentType,
      byteLength: object.byteLength,
      object,
    });
    createSignedReadUrl.mockResolvedValue({
      url: "https://storage.invalid/object?signature=private",
      expiresAtEpochMs: Date.now() + 60_000,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: {
        "content-length": String(bytes.byteLength),
        "content-type": "image/png",
      },
    })));

    await expect(new CreatorPublicationMediaService(repository, storage)
      .read("work-1", { kind: "cover" }, digest))
      .resolves.toMatchObject({
        bytes,
        byteLength: bytes.byteLength,
        mediaType: "image/png",
        sha256: digest,
      });
  });

  it("fails closed for non-HTTPS signed reads and digest mismatches", async () => {
    const bytes = Buffer.from("stored-image");
    const digest = createHash("sha256").update(bytes).digest("hex");
    await expect(fetchCreatorPublicationMediaObject(
      "http://storage.invalid/object",
      { digest, mediaType: "image/png", byteLength: bytes.byteLength },
      vi.fn(),
    )).rejects.toMatchObject({ reason: "signed-url-protocol" });

    await expect(fetchCreatorPublicationMediaObject(
      "https://storage.invalid/object",
      { digest: "b".repeat(64), mediaType: "image/png", byteLength: bytes.byteLength },
      vi.fn(async () => new Response(bytes, {
        status: 200,
        headers: {
          "content-length": String(bytes.byteLength),
          "content-type": "image/png",
        },
      })),
    )).rejects.toMatchObject({ reason: "digest" });
  });

  it("returns a bounded unavailable error when a referenced object cannot be read", async () => {
    const bytes = Buffer.from("stored-image");
    const object = locatedObject(bytes);
    const digest = object.digest.slice("sha256:".length);
    find.mockResolvedValue({
      workId: "work-1",
      target: { kind: "cover" },
      digest,
      mediaType: object.contentType,
      byteLength: object.byteLength,
      object,
    });
    createSignedReadUrl.mockRejectedValue(new Error("provider secret"));

    await expect(new CreatorPublicationMediaService(repository, storage)
      .read("work-1", { kind: "cover" }, digest))
      .rejects.toBeInstanceOf(CreatorPublicationMediaStorageUnavailableError);
  });
});
