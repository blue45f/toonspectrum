import { createHash } from "node:crypto";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REVIEW_DELIVERY_PROFILE, createReviewDeliveryManifest } from "@toonspectrum/studio-project-model/review-delivery";
import { PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION } from "../../../infrastructure/private-object-storage/private-object-storage.contract";
import { StudioReviewDeliveryService } from "./review-delivery.service";

const pageBytes = Buffer.from([137, 80, 78, 71]);
const sha256 = createHash("sha256").update(pageBytes).digest("hex");
const page = { ordinal: 0, sha256, byteLength: pageBytes.length, mediaType: "image/png" as const, width: 10, height: 10 };
const object = { contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION, providerId: "supabase" as const, purpose: "derived" as const,
  digest: `sha256:${sha256}` as const, objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}` as const,
  byteLength: pageBytes.length, contentType: "image/png" as const };
const deliverySubject = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact",
  reviewId: "review", revisionId: "revision", rootGraphHash: "b".repeat(64) };
const deliveryRights = { contract: "studio-review-delivery-rights-v1" as const, statementVersion: 1 as const,
  mode: "free" as const, rightsGraphDigest: "c".repeat(64), confirmed: true as const,
  statement: "Explicit delivery rights confirmation for the exact approved review." };
const manifest = createReviewDeliveryManifest({ id: "22222222-2222-4222-8222-222222222222", title: "Delivery",
  preparedAt: "2026-09-23T00:00:00.000Z", source: { subject: deliverySubject, approvalDigest: "d".repeat(64),
    decidedAt: "2026-09-23T00:00:00.000Z", pages: [page] }, sourceDigest: "e".repeat(64),
  profile: DEFAULT_REVIEW_DELIVERY_PROFILE, rights: deliveryRights });
const input = { operationId: "11111111-1111-4111-8111-111111111111", expectedVersion: 1, manifestDigest: "a".repeat(64) };
function setup(response = new Response(pageBytes, { status: 200, headers: { "content-type": "image/png", "content-length": String(pageBytes.length) } })) {
  const job = { id: "delivery", state: "delivered" };
  const repository = { downloadSource: vi.fn().mockResolvedValue({ row: { manifest }, pages: [page], objects: [object], actorIsRecipient: true }),
    confirmDownload: vi.fn().mockResolvedValue(job) };
  const storage = { verifyPrivatePurposeBuckets: vi.fn().mockResolvedValue({ ready: true }),
    createSignedReadUrl: vi.fn().mockResolvedValue({ url: "https://objects.example.test/read", expiresAtEpochMs: Date.now() + 25_000 }) };
  const fetcher = vi.fn().mockResolvedValue(response);
  return { service: new StudioReviewDeliveryService(repository as never, storage as never, fetcher as never), repository, storage, fetcher, job };
}
describe("approved review delivery archive service", () => {
  it("reads exact private bytes, creates one deterministic archive and confirms its digest", async () => {
    const { service, repository, storage, fetcher, job } = setup();
    const result = await service.download("recipient", "work", "delivery", input);
    expect(result.job).toBe(job); expect(result.bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(result.bytes.readUInt32LE(result.bytes.length - 22)).toBe(0x06054b50);
    expect(result.fileName).toBe("toonstudio-approved-delivery-delivery.zip");
    expect(storage.verifyPrivatePurposeBuckets).toHaveBeenCalledExactlyOnceWith({ signal: undefined }, ["derived"]);
    expect(storage.createSignedReadUrl).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: "error", credentials: "omit", cache: "no-store" });
    expect(repository.confirmDownload).toHaveBeenCalledOnce();
    expect(repository.confirmDownload.mock.calls[0]![4]).toMatchObject({ byteLength: result.bytes.length });
    expect(repository.confirmDownload.mock.calls[0]![4].sha256).toMatch(/^[a-f0-9]{64}$/u);
  });
  it.each([
    ["wrong mime", new Response(pageBytes, { status: 200, headers: { "content-type": "text/plain", "content-length": String(pageBytes.length) } })],
    ["wrong length", new Response(pageBytes, { status: 200, headers: { "content-type": "image/png", "content-length": "99" } })],
    ["wrong digest", new Response(Buffer.from([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png", "content-length": "4" } })],
  ])("rejects %s without recording an archive", async (_label, response) => {
    const { service, repository } = setup(response);
    await expect(service.download("recipient", "work", "delivery", input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.confirmDownload).not.toHaveBeenCalled();
  });
  it("fails closed when stored manifest data does not satisfy the shared contract", async () => {
    const { service, repository } = setup();
    repository.downloadSource.mockResolvedValue({ row: { manifest: { pages: manifest.pages } }, pages: [page], objects: [object], actorIsRecipient: true });
    await expect(service.download("recipient", "work", "delivery", input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.confirmDownload).not.toHaveBeenCalled();
  });
  it("rejects a storage readiness failure before issuing a signed URL", async () => {
    const { service, repository, storage } = setup(); storage.verifyPrivatePurposeBuckets.mockResolvedValue({ ready: false });
    await expect(service.download("recipient", "work", "delivery", input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(storage.createSignedReadUrl).not.toHaveBeenCalled(); expect(repository.confirmDownload).not.toHaveBeenCalled();
  });
  it("does not return generated bytes when the second authority confirmation conflicts", async () => {
    const { service, repository } = setup(); repository.confirmDownload.mockRejectedValue(new ConflictException({ code: "changed" }));
    await expect(service.download("recipient", "work", "delivery", input)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.confirmDownload).toHaveBeenCalledOnce();
  });
});
