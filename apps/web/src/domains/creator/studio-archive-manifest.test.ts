import { describe, expect, it } from "vitest";

import {
  planStudioArchiveRestore,
  validateStudioArchiveManifest,
  type StudioArchiveManifest,
} from "./studio-archive-manifest";

const HASH = `sha256:${"b".repeat(64)}`;
const MANIFEST: StudioArchiveManifest = Object.freeze({
  schemaVersion: 1,
  applicationVersion: "1.0.0",
  projectId: "project-1",
  createdAt: "2026-09-11T00:00:00.000Z",
  rootDocumentPaths: ["documents/episode-1.json"],
  files: [
    { path: "documents/episode-1.json", kind: "document", sizeBytes: 1000, checksum: HASH, required: true },
    { path: "assets/background.glb", kind: "asset", sizeBytes: 2000, checksum: HASH, required: true },
    { path: "previews/episode-1.webp", kind: "preview", sizeBytes: 300, checksum: HASH, required: false },
    { path: "rights/manifest.json", kind: "rights", sizeBytes: 200, checksum: HASH, required: true },
  ],
  dependencies: [
    { fromPath: "documents/episode-1.json", toPath: "assets/background.glb" },
    { fromPath: "documents/episode-1.json", toPath: "rights/manifest.json" },
  ],
});

describe("Studio archive manifest", () => {
  it("validates a complete project backup", () => {
    expect(validateStudioArchiveManifest(MANIFEST)).toEqual({
      valid: true,
      issues: [],
      totalSizeBytes: 3500,
    });
  });

  it("restores without overwriting existing files", () => {
    const plan = planStudioArchiveRestore({
      manifest: MANIFEST,
      supportedSchemaVersions: [1],
      existingPaths: ["documents/episode-1.json"],
      availablePaths: MANIFEST.files.map((file) => file.path),
    });
    expect(plan.status).toBe("review");
    expect(plan.renamedPaths["documents/episode-1.json"]).toBe(
      "documents/episode-1-restored-1.json",
    );
    expect(plan.importPaths).toContain("documents/episode-1-restored-1.json");
  });

  it("blocks missing required files but permits optional preview loss", () => {
    expect(planStudioArchiveRestore({
      manifest: MANIFEST,
      supportedSchemaVersions: [1],
      existingPaths: [],
      availablePaths: ["documents/episode-1.json", "assets/background.glb", "rights/manifest.json"],
    })).toMatchObject({
      status: "review",
      skippedOptionalPaths: ["previews/episode-1.webp"],
    });
    expect(planStudioArchiveRestore({
      manifest: MANIFEST,
      supportedSchemaVersions: [1],
      existingPaths: [],
      availablePaths: ["documents/episode-1.json"],
    }).status).toBe("blocked");
  });

  it("blocks unsafe paths and unsupported archive versions", () => {
    expect(validateStudioArchiveManifest({
      ...MANIFEST,
      files: [{ ...MANIFEST.files[0]!, path: "../private.json" }],
      rootDocumentPaths: ["../private.json"],
      dependencies: [],
    }).issues).toContain("file-invalid");
    expect(planStudioArchiveRestore({
      manifest: MANIFEST,
      supportedSchemaVersions: [2],
      existingPaths: [],
      availablePaths: MANIFEST.files.map((file) => file.path),
    }).issues).toEqual(["schema-version-unsupported"]);
  });
});
