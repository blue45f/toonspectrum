import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION } from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import { StudioProjectForbiddenError, StudioProjectGraphRepository, StudioProjectNotFoundError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";
import { studioReviewPreviewObject, type StudioReviewPreviewBlobRow } from "./studio-review-preview";
import { StudioReviewPreviewController, StudioReviewPreviewQueryDto } from "./studio-review-preview.controller";
import { StudioReviewPreviewService } from "./studio-review-preview.service";

const db = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn() }));
vi.mock("../../platform/database", () => ({ dbPool: { connect: db.connect } }));
const HASH = "a".repeat(64);
const subject = { schemaVersion: 1 as const, projectId: "project-1", workId: "work-1", artifactId: "artifact-1",
  reviewId: "review-1", revisionId: "revision-1", rootGraphHash: "b".repeat(64) };
const object = { contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION, providerId: "cloudflare-r2" as const,
  purpose: "derived" as const, digest: `sha256:${HASH}`, objectPath: `sha256/aa/${HASH}`, byteLength: 128, contentType: "image/png" };
const blob: StudioReviewPreviewBlobRow = { hash: HASH, ordinal: 0, size: 128, mediaType: "image/png",
  objectKey: JSON.stringify(object), encryptionMetadata: null, malwareStatus: "clean", formatStatus: "valid", workStorageObject: object };
const access = { projectId: subject.projectId, workId: subject.workId, ownerUserId: "owner",
  membershipRole: null, membershipStatus: null, artifactId: subject.artifactId,
  headRevisionId: "newer-head", approvedRevisionId: null, projectScope: { projectId: subject.projectId } };
const binding = { ...subject, kind: "review-snapshot", status: "open" };

beforeEach(() => { vi.clearAllMocks(); db.query.mockReset(); db.connect.mockResolvedValue(db); });

describe("pinned preview storage authority", () => {
  it("accepts only exact verified, immutable derived raster locators", () => {
    expect(studioReviewPreviewObject(blob)).toEqual(object);
    expect(studioReviewPreviewObject({ ...blob, size: "128" })).toEqual(object);
    for (const change of [
      { malwareStatus: "pending" }, { malwareStatus: "blocked" }, { formatStatus: "unsupported" },
      { formatStatus: "pending" }, { encryptionMetadata: {} }, { size: 129 }, { size: 0 },
      { mediaType: "image/svg+xml" }, { mediaType: "text/html" }, { hash: "c".repeat(64) },
      { objectKey: "https://example.test/private.png" }, { objectKey: `sha256/aa/${HASH}` },
      { objectKey: JSON.stringify({ ...object, providerId: "unknown" }) },
      { objectKey: JSON.stringify({ ...object, contractVersion: "toonspectrum.supabase-object-storage.v1", providerId: undefined }) },
      { objectKey: JSON.stringify({ ...object, purpose: "source" }) },
      { objectKey: JSON.stringify({ ...object, objectPath: `sha256/bb/${HASH}` }) },
      { objectKey: JSON.stringify({ ...object, url: "https://example.test" }) },
      { workStorageObject: null }, { workStorageObject: { ...object, providerId: "backblaze-b2" } },
      { workStorageObject: { ...object, purpose: "source" } },
    ]) expect(studioReviewPreviewObject({ ...blob, ...change })).toBeNull();
  });

  it("binds current ACL, review, artifact, revision and content hash before reading preview rows", async () => {
    db.query.mockResolvedValueOnce({ rows: [access] }).mockResolvedValueOnce({ rows: [binding] })
      .mockResolvedValueOnce({ rows: [blob] });
    const result = await new StudioProjectGraphRepository().getReviewPreviewSource("owner", subject, null);
    expect(result).toEqual({ subject, blobs: [blob], nextCursor: null, pageMappings: { 0: { status: "unmapped", reason: "legacy-review" } } });
    expect(db.query.mock.calls[0]?.[1]).toEqual([subject.artifactId, "owner"]);
    expect(db.query.mock.calls[1]?.[1]).toEqual([subject.reviewId, subject.artifactId]);
    expect(db.query.mock.calls[2]?.[1]).toEqual([subject.revisionId, -1, "", 33, subject.workId]);
    expect(db.query.mock.calls[2]?.[0]).toContain("ref.role = 'preview'");
    expect(db.query.mock.calls[2]?.[0]).toContain('ownership."workId" = $5');
    expect(db.query.mock.calls[2]?.[0]).toContain("ownership.state = 'active' AND object.state = 'active'");
    expect(db.release).toHaveBeenCalledOnce();
  });

  it("rejects revoked membership before querying review or blob details", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...access, membershipRole: "editor", membershipStatus: "revoked" }] });
    await expect(new StudioProjectGraphRepository().getReviewPreviewSource("former-editor", subject, null))
      .rejects.toBeInstanceOf(StudioProjectForbiddenError);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it.each(["workId", "projectId", "artifactId", "revisionId", "rootGraphHash", "kind"])(
    "rejects a mismatched %s without signing or querying blob content", async (key) => {
      db.query.mockResolvedValueOnce({ rows: [access] }).mockResolvedValueOnce({ rows: [{ ...binding, [key]: "wrong" }] });
      await expect(new StudioProjectGraphRepository().getReviewPreviewSource("owner", subject, null))
        .rejects.toMatchObject({ causeCode: "review_preview_version_mismatch" });
      expect(db.query).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["approved", "rejected", "cancelled"])("retains exact historical preview access for a %s review after checking current ACL", async (status) => {
    db.query.mockResolvedValueOnce({ rows: [access] }).mockResolvedValueOnce({ rows: [{ ...binding, status }] })
      .mockResolvedValueOnce({ rows: [blob] });
    await expect(new StudioProjectGraphRepository().getReviewPreviewSource("owner", subject, null))
      .resolves.toEqual({ subject, blobs: [blob], nextCursor: null, pageMappings: { 0: { status: "unmapped", reason: "legacy-review" } } });
  });

  it("paginates immutable ordinals without changing the source", async () => {
    db.query.mockResolvedValueOnce({ rows: [access] }).mockResolvedValueOnce({ rows: [binding] })
      .mockResolvedValueOnce({ rows: Array.from({ length: 33 }, (_, ordinal) => ({ ...blob, ordinal: ordinal + 8 })) });
    const page = await new StudioProjectGraphRepository().getReviewPreviewSource("owner", subject, `7.${HASH}`);
    expect(page.blobs).toHaveLength(32);
    expect(page.nextCursor).toBe(`39.${HASH}`);
    expect(db.query.mock.calls.at(-1)?.[1]).toEqual([subject.revisionId, 7, HASH, 33, subject.workId]);
  });
});

