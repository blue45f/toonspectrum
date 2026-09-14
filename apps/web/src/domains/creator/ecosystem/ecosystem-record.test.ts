import { describe, expect, it } from "vitest";

import { BETA_PACKAGE_SCHEMA, PROCESS_PACKAGE_SCHEMA } from "./ecosystem-record";

const preview = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const timestamp = new Date(0).toISOString();

describe("portable creator ecosystem packages", () => {
  it("accepts bounded, signature-checked beta and process previews", () => {
    expect(BETA_PACKAGE_SCHEMA.parse({ kind: "toonstudio-beta", version: 1, id: "package", documentId: "document",
      title: "작품", createdAt: timestamp, rightsAcknowledged: true,
      pages: [{ id: "page", image: preview, fingerprint: "v1-1-a", panels: [], dialogue: [] }],
    }).pages).toHaveLength(1);
    expect(PROCESS_PACKAGE_SCHEMA.parse({ kind: "toonstudio-process", version: 1, title: "과정",
      credit: "자체 제작", rightsAcknowledged: true, sampleId: null,
      checkpoints: [{ id: "stage", pageId: "page", label: "콘티", preview,
        fingerprint: "v1-1-a", createdAt: timestamp }],
    }).checkpoints).toHaveLength(1);
  });

  it("rejects a MIME label whose bytes are not a real raster header", () => {
    expect(() => BETA_PACKAGE_SCHEMA.parse({ kind: "toonstudio-beta", version: 1, id: "package", documentId: "document",
      title: "작품", createdAt: timestamp, rightsAcknowledged: true,
      pages: [{ id: "page", image: "data:image/png;base64,QUFBQQ==", fingerprint: "v1", panels: [], dialogue: [] }],
    })).toThrow(/래스터/u);
  });
});
