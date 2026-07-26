import { describe, expect, it } from "vitest";

import {
  createCanonicalStudioDocumentEnvelope,
  serializeCanonicalStudioDocumentEnvelope,
} from "./studio-document-envelope";
import {
  createStudioProjectDocumentEnvelope,
  parseStudioProjectDocument,
  serializeStudioProjectDocument,
  STUDIO_PROJECT_DOCUMENT_CURRENT_VERSION,
  STUDIO_PROJECT_DOCUMENT_FORMAT_ID,
  STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE,
} from "./studio-project-document";

const metadata = {
  documentId: "work:project-1",
  revision: 7,
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T01:00:00.000Z",
} as const;

function page(id = "page-1") {
  return {
    id,
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 2_000,
  };
}

describe("studio project canonical document boundary", () => {
  it("keeps current raw project JSON import-compatible", async () => {
    const loaded = await parseStudioProjectDocument({
      version: 2,
      title: "현재 프로젝트",
      pagesList: [page()],
    });

    expect(loaded.source).toBe("legacy-project");
    expect(loaded.project).toMatchObject({
      version: 2,
      title: "현재 프로젝트",
    });
    expect(loaded.envelope).toBeNull();
  });

  it("keeps legacy v1 project JSON import-compatible", async () => {
    const loaded = await parseStudioProjectDocument({
      version: "1.0",
      title: "과거 프로젝트",
      pages: [page()],
    });

    expect(loaded.source).toBe("legacy-project");
    expect(loaded.project).toMatchObject({
      version: 2,
      title: "과거 프로젝트",
      currentPageId: "page-1",
    });
  });

  it("serializes a deterministic current canonical envelope", async () => {
    const value = {
      version: 2,
      title: "정식 프로젝트",
      pagesList: [page()],
    };
    const first = serializeStudioProjectDocument(value, metadata, {
      "vendor.example": { retained: true },
    });
    const second = serializeStudioProjectDocument(value, metadata, {
      "vendor.example": { retained: true },
    });
    const loaded = await parseStudioProjectDocument(first);

    expect(first).toBe(second);
    expect(loaded.source).toBe("canonical-envelope");
    if (loaded.source !== "canonical-envelope") throw new Error("unreachable");
    expect(loaded.project.title).toBe("정식 프로젝트");
    expect(loaded.envelope.format).toEqual({
      id: STUDIO_PROJECT_DOCUMENT_FORMAT_ID,
      version: STUDIO_PROJECT_DOCUMENT_CURRENT_VERSION,
    });
    expect(loaded.envelope.extensions).toEqual({
      "vendor.example": { retained: true },
    });
    expect(loaded.receipt.migrated).toBe(false);
    expect(loaded.receipt.steps).toEqual([]);
  });

  it("migrates a v1 envelope and preserves document identity and extensions", async () => {
    const legacyEnvelope = createCanonicalStudioDocumentEnvelope({
      format: {
        id: STUDIO_PROJECT_DOCUMENT_FORMAT_ID,
        version: 1,
      },
      document: {
        id: metadata.documentId,
        revision: metadata.revision,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
      },
      payload: {
        type: STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE,
        data: {
          version: "1.0",
          title: "봉인된 과거 프로젝트",
          pages: [page()],
        },
      },
      extensions: {
        "vendor.example": {
          opaque: ["keep", 1],
        },
      },
    });

    const loaded = await parseStudioProjectDocument(
      serializeCanonicalStudioDocumentEnvelope(legacyEnvelope)
    );

    expect(loaded.source).toBe("canonical-envelope");
    if (loaded.source !== "canonical-envelope") throw new Error("unreachable");
    expect(loaded.project).toMatchObject({
      version: 2,
      title: "봉인된 과거 프로젝트",
    });
    expect(loaded.envelope.document).toEqual({
      id: metadata.documentId,
      revision: metadata.revision,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    });
    expect(loaded.envelope.extensions).toEqual(legacyEnvelope.extensions);
    expect(loaded.receipt).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      migrated: true,
      steps: [
        {
          migratorId: "studio-project.v1-to-v2",
          fromVersion: 1,
          toVersion: 2,
        },
      ],
    });
  });

  it("preserves an unknown future envelope behind a recoverable typed error", async () => {
    const future = createCanonicalStudioDocumentEnvelope({
      format: {
        id: STUDIO_PROJECT_DOCUMENT_FORMAT_ID,
        version: 99,
      },
      document: {
        id: metadata.documentId,
        revision: metadata.revision,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
      },
      payload: {
        type: STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE,
        data: {
          version: 2,
          pagesList: [page()],
        },
      },
      extensions: {
        future: {
          doNotDrop: true,
        },
      },
    });

    await expect(parseStudioProjectDocument(future)).rejects.toMatchObject({
      name: "StudioProjectDocumentError",
      diagnostic: {
        code: "UNKNOWN_FUTURE_VERSION",
        recoverable: true,
        recovery: "upgrade-client",
      },
      preservedEnvelope: future,
    });
  });

  it("does not reinterpret a damaged envelope as a permissive raw project", async () => {
    await expect(
      parseStudioProjectDocument({
        format: {
          id: STUDIO_PROJECT_DOCUMENT_FORMAT_ID,
          version: 2,
        },
        version: 2,
        pagesList: [page()],
      })
    ).rejects.toMatchObject({
      name: "StudioProjectDocumentError",
      diagnostic: {
        code: "INVALID_ENVELOPE",
      },
    });
  });

  it("detaches and freezes the exported project payload", () => {
    const input = {
      version: 2,
      title: "분리",
      pagesList: [page()],
    };
    const envelope = createStudioProjectDocumentEnvelope(input, metadata);

    input.title = "외부 변경";
    expect(envelope.payload.data).toMatchObject({ title: "분리" });
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.payload.data)).toBe(true);
  });
});
