import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  STUDIO_BG3D_GLB_MAX_BYTES,
  STUDIO_BG3D_GLB_MAX_JSON_BYTES,
  STUDIO_BG3D_GLB_MIME_TYPE,
  validateStudioBg3dGlb,
  type StudioBg3dGlbBudgetProfiles,
  type StudioBg3dGlbFailureCode,
  type StudioBg3dGlbValidationOptions,
} from "./studio-bg3d-glb-validation";

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function pad(bytes: Uint8Array, byte: number): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
  padded.fill(byte);
  padded.set(bytes);
  return padded;
}

function assembleGlb(chunks: readonly { type: number; bytes: Uint8Array }[]): Uint8Array {
  const total = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.bytes.byteLength, 0);
  const result = new Uint8Array(total);
  writeUint32(result, 0, 0x46546c67);
  writeUint32(result, 4, 2);
  writeUint32(result, 8, total);
  let offset = 12;
  for (const chunk of chunks) {
    writeUint32(result, offset, chunk.bytes.byteLength);
    writeUint32(result, offset + 4, chunk.type);
    result.set(chunk.bytes, offset + 8);
    offset += 8 + chunk.bytes.byteLength;
  }
  return result;
}

function makeGlb(root: Record<string, unknown>, bin?: Uint8Array): Uint8Array {
  const json = pad(new TextEncoder().encode(JSON.stringify(root)), 0x20);
  const chunks = [{ type: JSON_CHUNK, bytes: json }];
  if (bin) chunks.push({ type: BIN_CHUNK, bytes: pad(bin, 0) });
  return assembleGlb(chunks);
}

function pngHeader(width: number, height: number, byteLength = 32): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function validRoot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asset: { version: "2.0", generator: "test" },
    buffers: [{ byteLength: 32 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 32 }],
    accessors: [{ count: 6 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }, { mesh: 0 }],
    materials: [{}],
    images: [{ bufferView: 0, mimeType: "image/png" }],
    textures: [{ source: 0 }],
    extensions: {
      KHR_lights_punctual: { lights: [{ type: "directional" }, { type: "point" }] },
    },
    ...overrides,
  };
}

