import { createHash } from "node:crypto";

import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  buildFormatZipFixture,
  buildKritaBundleFixture,
  defaultKritaBundleResources,
  inflateFixtureRaw,
} from "../../../../tests/corpus/formats/krita-bundle-fixtures";
import { md5Hex, parseSafeXml, SafeXmlError } from "../format-common";
import { importKritaBundle, KritaBundleError } from "../krita-bundle";

function bytesFromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected promise to reject");
  } catch (error) {
    return error;
  }
}

function mutationOffsets(byteLength: number, count: number): number[] {
  const offsets = new Set<number>();
  let state = 0x51_7a_93_2d;
  while (offsets.size < Math.min(count, byteLength)) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    offsets.add(state % byteLength);
  }
  return [...offsets];
}

describe("format common integrity primitives", () => {
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
  ])("matches the RFC MD5 vector %j", (text, expected) => {
    expect(md5Hex(new TextEncoder().encode(text))).toBe(expected);
    expect(md5Hex(new TextEncoder().encode(text))).toBe(
      createHash("md5").update(text).digest("hex"),
    );
  });

  it("rejects DTD/entity expansion and bounded-depth attacks", () => {
    expect(() => parseSafeXml('<!DOCTYPE x [<!ENTITY e "boom">]><x>&e;</x>')).toThrow(
      SafeXmlError,
    );
    expect(() => parseSafeXml("<a><b><c/></b></a>", { maxDepth: 1 })).toThrow(
      /depth limit/u,
    );
    expect(() => parseSafeXml("garbage<a/>"))
      .toThrow(/text outside/u);
    expect(() => parseSafeXml("<a/>garbage"))
      .toThrow(/text outside/u);
    expect(() => parseSafeXml("<![CDATA[outside]]><a/>"))
      .toThrow(/CDATA outside/u);
  });
});