function serviceFixture() {
  const repository = { getReviewPreviewSource: vi.fn(async () => ({ subject, blobs: [blob], nextCursor: null })) };
  const storage = { verifyPrivatePurposeBuckets: vi.fn(async () => ({ ready: true as const, privatePurposeBuckets: 1 })),
    createSignedReadUrl: vi.fn(async () => ({ url: "https://storage.example.test/immutable.png?signature=private", expiresAtEpochMs: Date.now() + 29_000 })),
    uploadImmutable: vi.fn(), deleteGeneratedObject: vi.fn(),
  } satisfies PrivateObjectStoragePort;
  return { repository, storage, service: new StudioReviewPreviewService(repository as unknown as StudioProjectGraphRepository, storage) };
}

describe("authenticated preview reader", () => {
  it("uses the existing configured private provider and returns short-lived image reads only", async () => {
    const { service, storage, repository } = serviceFixture();
    const result = await service.read("owner", subject, null);
    expect(result).toMatchObject({ ok: true, subject, nextCursor: null,
      previews: [{ sha256: HASH, ordinal: 0, mediaType: "image/png", byteLength: 128 }] });
    expect(repository.getReviewPreviewSource).toHaveBeenCalledWith("owner", subject, null);
    expect(storage.verifyPrivatePurposeBuckets).toHaveBeenCalledWith(undefined, ["derived"]);
    expect(storage.createSignedReadUrl).toHaveBeenCalledWith({ object, expiresInSeconds: 30 });
    expect(storage.uploadImmutable).not.toHaveBeenCalled();
    expect(storage.deleteGeneratedObject).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("objectPath");
    expect(JSON.stringify(result)).not.toContain("providerId");
  });

  it("serves an exact preview through the controller, real repository ACL/binding and existing storage port", async () => {
    const { storage } = serviceFixture();
    db.query.mockResolvedValueOnce({ rows: [access] }).mockResolvedValueOnce({ rows: [binding] })
      .mockResolvedValueOnce({ rows: [blob] });
    const service = new StudioReviewPreviewService(new StudioProjectGraphRepository(), storage);
    const controller = new StudioReviewPreviewController(service);
    const { schemaVersion: _schemaVersion, reviewId, ...query } = subject;
    expect(await controller.getPreviews({ reviewId }, query, "owner")).toMatchObject({ ok: true,
      subject, previews: [{ sha256: HASH, ordinal: 0, mediaType: "image/png", byteLength: 128 }] });
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(storage.createSignedReadUrl).toHaveBeenCalledOnce();
  });

  it("does not sign missing, pending, legacy or encrypted blobs", async () => {
    const { service, repository, storage } = serviceFixture();
    for (const rows of [[], [{ ...blob, malwareStatus: "pending" }], [{ ...blob, objectKey: "legacy-key" }], [{ ...blob, encryptionMetadata: {} }]]) {
      repository.getReviewPreviewSource.mockResolvedValue({ subject, blobs: rows, nextCursor: null });
      expect(await service.read("owner", subject, null)).toEqual({ ok: false, reason: "preview-unavailable" });
    }
    expect(storage.createSignedReadUrl).not.toHaveBeenCalled();
  });

  it("does not sign a private hash copied into another work or an object whose owned reference is deleting", async () => {
    const { storage } = serviceFixture();
    db.query.mockResolvedValueOnce({ rows: [access] }).mockResolvedValueOnce({ rows: [binding] })
      .mockResolvedValueOnce({ rows: [{ ...blob, workStorageObject: null }] });
    const service = new StudioReviewPreviewService(new StudioProjectGraphRepository(), storage);
    expect(await service.read("owner", subject, null)).toEqual({ ok: false, reason: "preview-unavailable" });
    expect(storage.createSignedReadUrl).not.toHaveBeenCalled();
  });

  it("checks authorization even when no storage provider is configured", async () => {
    const { repository } = serviceFixture();
    const service = new StudioReviewPreviewService(repository as unknown as StudioProjectGraphRepository);
    expect(await service.read("owner", subject, null)).toEqual({ ok: false, reason: "preview-unavailable" });
    expect(repository.getReviewPreviewSource).toHaveBeenCalledOnce();
  });

  it("does not expose provider errors or accept expired/overlong signed reads", async () => {
    const { service, storage } = serviceFixture();
    storage.createSignedReadUrl.mockRejectedValueOnce(new Error("service-role-secret storage-bucket"));
    expect(await service.read("owner", subject, null)).toEqual({ ok: false, reason: "preview-unavailable" });
    for (const expiry of [Date.now() - 1, Date.now() + 60_000]) {
      storage.createSignedReadUrl.mockResolvedValue({ url: "https://example.test/a.png", expiresAtEpochMs: expiry });
      expect(await service.read("owner", subject, null)).toEqual({ ok: false, reason: "preview-unavailable" });
    }
    storage.createSignedReadUrl.mockResolvedValue({ url: "https://secret:password@example.test/a.png", expiresAtEpochMs: Date.now() + 29_000 });
    expect(await service.read("owner", subject, null)).toEqual({ ok: false, reason: "preview-unavailable" });
  });

  it("maps access, deletion and version closure without bypassing server authority", async () => {
    const { service, repository } = serviceFixture();
    repository.getReviewPreviewSource.mockRejectedValueOnce(new StudioProjectForbiddenError("view"));
    await expect(service.read("owner", subject, null)).rejects.toBeInstanceOf(ForbiddenException);
    repository.getReviewPreviewSource.mockRejectedValueOnce(new StudioProjectNotFoundError("review"));
    await expect(service.read("owner", subject, null)).rejects.toBeInstanceOf(NotFoundException);
    repository.getReviewPreviewSource.mockRejectedValueOnce(new StudioRepositoryInvariantError("review_closed", "closed"));
    expect(await service.read("owner", subject, null)).toEqual({ ok: false, reason: "closed" });
  });

  it("enforces authenticated actor and exact allowlisted query parameters at the controller", async () => {
    const read = vi.fn(async () => ({ ok: false, reason: "preview-unavailable" }));
    const controller = new StudioReviewPreviewController({ read } as unknown as StudioReviewPreviewService);
    const { reviewId, schemaVersion: _schemaVersion, ...query } = subject;
    expect(() => controller.getPreviews({ reviewId }, query)).toThrow(ForbiddenException);
    await controller.getPreviews({ reviewId }, query, "owner");
    expect(read).toHaveBeenCalledWith("owner", subject, null);
    expect(StudioReviewPreviewQueryDto.schema.safeParse({ ...query, url: "https://untrusted.test" }).success).toBe(false);
    expect(StudioReviewPreviewQueryDto.schema.safeParse({ ...query, cursor: "../../../" }).success).toBe(false);
  });
});