function validGlb(overrides: Record<string, unknown> = {}, bin = pngHeader(2, 3)): Uint8Array {
  return makeGlb(validRoot(overrides), bin);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function profiles(
  desktop: {
    complexity?: Partial<StudioBg3dGlbBudgetProfiles["desktop"]["complexity"]>;
    textures?: Partial<StudioBg3dGlbBudgetProfiles["desktop"]["textures"]>;
  } = {},
): StudioBg3dGlbBudgetProfiles {
  const defaults = DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES;
  return {
    mobile: defaults.mobile,
    desktop: {
      complexity: { ...defaults.desktop.complexity, ...desktop.complexity },
      textures: { ...defaults.desktop.textures, ...desktop.textures },
    },
  };
}

async function optionsFor(
  bytes: Uint8Array,
  overrides: Partial<StudioBg3dGlbValidationOptions> = {},
): Promise<StudioBg3dGlbValidationOptions> {
  return {
    declared: {
      byteSize: bytes.byteLength,
      sha256: `sha256:${await sha256(bytes)}`,
      mimeType: STUDIO_BG3D_GLB_MIME_TYPE,
    },
    cumulative: { usedBytes: 0, maximumBytes: STUDIO_BG3D_GLB_MAX_BYTES },
    profile: "desktop",
    budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    supportedRequiredExtensions: [],
    ...overrides,
  };
}

async function validate(
  bytes: Uint8Array,
  overrides: Partial<StudioBg3dGlbValidationOptions> = {},
) {
  return validateStudioBg3dGlb(bytes, await optionsFor(bytes, overrides));
}

async function expectFailure(
  bytes: Uint8Array,
  code: StudioBg3dGlbFailureCode,
  overrides: Partial<StudioBg3dGlbValidationOptions> = {},
): Promise<void> {
  const result = await validate(bytes, overrides);
  expect(result).toMatchObject({ ok: false, code });
  expect(result.message).toMatch(/[가-힣]/u);
}

describe("validateStudioBg3dGlb valid self-contained files", () => {
  it("verifies real SHA-256 and reports conservative instantiated metrics", async () => {
    const bytes = validGlb();
    const result = await validate(bytes);

    expect(result).toMatchObject({
      ok: true,
      code: "valid",
      profile: "desktop",
      cumulativeBytesAfter: bytes.byteLength,
      metrics: {
        byteSize: bytes.byteLength,
        binByteSize: 32,
        nodes: 2,
        meshes: 1,
        meshPrimitives: 1,
        drawCalls: 2,
        triangles: 4,
        materials: 1,
        textures: 1,
        images: 1,
        imageBytes: 32,
        estimatedDecodedImageBytes: 24,
        maxImageDimension: 3,
        undeterminedImageDimensions: 0,
        lights: 2,
      },
    });
    expect(result.ok && result.verifiedSha256).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.metrics)).toBe(true);
  });

  it("accepts an offset Uint8Array view and an exact ArrayBuffer snapshot", async () => {
    const bytes = validGlb();
    const container = new Uint8Array(bytes.byteLength + 19);
    container.set(bytes, 7);
    const offsetView = container.subarray(7, 7 + bytes.byteLength);
    expect((await validate(offsetView)).ok).toBe(true);

    const arrayBuffer = Uint8Array.from(bytes).buffer;
    expect((await validateStudioBg3dGlb(arrayBuffer, await optionsFor(bytes))).ok).toBe(true);
  });

  it("returns canonical verified bytes that cannot be changed through the caller's source", async () => {
    const source = validGlb();
    const canonical = Uint8Array.from(source);
    const result = await validate(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verifiedBytes).not.toBe(source);
    expect(result.verifiedBytes.buffer).not.toBe(source.buffer);

    source.fill(0);

    expect(result.verifiedBytes).toEqual(canonical);
    expect(new DataView(result.verifiedBytes.buffer).getUint32(0, true)).toBe(0x46546c67);
  });

  it("counts triangle strips and GPU instancing conservatively", async () => {
    const bytes = validGlb({
      accessors: [{ count: 7 }, { count: 4 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 5 }] }],
      nodes: [
        {
          mesh: 0,
          extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 1 } } },
        },
      ],
      materials: [],
    });
    const result = await validate(bytes);

    expect(result).toMatchObject({
      ok: true,
      metrics: { nodes: 1, drawCalls: 4, triangles: 20, materials: 1 },
    });
  });

  it("reports an embedded image with an unrecognized header without trusting dimensions", async () => {
    const bytes = validGlb({}, new Uint8Array(32));
    const result = await validate(bytes);

    expect(result).toMatchObject({
      ok: true,
      metrics: {
        imageBytes: 32,
        estimatedDecodedImageBytes: 0,
        maxImageDimension: 0,
        undeterminedImageDimensions: 1,
      },
    });
  });
});

describe("validateStudioBg3dGlb metadata and integrity boundary", () => {
  it("rejects declared byte-size mismatch before invoking the digest", async () => {
    const bytes = validGlb();
    const digest = vi.fn(async () => new Uint8Array(32));
    const options = await optionsFor(bytes, {
      declared: { byteSize: bytes.byteLength + 1, sha256: "0".repeat(64) },
      digest,
    });
    const result = await validateStudioBg3dGlb(bytes, options);

    expect(result).toMatchObject({ ok: false, code: "byte-size-mismatch" });
    expect(digest).not.toHaveBeenCalled();
  });

  it("rejects files over the 100 MiB hard ceiling before copying or hashing", async () => {
    const bytes = new Uint8Array(STUDIO_BG3D_GLB_MAX_BYTES + 1);
    const digest = vi.fn(async () => new Uint8Array(32));
    const result = await validateStudioBg3dGlb(bytes, {
      declared: { byteSize: bytes.byteLength, sha256: "0".repeat(64) },
      cumulative: { usedBytes: 0, maximumBytes: bytes.byteLength },
      profile: "desktop",
      budgets: profiles({ complexity: { maxModelBytes: bytes.byteLength } }),
      digest,
    });

    expect(result).toMatchObject({ ok: false, code: "file-too-large" });
    expect(digest).not.toHaveBeenCalled();
  });

  it("enforces caller-selected cumulative and device model byte budgets", async () => {
    const bytes = validGlb();
    await expectFailure(bytes, "cumulative-byte-budget-exceeded", {
      cumulative: { usedBytes: 10, maximumBytes: bytes.byteLength + 9 },
    });
    await expectFailure(bytes, "model-byte-budget-exceeded", {
      budgets: profiles({ complexity: { maxModelBytes: bytes.byteLength - 1 } }),
    });
  });

  it("rejects a hash mismatch and sanitizes the message", async () => {
    const bytes = validGlb();
    const secretLikeValue = `https://example.invalid/private?token=${["sk", "redacted"].join("-")}`;
    const result = await validate(bytes, {
      declared: { byteSize: bytes.byteLength, sha256: "f".repeat(64) },
    });

    expect(result).toMatchObject({ ok: false, code: "hash-mismatch" });
    expect(result.message).not.toContain(secretLikeValue);
    expect(result.message).not.toMatch(/https?:|sk-/u);
  });

  it("returns stable failures for unavailable and malformed digest implementations", async () => {
    const bytes = validGlb();
    await expectFailure(bytes, "digest-failed", {
      digest: async () => {
        throw new Error("internal URL https://secret.invalid");
      },
    });
    await expectFailure(bytes, "digest-failed", { digest: async () => new Uint8Array(31) });
  });
});

