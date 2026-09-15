import { describe, expect, it } from "vitest";

import { createDefaultStudioSaveProfile } from "./studio-save-profile";
import { buildStudioProjectPackage, studioPackageCrc32 } from "./studio-project-package";

const project = {
  id: "project-1",
  title: "비공개 원고",
  kind: "webtoon" as const,
  status: "active" as const,
  statusBeforeTrash: null,
  templateId: null,
  description: "",
  primaryLocale: "ko-KR",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  lastOpenedAt: "2026-09-15T00:00:00.000Z",
  lastOpenedDocumentId: null,
  thumbnailUrl: null,
};

describe("studio project package", () => {
  it("creates a real ZIP container with private manifest metadata", async () => {
    const result = buildStudioProjectPackage({
      project,
      documents: [],
      profile: createDefaultStudioSaveProfile(project.id, {
        now: "2026-09-15T00:00:00.000Z",
      }),
      exportedAt: "2026-09-15T01:00:00.000Z",
    });
    const bytes = new Uint8Array(await result.blob.arrayBuffer());

    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(result.fileName).toBe("비공개 원고.toonstudio");
    expect(result.manifest.accessMode).toBe("owner-only");
    expect(result.manifest.distributionState).toBe("none");
    expect(new TextDecoder().decode(bytes)).toContain("manifest.json");
  });

  it("computes a standard CRC32", () => {
    expect(studioPackageCrc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
