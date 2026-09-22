import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PinnedReviewShareService } from "./pinned-share.service";
import { PinnedShareError } from "./pinned-share-storage";
import type { PinnedReviewShareRepository } from "./pinned-share.repository";
import type { PrivateObjectStoragePort } from "../../../infrastructure/private-object-storage/private-object-storage.port";

const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const hash = createHash("sha256").update(bytes).digest("hex");
const source = () => ({ shareId: "share", expiresAt: Date.now() + 60_000,
  page: { ordinal: 0, sha256: hash, byteLength: bytes.length, mediaType: "image/png" as const, width: 1, height: 1 },
  object: { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
    purpose: "derived" as const, digest: `sha256:${hash}`, objectPath: `sha256/${hash.slice(0, 2)}/${hash}`, byteLength: bytes.length, contentType: "image/png" } });
const access = { token: "a".repeat(43) };
const image = vi.fn(), sources = vi.fn(), create = vi.fn(), fetcher = vi.fn<typeof fetch>(), signed = vi.fn();
const repository = { image, sources, create } as unknown as PinnedReviewShareRepository;
const ready = vi.fn();
const storage = { verifyPrivatePurposeBuckets: ready, createSignedReadUrl: signed } as unknown as PrivateObjectStoragePort;
let service: PinnedReviewShareService;
beforeEach(() => {
  vi.resetAllMocks(); image.mockImplementation(async () => source()); ready.mockResolvedValue({ ready: true, privatePurposeBuckets: 1 });
  signed.mockImplementation(async () => ({ url: "https://storage.invalid/immutable-preview?signature=private", expiresAtEpochMs: Date.now() + 29000 }));
  fetcher.mockResolvedValue(new Response(bytes, { headers: { "content-type": "image/png", "content-length": String(bytes.length) } }));
  service = new PinnedReviewShareService(repository, storage, fetcher);
});
describe("private pinned-share image delivery", () => {
  it("reads only the provider-generated URL, verifies bytes and rechecks ACL before returning", async () => {
    const result = await service.image(access, 0);
    expect(result.bytes).toEqual(bytes); expect(result).not.toHaveProperty("url"); expect(result).not.toHaveProperty("object");
    expect(image).toHaveBeenCalledTimes(2); expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/storage\.invalid/u), expect.objectContaining({ redirect: "error", credentials: "omit", cache: "no-store" }));
  });
  it("does not contact storage before checking the current share authorization", async () => {
    image.mockRejectedValue(new PinnedShareError("revoked"));
    await expect(service.image(access, 0)).rejects.toMatchObject({ code: "revoked" }); expect(signed).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("discards downloaded bytes if the link is revoked while fetching", async () => {
    image.mockResolvedValueOnce(source()).mockRejectedValueOnce(new PinnedShareError("revoked"));
    await expect(service.image(access, 0)).rejects.toMatchObject({ code: "revoked" }); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("fails closed without a private storage adapter", async () => {
    await expect(new PinnedReviewShareService(repository).image(access, 0)).rejects.toMatchObject({ code: "unavailable" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["http://storage.invalid/object", "https://storage.invalid/object#fragment"])("does not use an insecure or fragment-bearing locator %s", async (url) => {
    signed.mockResolvedValue({ url, expiresAtEpochMs: Date.now() + 29000 }); await expect(service.image(access, 0)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([-1, 60_000])("rejects invalid signed URL expiry %s", async (offset) => {
    signed.mockResolvedValue({ url: "https://storage.invalid/immutable", expiresAtEpochMs: Date.now() + offset });
    await expect(service.image(access, 0)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a private provider that did not confirm readiness", async () => {
    ready.mockResolvedValue({ ready: false }); await expect(service.image(access, 0)).rejects.toThrow(); expect(signed).not.toHaveBeenCalled();
  });
  it.each(["wrong-mime", "wrong-size", "wrong-digest", "too-long", "truncated", "redirect"])("rejects %s data rather than returning unverified pixels", async (kind) => {
    const body = kind === "too-long" ? Buffer.concat([bytes, bytes]) : kind === "truncated" ? bytes.subarray(0, 4) : kind === "wrong-digest" ? Buffer.alloc(bytes.length) : bytes;
    fetcher.mockResolvedValue(new Response(body, { status: kind === "redirect" ? 302 : 200,
      headers: { "content-type": kind === "wrong-mime" ? "image/svg+xml" : "image/png", ...(kind === "wrong-size" ? { "content-length": "999" } : {}) } }));
    await expect(service.image(access, 0)).rejects.toThrow(); expect(image).toHaveBeenCalledTimes(1);
  });
  it("does not return bytes after a different page identity appears in the final check", async () => {
    image.mockResolvedValueOnce(source()).mockResolvedValueOnce({ ...source(), shareId: "another" });
    await expect(service.image(access, 0)).rejects.toThrow();
  });
  it("sanitizes provider failures instead of exposing private URL credentials", async () => {
    fetcher.mockRejectedValue(new Error("https://storage.invalid/secret?signature=DO_NOT_EXPOSE"));
    try { await service.run(() => service.image(access, 0)); throw new Error("Expected failure"); }
    catch (error) { expect(error).toHaveProperty("status", 503); expect(JSON.stringify(error)).not.toContain("DO_NOT_EXPOSE"); }
  });
});