describe("validateStudioBg3dGlb hostile and truncated containers", () => {
  it.each([
    ["truncated-header", new Uint8Array(19)],
    ["invalid-magic", (() => { const bytes = validGlb(); writeUint32(bytes, 0, 0); return bytes; })()],
    ["unsupported-version", (() => { const bytes = validGlb(); writeUint32(bytes, 4, 1); return bytes; })()],
    ["declared-length-mismatch", (() => { const bytes = validGlb(); writeUint32(bytes, 8, bytes.byteLength - 4); return bytes; })()],
    ["missing-json-chunk", (() => { const bytes = validGlb(); writeUint32(bytes, 16, BIN_CHUNK); return bytes; })()],
    ["invalid-chunk-alignment", (() => { const bytes = validGlb(); writeUint32(bytes, 12, 5); return bytes; })()],
    ["invalid-chunk-bounds", (() => { const bytes = validGlb(); writeUint32(bytes, 12, bytes.byteLength); return bytes; })()],
  ] as const)("returns %s without handing malformed bytes to a renderer", async (code, bytes) => {
    await expectFailure(bytes, code);
  });

  it("rejects duplicate and unknown chunks", async () => {
    const json = pad(new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" } })), 0x20);
    await expectFailure(
      assembleGlb([{ type: JSON_CHUNK, bytes: json }, { type: JSON_CHUNK, bytes: json }]),
      "duplicate-json-chunk",
    );
    await expectFailure(
      assembleGlb([{ type: JSON_CHUNK, bytes: json }, { type: 0x12345678, bytes: new Uint8Array(4) }]),
      "unsupported-chunk-type",
    );
  });

  it("bounds JSON before decoding or parsing", async () => {
    const largeJson = pad(
      new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, extra: "x".repeat(STUDIO_BG3D_GLB_MAX_JSON_BYTES) })),
      0x20,
    );
    const bytes = assembleGlb([{ type: JSON_CHUNK, bytes: largeJson }]);
    await expectFailure(bytes, "json-chunk-too-large", {
      declared: { byteSize: bytes.byteLength, sha256: "0".repeat(64) },
      digest: async () => new Uint8Array(32),
    });
  });

  it("rejects malformed JSON and non-object glTF roots", async () => {
    const malformed = assembleGlb([{ type: JSON_CHUNK, bytes: pad(new TextEncoder().encode("{"), 0x20) }]);
    const arrayRoot = assembleGlb([{ type: JSON_CHUNK, bytes: pad(new TextEncoder().encode("[]"), 0x20) }]);
    await expectFailure(malformed, "invalid-json");
    await expectFailure(arrayRoot, "invalid-gltf-root");
  });

  it.each(["2.evil", "2.1", "2", "20", 2, null])(
    "requires the exact glTF asset.version 2.0 contract: %j",
    async (version) => {
      const bytes = makeGlb({ asset: { version } });
      await expectFailure(bytes, "invalid-gltf-root");
    },
  );
});