describe("Krita resource bundle importer", () => {
  it("imports authored KPP/MYB resources, authenticates MD5, and preserves rights", async () => {
    const bytes = buildKritaBundleFixture();
    const result = await importKritaBundle(bytes, { inflateRaw: inflateFixtureRaw });

    expect(result.format).toBe("krita-resource-bundle");
    expect(result.manifestVersion).toBe("1.2");
    expect(result.bundleVersion).toBe("1");
    expect(result.brushes).toHaveLength(3);
    expect(result.brushes.map((brush) => brush.path)).toEqual([
      "paintoppresets/ink-basic.kpp",
      "paintoppresets/pressure.kpp",
      "paintoppresets/wash.myb",
    ]);
    expect(new Set(result.brushes.map((brush) => brush.program.id)).size).toBe(3);
    for (const brush of result.brushes) {
      expect(brushProgramIRSchema.parse(brush.program)).toEqual(brush.program);
      expect(brush.program.sourcePayload).toBeDefined();
    }
    expect(result.rights).toMatchObject({
      author: "ToonSpectrum QA",
      creator: "ToonSpectrum Test Authors",
      license: "CC0-1.0",
      website: "https://example.invalid/toonspectrum",
      email: "qa@example.invalid",
      tags: ["authored"],
    });
    expect(result.resources.find((resource) => resource.path === "patterns/paper.png")?.status)
      .toBe("preserved");
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({ code: "resource-type-preserved", path: "patterns/paper.png" }),
    );
    expect(bytesFromBase64(result.sourcePayload.base64)).toEqual(bytes);
  });

  it("is byte/result deterministic and makes path+content-addressed program IDs", async () => {
    const bytes = buildKritaBundleFixture();
    const first = await importKritaBundle(bytes, { inflateRaw: inflateFixtureRaw });
    const second = await importKritaBundle(bytes, { inflateRaw: inflateFixtureRaw });
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    const resources = defaultKritaBundleResources();
    resources[0] = { ...resources[0]!, path: "paintoppresets/renamed.kpp" };
    const renamed = await importKritaBundle(buildKritaBundleFixture({ resources }), {
      inflateRaw: inflateFixtureRaw,
    });
    expect(renamed.brushes[0]?.program.id).not.toBe(first.brushes[0]?.program.id);
  });

  it("produces the same brush semantics for stored, mixed, and all-deflate bundles", async () => {
    const results = await Promise.all(
      (["stored", "mixed", "deflate"] as const).map((compression) =>
        importKritaBundle(buildKritaBundleFixture({ compression }), {
          inflateRaw: inflateFixtureRaw,
        }),
      ),
    );
    const resourceSemantics = (result: Awaited<ReturnType<typeof importKritaBundle>>) =>
      result.resources.map((resource) => ({
        path: resource.path,
        mediaType: resource.mediaType,
        md5: resource.md5,
        tags: resource.tags,
        uncompressedBytes: resource.uncompressedBytes,
        status: resource.status,
      }));
    const baseline = results[0]!;
    for (const candidate of results.slice(1)) {
      expect(candidate.brushes).toEqual(baseline.brushes);
      expect(candidate.metadata).toEqual(baseline.metadata);
      expect(candidate.rights).toEqual(baseline.rights);
      expect(candidate.warnings).toEqual(baseline.warnings);
      expect(candidate.unsupported).toEqual(baseline.unsupported);
      expect(resourceSemantics(candidate)).toEqual(resourceSemantics(baseline));
    }
  });

  it("rejects a resource whose manifest MD5 does not authenticate", async () => {
    const resources = defaultKritaBundleResources();
    resources[0] = { ...resources[0]!, manifestMd5: "00000000000000000000000000000000" };
    const result = await importKritaBundle(buildKritaBundleFixture({ resources }), {
      inflateRaw: inflateFixtureRaw,
    });
    expect(result.brushes).toHaveLength(2);
    expect(result.resources[0]).toMatchObject({
      path: "paintoppresets/ink-basic.kpp",
      status: "rejected",
    });
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({ code: "resource-md5-mismatch" }),
    );
  });

  it("surfaces unknown versions, metadata, and unmanifested resources", async () => {
    const bytes = buildKritaBundleFixture({
      manifestVersion: "9.9",
      bundleVersion: "42",
      metadataExtraXml: "<meta:future-field>kept</meta:future-field>",
      extraEntries: [{ path: "future/opaque.bin", data: Uint8Array.from([1, 2, 3]) }],
    });
    const result = await importKritaBundle(bytes, { inflateRaw: inflateFixtureRaw });
    expect(result.unsupported.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "manifest-version-unverified",
        "bundle-version-unverified",
        "metadata-field-unsupported",
        "unmanifested-resource",
      ]),
    );
    expect(result.metadata["meta:future-field"]).toBe("kept");
  });

  it("requires manifest/meta and rejects XML entity declarations", async () => {
    const noManifest = await caught(
      importKritaBundle(buildKritaBundleFixture({ includeManifest: false }), {
        inflateRaw: inflateFixtureRaw,
      }),
    );
    expect(noManifest).toBeInstanceOf(KritaBundleError);
    expect((noManifest as KritaBundleError).code).toBe("manifest-missing");

    const noMetadata = await caught(
      importKritaBundle(buildKritaBundleFixture({ includeMetadata: false }), {
        inflateRaw: inflateFixtureRaw,
      }),
    );
    expect((noMetadata as KritaBundleError).code).toBe("metadata-missing");

    const entity = await caught(
      importKritaBundle(
        buildKritaBundleFixture({
          metadataExtraXml: '<!DOCTYPE x [<!ENTITY e "boom">]><meta:future>&e;</meta:future>',
        }),
        { inflateRaw: inflateFixtureRaw },
      ),
    );
    expect((entity as KritaBundleError).code).toBe("metadata-invalid");
  });

  it("fails closed on traversal, ZIP bombs, truncation, and raised limits", async () => {
    const traversal = buildFormatZipFixture([
      { path: "../escape", data: Uint8Array.from([1]) },
    ]);
    expect((await caught(importKritaBundle(traversal))) as KritaBundleError).toMatchObject({
      code: "archive-invalid",
    });

    const bomb = buildFormatZipFixture([
      {
        path: "META-INF/manifest.xml",
        data: new TextEncoder().encode("tiny"),
        method: 8,
        declaredUncompressedBytes: 10_000_000,
      },
    ]);
    expect((await caught(importKritaBundle(bomb))) as KritaBundleError).toMatchObject({
      code: "archive-invalid",
    });

    for (const flags of [0x0801, 0x0808]) {
      const unsafeFlags = buildFormatZipFixture([
        {
          path: "META-INF/manifest.xml",
          data: new TextEncoder().encode("manifest"),
          flags,
        },
      ]);
      expect(
        (await caught(importKritaBundle(unsafeFlags))) as KritaBundleError,
      ).toMatchObject({ code: "archive-invalid" });
    }

    const duplicate = buildFormatZipFixture([
      { path: "meta.xml", data: new TextEncoder().encode("one") },
      { path: "meta.xml", data: new TextEncoder().encode("two") },
    ]);
    expect((await caught(importKritaBundle(duplicate))) as KritaBundleError).toMatchObject({
      code: "archive-invalid",
    });

    const wrongCrc = buildFormatZipFixture([
      {
        path: "META-INF/manifest.xml",
        data: new TextEncoder().encode("manifest"),
        declaredCrc32: 0,
      },
      { path: "meta.xml", data: new TextEncoder().encode("metadata") },
    ]);
    expect((await caught(importKritaBundle(wrongCrc))) as KritaBundleError).toMatchObject({
      code: "manifest-invalid",
    });

    const valid = buildKritaBundleFixture();
    for (const cut of [0, 1, 8, 30, Math.floor(valid.byteLength / 2), valid.byteLength - 1]) {
      const error = await caught(
        importKritaBundle(valid.slice(0, cut), { inflateRaw: inflateFixtureRaw }),
      );
      expect(error, `cut ${cut}`).toBeInstanceOf(KritaBundleError);
    }

    const raised = await caught(
      importKritaBundle(valid, { limits: { maxEntries: 9_999 } }),
    );
    expect((raised as KritaBundleError).code).toBe("source-too-large");
  });

  it("handles a deterministic one-byte mutation fuzz corpus without untyped failures", async () => {
    const valid = buildKritaBundleFixture();
    let rejected = 0;
    for (const offset of mutationOffsets(valid.byteLength, 64)) {
      const mutated = valid.slice();
      mutated[offset] = (mutated[offset] ?? 0) ^ 0xa5;
      try {
        const result = await importKritaBundle(mutated, { inflateRaw: inflateFixtureRaw });
        expect(bytesFromBase64(result.sourcePayload.base64)).toEqual(mutated);
      } catch (error) {
        rejected += 1;
        expect(error, `mutation at byte ${offset}`).toBeInstanceOf(KritaBundleError);
      }
    }
    expect(rejected).toBeGreaterThan(0);
  });
});
