import { describe, expect, it } from "vitest";

import {
  normalizeCreatorPublicationAudit,
  normalizeCreatorPublicationSource,
  readCreatorPublicationAudit,
  readCreatorPublicationSource,
  toPublicCreatorPublicationSource,
  writeCreatorPublicationAudit,
  writeCreatorPublicationSource,
} from "./creator-publication-integrity";

const checksum = "a".repeat(64);

describe("creator publication integrity contract", () => {
  it("normalizes source links while preserving a stable revision and checksum", () => {
    expect(normalizeCreatorPublicationSource({
      kind: "studio_document",
      projectId: " project ",
      documentId: " document ",
      revisionId: " r12 ",
      contentChecksum: checksum.toUpperCase(),
      disclosure: "  브라우저 캔버스에서 제작  ",
    })).toEqual({
      version: 1,
      kind: "studio_document",
      projectId: "project",
      documentId: "document",
      revisionId: "r12",
      contentChecksum: checksum,
      disclosure: "브라우저 캔버스에서 제작",
    });
  });

  it("keeps internal project identifiers private in the public projection", () => {
    expect(toPublicCreatorPublicationSource({
      kind: "studio_document",
      projectId: "project-secret",
      documentId: "document-secret",
      revisionId: "r12",
      contentChecksum: checksum,
      disclosure: "직접 제작",
    })).toEqual({
      version: 1,
      kind: "studio_document",
      revisionId: "r12",
      contentChecksum: checksum,
      disclosure: "직접 제작",
    });
  });

  it("normalizes a private actor audit with bounded unique tool identifiers", () => {
    expect(normalizeCreatorPublicationAudit({
      editorActor: "agent",
      publisherActor: "owner",
      ownerApproved: true,
      ownerUserId: " owner ",
      approvedAt: "2026-09-24T19:47:13+09:00",
      toolIds: ["browser", "browser", "draw-engine"],
    })).toEqual({
      version: 1,
      editorActor: "agent",
      publisherActor: "owner",
      ownerApproved: true,
      ownerUserId: "owner",
      approvedAt: "2026-09-24T10:47:13.000Z",
      toolIds: ["browser", "draw-engine"],
    });
  });

  it("writes and reads source and audit metadata without replacing editor data", () => {
    const source = normalizeCreatorPublicationSource({ kind: "uploaded_file" });
    const audit = normalizeCreatorPublicationAudit({ publisherActor: "agent" });
    const document = writeCreatorPublicationAudit(
      writeCreatorPublicationSource({ pagesList: [{ id: "page-1" }] }, source),
      audit,
    );

    expect(document.pagesList).toEqual([{ id: "page-1" }]);
    expect(readCreatorPublicationSource(document)).toEqual(source);
    expect(readCreatorPublicationAudit(document)).toEqual(audit);
  });
});
