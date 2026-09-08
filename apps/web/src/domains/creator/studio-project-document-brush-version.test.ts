import { describe, expect, it } from "vitest";

import {
  buildStudioProjectDocumentSaveArtifact,
  createStudioProjectDocumentEnvelope,
  parseStudioProjectDocument,
  serializeStudioProjectDocument,
} from "./studio-project-document";

const metadata = {
  documentId: "brush-version-document", revision: 4,
  createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:01:00.000Z",
};
const project = (pipeline: string) => ({
  version: 2, title: "Pencil", pagesList: [{
    id: "page-1", elements: [{
      id: "stroke", type: "draw", brush: "dry-media",
      brushDynamics: { version: 1, depositPipeline: pipeline, seed: 123 },
    }], bg: "#fff", bgGrad: null, canvasH: 900,
  }],
});

describe("canonical project envelope minimum brush reader", () => {
  it("binds V4 snapshots to envelope V3 and roundtrips the complete save artifact", async () => {
    const source = project("causal-deposit-v4-taper-spacing");
    const artifact = await buildStudioProjectDocumentSaveArtifact(source, metadata, { custom: { keep: true } });
    expect(artifact.project.version).toBe(3);
    expect(artifact.envelope.format.version).toBe(3);
    const loaded = await parseStudioProjectDocument(artifact.canonicalJson);
    expect(loaded.project.pagesList[0].elements).toEqual(source.pagesList[0].elements);
    expect(loaded.source).toBe("canonical-envelope");
    if (loaded.source !== "canonical-envelope") throw new Error("Expected canonical envelope");
    expect(loaded.envelope).toEqual(artifact.envelope);
    expect(loaded.receipt.migrated).toBe(false);
    expect(serializeStudioProjectDocument(loaded.project, metadata, loaded.envelope.extensions)).toBe(artifact.canonicalJson);
    const raw = await parseStudioProjectDocument(artifact.project);
    expect(raw.project).toEqual(artifact.project);
  });

  it.each(["causal-deposit-v2", "causal-deposit-v3-segmented"])(
    "preserves the existing envelope and replay bytes for %s", async (pipeline) => {
      const source = project(pipeline);
      const saved = createStudioProjectDocumentEnvelope(source, metadata);
      expect(saved.format.version).toBe(2);
      const loaded = await parseStudioProjectDocument(saved);
      expect(loaded.source).toBe("canonical-envelope");
      if (loaded.source !== "canonical-envelope") throw new Error("Expected canonical envelope");
      expect(loaded.envelope).toEqual(saved);
      expect(loaded.receipt.migrated).toBe(false);
      expect(loaded.project.pagesList[0].elements).toEqual(source.pagesList[0].elements);
    },
  );

  it("rejects a lower envelope version that disguises a new brush reader requirement", async () => {
    const saved = createStudioProjectDocumentEnvelope(project("causal-deposit-v4-taper-spacing"), metadata);
    const downgraded = { ...saved, format: { ...saved.format, version: 2 } };
    await expect(parseStudioProjectDocument(downgraded)).rejects.toMatchObject({
      diagnostic: { code: "INVALID_ENVELOPE", recovery: "repair-source" },
      preservedEnvelope: downgraded,
    });
  });
});
