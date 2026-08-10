import { afterEach, describe, expect, it, vi } from "vitest";

import { openStudioLocalDatabase } from "./studio-local-database";
import { createStudioOpfsMemoryFileSystem } from "./studio-opfs-filesystem";
import {
  createStudioVrmAssetSqliteOpfsRepository,
  STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
  STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
  STUDIO_VRM_TEXTURE_SQLITE_NAMESPACE,
  studioVrmAssetCommitPath,
  type SaveStudioVrmModelAssetInput,
  type StudioVrmAssetHash,
} from "./studio-vrm-asset-sqlite-opfs-repository";
import { createStudioVrmTexturePaintArtifact } from "./studio-vrm-texture-paint-artifact";
import {
  getStudioVrmTexturePaintLibraryArtifact,
  saveStudioVrmTexturePaintLibraryArtifact,
} from "./studio-vrm-texture-paint-library";
import {
  getStoredVrmModel,
  listVrmLibraryEntries,
  saveVerifiedVrmBlob,
} from "./vrm-library";

import type { StudioLocalDatabase } from "./studio-local-database";
import type { StudioOpfsFileSystem } from "./studio-opfs-filesystem";

const opened: StudioLocalDatabase[] = [];

async function memoryDatabase(): Promise<StudioLocalDatabase> {
  const database = await openStudioLocalDatabase({ vfs: "memory" });
  opened.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.close()));
  vi.restoreAllMocks();
});

function concat(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function makeVrmBytes(version: 0 | 1, nonce = "a"): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    extensions: version === 0 ? { VRM: {} } : { VRMC_vrm: { specVersion: "1.0" } },
    extras: { nonce },
  }));
  const paddedLength = Math.ceil(json.byteLength / 4) * 4;
  const bytes = new Uint8Array(20 + paddedLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  bytes.fill(0x20, 20 + json.byteLength);
  return bytes;
}

