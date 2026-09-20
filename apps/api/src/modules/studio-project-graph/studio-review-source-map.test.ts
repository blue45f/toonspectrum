import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioReviewSpatialAnchor } from "@toonspectrum/studio-project-model";
import { studioReviewPreviewDigest, studioReviewPreviewIntentKey } from "./studio-review-preview-producer.contract";
import { studioReviewMappingFromOperation } from "./studio-review-source-map";
import { StudioProjectGraphRepository } from "./studio-project-graph.repository";

const db = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn() }));
vi.mock("../../db", () => ({ dbPool: { connect: db.connect } }));
const doc = { width: 800, pagesList: [{ id: "page-one", canvasH: 1200, elements: [{ id: "frame-one", type: "frame", x: 20, y: 30, width: 200, height: 100 }] },
  { id: "page-two", canvasH: 1200, elements: [] }] };
const digest = studioReviewPreviewDigest(doc), hash = "a".repeat(64), secondHash = "b".repeat(64);
const intent = { intentId: "intent", workId: "work", projectId: "project", artifactId: "artifact", sourceServerRevision: 7,
  sourceContentDigest: digest, pageCount: 2, title: "Saved review", deviceId: "device", createdAt: "2026-09-20T00:00:00Z",
  expectedHeadRevisionId: "head", expectedHeadRootGraphHash: "c".repeat(64) };
const pin = { workId: "work", projectId: "project", artifactId: "artifact", rootGraphHash: digest, reviewId: "review", revisionId: "snapshot" };
const key = studioReviewPreviewIntentKey("owner", intent);
const receipt = { actorUserId: "owner", idempotencyKeyHash: key, response: { status: "completed", subject: pin, fingerprint: studioReviewPreviewDigest(intent) } };
const operation = { commandId: `review-capture-${key}`, payload: { intent, sourceSnapshot: doc, sourceMapVersion: 1,
  pageRasters: [{ ordinal: 0, sha256: hash, width: 1600, height: 2400 }, { ordinal: 1, sha256: secondHash, width: 1600, height: 2400 }] } };

beforeEach(() => { vi.clearAllMocks(); db.query.mockReset(); db.connect.mockResolvedValue(db); });
describe("server source-map attestation", () => {
  it("derives the requested page from the immutable operation rather than current work", () => {
    expect(studioReviewMappingFromOperation(operation, pin, 1, secondHash, receipt)).toMatchObject({ status: "mapped", sourceServerRevision: 7,
      sourceContentDigest: digest, page: { id: "page-two", ordinal: 1, width: 800, renderWidth: 1600 } });
  });
  it("does not infer coordinates for old captures even when a source document exists", () => {
    expect(studioReviewMappingFromOperation({ payload: { intent, sourceSnapshot: doc } }, pin, 0, hash)).toEqual({ status: "unmapped", reason: "legacy-review" });
  });
  it.each(["workId", "projectId", "artifactId", "rootGraphHash"] as const)("rejects cross-scope %s pins", (key) => {
    expect(studioReviewMappingFromOperation(operation, { ...pin, [key]: "other" }, 0, hash, receipt).status).toBe("unmapped");
  });
  it("rejects modified saved source, reordered/missing page attestations and wrong encoded image", () => {
    for (const payload of [
      { ...operation.payload, sourceSnapshot: { ...doc, width: 900 } },
      { ...operation.payload, pageRasters: [...operation.payload.pageRasters].reverse() },
      { ...operation.payload, pageRasters: operation.payload.pageRasters.slice(1) },
    ]) expect(studioReviewMappingFromOperation({ ...operation, payload }, pin, 0, hash, receipt).status).toBe("unmapped");
    expect(studioReviewMappingFromOperation(operation, pin, 0, secondHash, receipt).status).toBe("unmapped");
  });
  it("does not trust a graph command pretending to be a server capture", () => {
    expect(studioReviewMappingFromOperation(operation, pin, 0, hash).status).toBe("unmapped");
    expect(studioReviewMappingFromOperation(operation, pin, 0, hash, { ...receipt, actorUserId: "other" }).status).toBe("unmapped");
    expect(studioReviewMappingFromOperation({ ...operation, commandId: "client-command" }, pin, 0, hash, receipt).status).toBe("unmapped");
  });
});

function repositoryFixture() {
  const inserted = vi.fn();
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM studio_review WHERE")) return { rows: [{ artifactId: "artifact", revisionId: "snapshot", status: "open" }] };
    if (sql.includes('AS "ownerUserId"')) return { rows: [{ projectId: "project", workId: "work", ownerUserId: "owner", artifactId: "artifact",
      membershipRole: null, membershipStatus: null, projectScope: { projectId: "project" } }] };
    if (sql.includes("capture.operation")) return { rows: [{ rootGraphHash: digest, operation, hash, captureReceipt: receipt }] };
    if (sql.includes("INSERT INTO studio_review_comment")) { inserted(); return { rows: [{ createdAt: new Date("2026-09-20T00:00:00Z") }] }; }
    return { rows: [] };
  });
  const spatial = createStudioReviewSpatialAnchor(studioReviewMappingFromOperation(operation, pin, 0, hash, receipt), { kind: "panel", frameId: "frame-one" })!;
  return { repository: new StudioProjectGraphRepository(), inserted,
    input: { id: "comment-one", anchor: { ...spatial, artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "project" } },
      body: "This exact cut", severity: "note" as const, assigneeIds: [] } };
}
describe("review comment source authority", () => {
  it("accepts a cut-bound comment while keeping graph scope at artifact scope", async () => {
    const { repository, inserted, input } = repositoryFixture();
    const result = await repository.createReviewComment("owner", "review", input);
    expect(inserted).toHaveBeenCalledOnce(); expect(result.anchor).toEqual(input.anchor);
  });
  it.each([{ pageId: "page-two" }, { frameId: "missing" }, { sourceServerRevision: 8 }, { sourceContentDigest: "d".repeat(64) }])(
    "rejects forged immutable source coordinates before inserting", async (change) => {
      const { repository, inserted, input } = repositoryFixture();
      await expect(repository.createReviewComment("owner", "review", { ...input,
        anchor: { ...input.anchor, source: { ...input.anchor.source, ...change } },
      })).rejects.toMatchObject({ causeCode: "review_source_anchor_mismatch" });
      expect(inserted).not.toHaveBeenCalled();
    });
  it.each([{ episodeId: "made-up-episode", panelId: "page-one" }, { episodeId: "made-up-episode", panelId: "frame-one", elementId: "frame-one" }])(
    "rejects a valid authoring source smuggled into additional graph scope identities", async (scope) => {
      const { repository, inserted, input } = repositoryFixture();
      await expect(repository.createReviewComment("owner", "review", { ...input,
        anchor: { ...input.anchor, scope: { ...input.anchor.scope, ...scope } },
      })).rejects.toMatchObject({ causeCode: "review_anchor_scope_mismatch" });
      expect(inserted).not.toHaveBeenCalled();
    });
});
