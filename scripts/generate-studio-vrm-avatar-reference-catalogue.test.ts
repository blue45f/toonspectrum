import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { AVATAR_FORGE_PRESETS } from "../src/domains/creator/studio-vrm-avatar-forge";

import {
  STUDIO_VRM_AVATAR_REFERENCE_ARTIFACT_PATH,
  STUDIO_VRM_AVATAR_REFERENCE_GZIP_BYTE_LIMIT,
  STUDIO_VRM_AVATAR_REFERENCE_RAW_BYTE_LIMIT,
  STUDIO_VRM_AVATAR_REFERENCE_RGBA_BYTE_LENGTH,
  STUDIO_VRM_AVATAR_REFERENCE_ROOT,
  assertStudioVrmAvatarReferenceArtifactSize,
  parseStudioVrmAvatarReferenceGenerationMode,
  serializeStudioVrmAvatarReferenceCatalogue,
  studioVrmAvatarReferenceEmbeddingSha256,
} from "./generate-studio-vrm-avatar-reference-catalogue";

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("Avatar Forge reference catalogue generator", () => {
  it("accepts only explicit write/check modes", () => {
    expect(parseStudioVrmAvatarReferenceGenerationMode(["--write"])).toBe("write");
    expect(parseStudioVrmAvatarReferenceGenerationMode(["--check"])).toBe("check");
    expect(() => parseStudioVrmAvatarReferenceGenerationMode([])).toThrow(/--write\|--check/u);
    expect(() => parseStudioVrmAvatarReferenceGenerationMode(["--write", "extra"]))
      .toThrow(/--write\|--check/u);
  });

  it("pins only the owned CC0 Minseo source bytes", async () => {
    const source = new Uint8Array(await readFile(resolve(
      STUDIO_VRM_AVATAR_REFERENCE_ROOT,
      "public/vrm/TS_Minseo_Campus.vrm",
    )));
    expect(source.byteLength).toBe(463_276);
    expect(sha256(source)).toBe(
      "d361aa40f6da91da167631f4cc0357b0a2c5c2d286684688ab787f0991a6c9c0",
    );
    const generator = await readFile(
      resolve(
        STUDIO_VRM_AVATAR_REFERENCE_ROOT,
        "scripts/generate-studio-vrm-avatar-reference-catalogue.mts",
      ),
      "utf8",
    );
    expect(generator).not.toContain("AvatarSample_A");
  });

  it("hashes the exact serialized MediaPipe embedding object", () => {
    const embedding = {
      headIndex: 0,
      headName: "feature",
      floatEmbedding: [Math.fround(0.1), Math.fround(-0.25), Math.fround(1.5)],
    };
    expect(studioVrmAvatarReferenceEmbeddingSha256(embedding)).toBe(
      sha256(JSON.stringify({
        headIndex: embedding.headIndex,
        headName: embedding.headName,
        floatEmbedding: embedding.floatEmbedding,
      })),
    );
    expect(() => studioVrmAvatarReferenceEmbeddingSha256({
      ...embedding,
      floatEmbedding: [Number.NaN],
    })).toThrow(/finite/u);
  });

  it("serializes compact canonical JSON with one trailing LF and enforces both caps", () => {
    const bytes = serializeStudioVrmAvatarReferenceCatalogue({
      authority: { sourceAssetId: "toonspectrum-minseo-campus" },
      renders: [],
      catalogue: { entries: [] },
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe(
      '{"authority":{"sourceAssetId":"toonspectrum-minseo-campus"},"renders":[],"catalogue":{"entries":[]}}\n',
    );
    expect(text).not.toContain("  ");
    expect(assertStudioVrmAvatarReferenceArtifactSize(bytes)).toEqual({
      rawByteLength: bytes.byteLength,
      gzipByteLength: gzipSync(bytes, { level: 9 }).byteLength,
    });
    expect(() => assertStudioVrmAvatarReferenceArtifactSize(
      new Uint8Array(STUDIO_VRM_AVATAR_REFERENCE_RAW_BYTE_LIMIT + 1),
    )).toThrow(/raw limit/u);
  });

  it("uses all 21 unique product presets and exact RGBA dimensions", () => {
    expect(AVATAR_FORGE_PRESETS).toHaveLength(21);
    expect(new Set(AVATAR_FORGE_PRESETS.map(({ id }) => id)).size).toBe(21);
    expect(STUDIO_VRM_AVATAR_REFERENCE_RGBA_BYTE_LENGTH).toBe(1_048_576);
    expect(STUDIO_VRM_AVATAR_REFERENCE_RAW_BYTE_LIMIT).toBe(524_288);
    expect(STUDIO_VRM_AVATAR_REFERENCE_GZIP_BYTE_LIMIT).toBe(225_280);
  });

  it("exposes explicit manual write/check commands without joining normal builds", async () => {
    const packageJson = JSON.parse(await readFile(
      resolve(STUDIO_VRM_AVATAR_REFERENCE_ROOT, "package.json"),
      "utf8",
    )) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["studio:avatar-reference-catalogue:write"]).toBe(
      "tsx scripts/generate-studio-vrm-avatar-reference-catalogue.mts --write",
    );
    expect(packageJson.scripts?.["studio:avatar-reference-catalogue:check"]).toBe(
      "tsx scripts/generate-studio-vrm-avatar-reference-catalogue.mts --check",
    );
    expect(packageJson.scripts?.build).not.toContain("avatar-reference-catalogue");
    expect(packageJson.scripts?.prebuild).not.toContain("avatar-reference-catalogue");
  });

  it("keeps the browser harness on production rendering and official embedding paths", async () => {
    const source = await readFile(resolve(
      STUDIO_VRM_AVATAR_REFERENCE_ROOT,
      "scripts/studio-vrm-avatar-reference-catalogue-browser.tsx",
    ), "utf8");
    expect(source).toContain('from "../src/domains/creator/StudioVrmAvatarForge"');
    expect(source).toContain("<StudioVrmAvatarForge");
    expect(source).toContain("createAvatarForgeState(presetId)");
    expect(source).toContain("ImageEmbedder.createFromOptions");
    expect(source).toContain("runtime.embedder.embed(capture)");
    expect(source).toContain("runtime.cosineSimilarity");
    expect(source).toContain('id: "horizontal-flip"');
    expect(source).toContain('id: "center-scale-90"');
    expect(source).toContain("runtime.embedder.embed(horizontalFlip)");
    expect(source).toContain("runtime.embedder.embed(centerScale)");
    expect(source).not.toContain("AvatarSample_A");
  });

  it("validates a generated artifact structurally when it exists", async () => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(STUDIO_VRM_AVATAR_REFERENCE_ARTIFACT_PATH));
    } catch {
      return;
    }
    const size = assertStudioVrmAvatarReferenceArtifactSize(bytes);
    expect(size.rawByteLength).toBeLessThanOrEqual(STUDIO_VRM_AVATAR_REFERENCE_RAW_BYTE_LIMIT);
    expect(size.gzipByteLength).toBeLessThanOrEqual(STUDIO_VRM_AVATAR_REFERENCE_GZIP_BYTE_LIMIT);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      authority: { sourceSha256?: unknown; pixelFormat?: unknown };
      renders: Array<{
        presetId: string;
        referenceImageByteLength: number;
        referenceImageSha256: string;
        embeddingSha256: string;
      }>;
      catalogue: { entries: Array<{ presetId: string; embedding: Parameters<typeof studioVrmAvatarReferenceEmbeddingSha256>[0] }> };
    };
    expect(parsed.authority.sourceSha256).toBe(
      "d361aa40f6da91da167631f4cc0357b0a2c5c2d286684688ab787f0991a6c9c0",
    );
    expect(parsed.authority.pixelFormat).toBe("rgba8-unorm-top-left-row-major");
    expect(parsed.renders).toHaveLength(21);
    expect(parsed.catalogue.entries).toHaveLength(21);
    expect(parsed.renders.map(({ presetId }) => presetId)).toEqual(
      [...parsed.renders.map(({ presetId }) => presetId)].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
    );
    const entries = new Map(parsed.catalogue.entries.map((entry) => [entry.presetId, entry]));
    for (const render of parsed.renders) {
      expect(render.referenceImageByteLength).toBe(STUDIO_VRM_AVATAR_REFERENCE_RGBA_BYTE_LENGTH);
      expect(render.referenceImageSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(render.embeddingSha256).toBe(
        studioVrmAvatarReferenceEmbeddingSha256(entries.get(render.presetId)!.embedding),
      );
    }
  });
});