async function sha256(bytes: Uint8Array): Promise<StudioVrmAssetHash> {
  const owned = Uint8Array.from(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", owned.buffer));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function modelInput(
  id = "model-alpha",
  nonce = id,
  timestamp = 10,
): Promise<SaveStudioVrmModelAssetInput> {
  const bytes = makeVrmBytes(1, nonce);
  return {
    id,
    name: `Model ${id}`,
    bytes,
    expectedHash: await sha256(bytes),
    validationVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(12 + data.byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.byteLength, false);
  result.set(Uint8Array.from(type, (character) => character.charCodeAt(0)), 4);
  result.set(data, 8);
  view.setUint32(result.byteLength - 4, crc32(result.subarray(4, -4)), false);
  return result;
}

function png(width = 1, height = 1): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return concat(
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", Uint8Array.from([0x78, 0x9c, 0x63, 0x60, 0, 2, 0, 0, 5, 0, 1])),
    pngChunk("IEND", new Uint8Array()),
  );
}

async function repositoryFixture(options: {
  readonly fileSystem?: StudioOpfsFileSystem;
  readonly now?: () => number;
  readonly database?: StudioLocalDatabase;
} = {}) {
  const database = options.database ?? await memoryDatabase();
  const fileSystem = options.fileSystem ?? createStudioOpfsMemoryFileSystem();
  const repository = createStudioVrmAssetSqliteOpfsRepository({
    acquireDatabase: async () => database,
    fileSystem,
    ...(options.now ? { now: options.now } : {}),
  });
  return { database, fileSystem, repository };
}

describe("VRM asset SQLite/OPFS repository", () => {
  it("round-trips a VRM through real sqlite-wasm metadata and OPFS CAS bytes", async () => {
    const { database, fileSystem, repository } = await repositoryFixture();
    const input = await modelInput();

    await expect(repository.saveModel(input)).resolves.toMatchObject({
      deduplicated: false,
      metadata: {
        id: input.id,
        contentHash: input.expectedHash,
        byteSize: input.bytes.byteLength,
        hasThumbnail: false,
      },
    });
    const loaded = await repository.getModel(input.id);
    expect(loaded?.bytes).toEqual(input.bytes);
    expect(await repository.getModelByHash(input.expectedHash)).toMatchObject({ id: input.id });

    const raw = await database.kvGet(
      STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    );
    expect(raw).toContain(input.expectedHash);
    expect(raw).not.toContain("base64");
    expect(await fileSystem.list("blobs/")).toHaveLength(1);
    expect(await fileSystem.read(studioVrmAssetCommitPath(input.expectedHash))).not.toBeNull();
  });

  it("reopens the same SQLite manifest and OPFS root without legacy probing", async () => {
    const fixture = await repositoryFixture();
    const input = await modelInput("model-reopen");
    await fixture.repository.saveModel(input);
    await fixture.repository.close();
    await expect(fixture.repository.getModel(input.id)).rejects.toMatchObject({ code: "closed" });

    const reopened = createStudioVrmAssetSqliteOpfsRepository({
      acquireDatabase: async () => fixture.database,
      fileSystem: fixture.fileSystem,
    });
    await expect(reopened.getModel(input.id)).resolves.toMatchObject({
      id: input.id,
      contentHash: input.expectedHash,
      bytes: input.bytes,
    });
  });

  it("deduplicates exact model bytes without replacing the original display identity", async () => {
    const { repository } = await repositoryFixture();
    const first = await modelInput("model-first", "same");
    const duplicate = { ...await modelInput("model-second", "same"), name: "Other Name" };
    await repository.saveModel(first);

    await expect(repository.saveModel(duplicate)).resolves.toMatchObject({
      deduplicated: true,
      metadata: { id: first.id, name: first.name },
    });
    await expect(repository.listModelMetadata()).resolves.toHaveLength(1);
  });

  it("stores uploaded and bundled thumbnails as verified CAS blobs, not SQLite base64", async () => {
    const { database, repository } = await repositoryFixture();
    const input = await modelInput("model-thumb");
    await repository.saveModel(input);
    const thumbnail = {
      bytes: Uint8Array.from([1, 2, 3, 4]),
      mimeType: "image/png" as const,
    };
    await repository.saveThumbnail(input.id, thumbnail, 20);
    await repository.saveThumbnail("sample-vrm", thumbnail, 21);

    await expect(repository.getThumbnail(input.id)).resolves.toEqual(thumbnail);
    await expect(repository.getThumbnail("sample-vrm")).resolves.toEqual(thumbnail);
    const raw = await database.kvGet(
      STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    );
    expect(raw).not.toContain("AQIDBA");
  });

  it("round-trips a verified texture receipt while PNG bytes remain in OPFS", async () => {
    const { database, repository } = await repositoryFixture();
    const artifact = await createStudioVrmTexturePaintArtifact({
      bindingKey: "material:0/baseColor",
      source: png(2, 3),
      expectedWidth: 2,
      expectedHeight: 3,
    });
    const bytes = new Uint8Array(await artifact.archiveEntry.data.arrayBuffer());

    await expect(repository.saveTexture({ receipt: artifact.metadata, bytes })).resolves
      .toMatchObject({ receipt: artifact.metadata, deduplicated: false });
    await expect(repository.getTexture(artifact.metadata.contentHash)).resolves.toEqual({
      receipt: artifact.metadata,
      bytes,
    });
    const raw = await database.kvGet(
      STUDIO_VRM_TEXTURE_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    );
    expect(raw).toContain(artifact.metadata.contentHash);
    expect(raw).not.toContain("iVBOR");
  });

  it("drives both public product library facades without touching an available legacy IDB", async () => {
    const { repository } = await repositoryFixture();
    const indexedDbOpen = vi.fn(() => {
      throw new Error("legacy IndexedDB must not open");
    });
    vi.stubGlobal("indexedDB", { open: indexedDbOpen });
    const modelBytes = makeVrmBytes(1, "facade");
    const modelBlob = new Blob([modelBytes.buffer], { type: "model/gltf-binary" });
    const saved = await saveVerifiedVrmBlob(
      { name: "Facade.vrm", blob: modelBlob },
      { repository },
    );
    await expect(getStoredVrmModel(saved.id, { repository })).resolves.toMatchObject({
      id: saved.id,
      contentHash: saved.contentHash,
    });
    await expect(listVrmLibraryEntries({ repository })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({
        id: saved.id,
        source: "sqlite-opfs",
      })]),
    );

    const artifact = await createStudioVrmTexturePaintArtifact({
      bindingKey: "material:facade/baseColor",
      source: png(),
    });
    await saveStudioVrmTexturePaintLibraryArtifact(artifact, { repository });
    await expect(getStudioVrmTexturePaintLibraryArtifact(
      artifact.metadata.contentHash,
      { repository },
    )).resolves.toMatchObject({ metadata: artifact.metadata });
    expect(indexedDbOpen).not.toHaveBeenCalled();
  });

  it("rejects a blob whose bytes no longer match its content-addressed hash", async () => {
    const { fileSystem, repository } = await repositoryFixture();
    const input = await modelInput("model-corrupt");
    await repository.saveModel(input);
    const [blobPath] = await fileSystem.list("blobs/");
    if (!blobPath) throw new Error("missing blob path");
    await fileSystem.write(blobPath, Uint8Array.from(input.bytes, (byte) => byte ^ 0xff));

    await expect(repository.getModel(input.id)).rejects.toMatchObject({ code: "corrupt" });
  });

  it("rejects corrupt and noncanonical commit markers", async () => {
    const { fileSystem, repository } = await repositoryFixture();
    const input = await modelInput("model-marker");
    await repository.saveModel(input);
    await fileSystem.write(
      studioVrmAssetCommitPath(input.expectedHash),
      new TextEncoder().encode('{"version":2}'),
    );
    await expect(repository.getModel(input.id)).rejects.toMatchObject({ code: "corrupt" });
  });

  it("does not publish a SQLite manifest when the OPFS commit-marker write tears", async () => {
    const database = await memoryDatabase();
    const fileSystem = createStudioOpfsMemoryFileSystem({ failWriteAfter: 3 });
    const repository = createStudioVrmAssetSqliteOpfsRepository({
      acquireDatabase: async () => database,
      fileSystem,
      orphanGraceMs: 0,
    });
    const input = await modelInput("model-torn-marker");

    await expect(repository.saveModel(input)).rejects.toBeTruthy();
    await expect(database.kvGet(
      STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    )).resolves.toBeNull();
    expect(await fileSystem.list("blobs/")).toHaveLength(1);

    fileSystem.restart();
    const cleanupRepository = createStudioVrmAssetSqliteOpfsRepository({
      acquireDatabase: async () => database,
      fileSystem,
      orphanGraceMs: 0,
    });
    await expect(cleanupRepository.cleanupOrphans({ maxRemovals: 1, graceMs: 0 }))
      .resolves.toMatchObject({ removedAssets: 1 });
    expect(await fileSystem.list("blobs/")).toEqual([]);
  });

  it("leaves a recoverable orphan when SQLite fails after blob and marker commit", async () => {
    const database = await memoryDatabase();
    const fileSystem = createStudioOpfsMemoryFileSystem();
    const failingDatabase = new Proxy(database, {
      get(target, property, receiver) {
        if (property === "kvSet") return () => Promise.reject(new Error("SQLITE_FULL"));
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const repository = createStudioVrmAssetSqliteOpfsRepository({
      acquireDatabase: async () => failingDatabase,
      fileSystem,
      orphanGraceMs: 0,
    });
    const input = await modelInput("model-sql-fail");

    await expect(repository.saveModel(input)).rejects.toBeTruthy();
    expect(await fileSystem.read(studioVrmAssetCommitPath(input.expectedHash))).not.toBeNull();
    await expect(database.kvGet(
      STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    )).resolves.toBeNull();
  });

  it("rejects corrupt, future, unknown-field, and noncanonical SQLite manifests", async () => {
    const { database, repository } = await repositoryFixture();
    const invalidRows = [
      "{",
      JSON.stringify({
        kind: "toonspectrum.studio-vrm-model-asset-manifest",
        version: 2,
        generation: 0,
        models: [],
        sampleThumbnails: [],
      }),
      JSON.stringify({
        kind: "toonspectrum.studio-vrm-model-asset-manifest",
        version: 1,
        generation: 0,
        models: [],
        sampleThumbnails: [],
        renderer: { scene: "forbidden" },
      }),
      JSON.stringify({
        version: 1,
        kind: "toonspectrum.studio-vrm-model-asset-manifest",
        generation: 0,
        models: [],
        sampleThumbnails: [],
      }, null, 2),
    ];
    for (const row of invalidRows) {
      await database.kvSet(
        STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
        STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
        row,
      );
      await expect(repository.listModelMetadata()).rejects.toMatchObject({ code: "corrupt" });
    }
  });

  it("serializes concurrent repository instances and preserves both manifest generations", async () => {
    const database = await memoryDatabase();
    const fileSystem = createStudioOpfsMemoryFileSystem();
    const first = createStudioVrmAssetSqliteOpfsRepository({
      acquireDatabase: async () => database,
      fileSystem,
    });
    const second = createStudioVrmAssetSqliteOpfsRepository({
      acquireDatabase: async () => database,
      fileSystem,
    });
    const [firstInput, secondInput] = await Promise.all([
      modelInput("race-first"),
      modelInput("race-second"),
    ]);

    await Promise.all([first.saveModel(firstInput), second.saveModel(secondInput)]);
    await expect(first.listModelMetadata()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "race-first" }),
      expect.objectContaining({ id: "race-second" }),
    ]));
    const raw = await database.kvGet(
      STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    );
    expect(JSON.parse(raw ?? "null")).toMatchObject({ generation: 2 });
  });

  it("bounds orphan collection instead of deleting an unbounded library in one pass", async () => {
    const { fileSystem, repository } = await repositoryFixture({ now: () => 1_000 });
    const first = await modelInput("orphan-first", "one");
    const second = await modelInput("orphan-second", "two");
    await repository.saveModel(first);
    await repository.saveModel(second);
    await repository.deleteModel(first.id);
    await repository.deleteModel(second.id);

    await expect(repository.cleanupOrphans({ maxRemovals: 1, graceMs: 0 }))
      .resolves.toMatchObject({ removedAssets: 1 });
    expect(await fileSystem.list("blobs/")).toHaveLength(1);
    await expect(repository.cleanupOrphans({ maxRemovals: 1, graceMs: 0 }))
      .resolves.toMatchObject({ removedAssets: 1 });
    expect(await fileSystem.list("blobs/")).toEqual([]);
  });

  it("fails closed when shared SQLite or native OPFS is unavailable", async () => {
    const repository = createStudioVrmAssetSqliteOpfsRepository({
      acquireDatabase: () => Promise.reject(new Error("OPFS unavailable")),
      fileSystem: createStudioOpfsMemoryFileSystem(),
    });
    await expect(repository.listModelMetadata()).rejects.toMatchObject({
      code: "unavailable",
      message: expect.stringContaining("현재 탭 메모리 임시"),
    });
  });
});