describe("validateStudioBg3dGlb self-contained resource policy", () => {
  it.each([
    "scene.bin",
    "https://example.invalid/scene.bin?token=secret",
    "data:application/octet-stream;base64,AA==",
    "blob:https://example.invalid/private",
    "file:///Users/private/scene.bin",
  ])("rejects every external buffer URI without echoing it: %s", async (uri) => {
    const bytes = makeGlb({ asset: { version: "2.0" }, buffers: [{ byteLength: 1, uri }] });
    const result = await validate(bytes);

    expect(result).toMatchObject({ ok: false, code: "external-resource-uri" });
    expect(result.message).not.toContain(uri);
    expect(result.message).not.toMatch(/https?:|blob:|data:|file:/u);
  });

  it("rejects external image URIs and missing embedded BIN data", async () => {
    await expectFailure(
      makeGlb({ asset: { version: "2.0" }, images: [{ uri: "texture.png" }] }),
      "external-resource-uri",
    );
    await expectFailure(
      makeGlb({ asset: { version: "2.0" }, buffers: [{ byteLength: 32 }] }),
      "missing-bin-chunk",
    );
  });

  it("requires callers to explicitly allow renderer-supported required extensions", async () => {
    const bytes = validGlb({ extensionsRequired: ["KHR_draco_mesh_compression"] });
    await expectFailure(bytes, "unsupported-required-extension");
    expect((await validate(bytes, { supportedRequiredExtensions: ["KHR_draco_mesh_compression"] })).ok).toBe(true);
  });

  it("rejects out-of-bounds buffer views before reading image bytes", async () => {
    const bytes = validGlb({
      bufferViews: [{ buffer: 0, byteOffset: 16, byteLength: 32 }],
    });
    await expectFailure(bytes, "invalid-buffer-view");
  });
});

describe("validateStudioBg3dGlb commercial profile budgets", () => {
  it.each([
    ["node-budget-exceeded", profiles({ complexity: { maxNodes: 1 } })],
    ["triangle-budget-exceeded", profiles({ complexity: { maxTriangles: 3 } })],
    ["draw-call-budget-exceeded", profiles({ complexity: { maxDrawCalls: 1 } })],
    ["light-budget-exceeded", profiles({ complexity: { maxLights: 1 } })],
    ["texture-byte-budget-exceeded", profiles({ textures: { maxTotalBytes: 31 } })],
    ["texture-dimension-budget-exceeded", profiles({ textures: { maxDimension: 2 } })],
  ] as const)("enforces %s", async (code, budgets) => {
    await expectFailure(validGlb(), code, { budgets });
  });

  it("enforces material and texture count budgets", async () => {
    const materialHeavy = validGlb({
      materials: [{}, {}],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    });
    await expectFailure(materialHeavy, "material-budget-exceeded", {
      budgets: profiles({ complexity: { maxMaterials: 1 } }),
    });

    const textureHeavy = validGlb({ textures: [{ source: 0 }, { source: 0 }] });
    await expectFailure(textureHeavy, "texture-count-budget-exceeded", {
      budgets: profiles({ textures: { maxTextures: 1 } }),
    });
  });

  it("rejects a tiny compressed image that declares a decoded-memory bomb", async () => {
    const bytes = validGlb({}, pngHeader(10_000, 10_000));
    const result = await validate(bytes, {
      budgets: profiles({
        textures: {
          maxDimension: 20_000,
          maxTotalBytes: 100 * 1024 * 1024,
        },
      }),
    });

    expect(result).toMatchObject({ ok: false, code: "texture-byte-budget-exceeded" });
  });

  it("rejects decoded RGBA estimates that overflow safe integer arithmetic", async () => {
    const bytes = validGlb({}, pngHeader(0xffffffff, 0xffffffff));
    await expectFailure(bytes, "arithmetic-overflow", {
      budgets: profiles({
        textures: {
          maxDimension: Number.MAX_SAFE_INTEGER,
          maxTotalBytes: Number.MAX_SAFE_INTEGER,
        },
      }),
    });
  });

  it("uses the selected mobile profile rather than silently falling back to desktop", async () => {
    const bytes = validGlb();
    const budgets: StudioBg3dGlbBudgetProfiles = {
      mobile: {
        ...DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES.mobile,
        complexity: {
          ...DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES.mobile.complexity,
          maxDrawCalls: 1,
        },
      },
      desktop: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES.desktop,
    };
    await expectFailure(bytes, "draw-call-budget-exceeded", { profile: "mobile", budgets });
  });
});
