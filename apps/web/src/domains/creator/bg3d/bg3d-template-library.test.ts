import {
  IDBFactory,
  IDBObjectStore as FakeIDBObjectStore,
} from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";

const HASH_A = `sha256:${"a".repeat(64)}`;

function canonicalScene(options: {
  readonly commercialUse?: boolean;
  readonly includeShot?: boolean;
} = {}): StudioBg3dSceneDocument {
  const attachment = {
    id: "logical-attachment-a",
    name: "fixture.glb",
    mime: "model/gltf-binary" as const,
    byteSize: 128,
    hash: HASH_A,
    rights: {
      status: "owned" as const,
      commercialUse: options.commercialUse ?? false,
      attributionRequired: false,
    },
    source: "local-library" as const,
  };
  const candidate = {
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    attachments: [attachment],
    nodes: [
      {
        id: "template-parent",
        name: "Parent",
        kind: "primitive" as const,
        primitiveKind: "box" as const,
        color: "#abcdef",
        transform: {
          position: [0, 0, 0] as const,
          rotation: [0, 0, 0] as const,
          scale: [1, 1, 1] as const,
        },
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
        parentId: null,
      },
      {
        id: "template-model",
        name: "Model",
        kind: "model" as const,
        attachmentId: attachment.id,
        transform: {
          position: [1, 2, 3] as const,
          rotation: [0, 0, 0] as const,
          scale: [1, 1, 1] as const,
        },
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
        parentId: "template-parent",
      },
    ],
    ...(options.includeShot ? {
      shots: [{
        id: "shot-a",
        name: "Shot A",
        nodeVisibility: [{ nodeId: "template-model", visible: false }],
      }],
      activeShotId: "shot-a",
    } : {}),
  };
  const serialized = serializeStudioBg3dSceneDocument(candidate);
  const document = serialized ? parseStudioBg3dSceneDocument(serialized) : null;
  if (!document) throw new Error("Unable to build canonical BG3D template fixture.");
  return document;
}

async function loadLibrary(factory = new IDBFactory()) {
  vi.stubGlobal("indexedDB", factory);
  vi.resetModules();
  const module = await import("./bg3d-template-library");
  const library = {
    ...module,
    deleteBg3dTemplate: module.legacyDeleteBg3dTemplate,
    listBg3dTemplates: module.legacyListBg3dTemplates,
    saveBg3dTemplate: module.legacySaveBg3dTemplate,
  };
  return { factory, library };
}

async function openTemplateDatabase(
  factory: IDBFactory,
  databaseName: string,
  version: number,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putRawTemplate(
  database: IDBDatabase,
  raw: Record<string, unknown>,
): Promise<void> {
  const transaction = database.transaction("templates", "readwrite");
  transaction.objectStore("templates").put(raw);
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function getRawTemplate(database: IDBDatabase, id: string): Promise<unknown> {
  const transaction = database.transaction("templates", "readonly");
  const request = transaction.objectStore("templates").get(id);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createTemplateAuthorityHarness(now = 1_000) {
  let raw: string | null = null;
  const authority = {
    readManifest: vi.fn(async () => raw),
    readBlob: vi.fn(async () => {
      throw new Error("template manifests do not read blobs");
    }),
    mutate: vi.fn(async (_slot, _currentRefs, operation) => {
      const mutation = await operation({
        now,
        currentRaw: raw,
        putBlob: async () => {
          throw new Error("template manifests do not write blobs");
        },
        getBlob: async () => {
          throw new Error("template manifests do not read blobs");
        },
      });
      raw = mutation.nextRaw;
      return mutation.result;
    }),
  } as unknown as StudioBg3dLibrariesAuthority;
  return {
    authority,
    manifest: () => raw,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BG3D template library persistence", () => {
  it("stores canonical attachment identities without private modelId values and derives rights", async () => {
    const { factory, library } = await loadLibrary();
    const document = canonicalScene({ commercialUse: false });

    const entries = await library.saveBg3dTemplate({
      id: "template-a",
      name: "내 템플릿",
      createdAt: 100,
      document,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "template-a",
      commercialUse: false,
    });
    expect(entries[0]?.document.attachments[0]).toMatchObject({
      id: "logical-attachment-a",
      hash: HASH_A,
    });

    const database = await openTemplateDatabase(
      factory,
      library.BG3D_TEMPLATE_LIBRARY_DATABASE_NAME,
      library.BG3D_TEMPLATE_LIBRARY_DATABASE_VERSION,
    );
    const raw = await getRawTemplate(database, "template-a");
    expect(raw).toMatchObject({
      kind: "toonspectrum-studio-bg3d-template",
      version: 1,
      id: "template-a",
    });
    expect(JSON.stringify(raw)).not.toContain("modelId");
    expect(JSON.stringify(raw)).toContain("logical-attachment-a");
    expect(JSON.stringify(raw)).toContain(HASH_A);
    database.close();
  });

  it("returns save and delete snapshots only after their readwrite transaction completes", async () => {
    const { library } = await loadLibrary();
    const originalPut = FakeIDBObjectStore.prototype.put;
    let putRequestSucceeded!: () => void;
    const putSucceeded = new Promise<void>((resolve) => {
      putRequestSucceeded = resolve;
    });
    vi.spyOn(FakeIDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = originalPut.apply(this, args as Parameters<typeof originalPut>);
      request.addEventListener("success", () => putRequestSucceeded(), { once: true });
      return request;
    });

    let saveSettled = false;
    const save = library.saveBg3dTemplate({
      id: "template-atomic",
      name: "Atomic",
      createdAt: 200,
      document: canonicalScene({ commercialUse: true }),
    }).finally(() => {
      saveSettled = true;
    });
    await putSucceeded;
    expect(saveSettled).toBe(false);
    await expect(save).resolves.toHaveLength(1);

    vi.restoreAllMocks();
    const originalDelete = FakeIDBObjectStore.prototype.delete;
    let deleteRequestSucceeded!: () => void;
    const deleteSucceeded = new Promise<void>((resolve) => {
      deleteRequestSucceeded = resolve;
    });
    vi.spyOn(FakeIDBObjectStore.prototype, "delete").mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = originalDelete.apply(this, args as Parameters<typeof originalDelete>);
      request.addEventListener("success", () => deleteRequestSucceeded(), { once: true });
      return request;
    });
    let deleteSettled = false;
    const deletion = library.deleteBg3dTemplate("template-atomic").finally(() => {
      deleteSettled = true;
    });
    await deleteSucceeded;
    expect(deleteSettled).toBe(false);
    await expect(deletion).resolves.toEqual([]);
  });

  it("rejects an aborted write and leaves no partially saved row", async () => {
    const { library } = await loadLibrary();
    const originalPut = FakeIDBObjectStore.prototype.put;
    vi.spyOn(FakeIDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = originalPut.apply(this, args as Parameters<typeof originalPut>);
      this.transaction.abort();
      return request;
    });

    await expect(library.saveBg3dTemplate({
      id: "template-aborted",
      name: "Abort",
      createdAt: 300,
      document: canonicalScene(),
    })).rejects.toMatchObject({ code: "transaction-failed" });
    vi.restoreAllMocks();
    await expect(library.listBg3dTemplates()).resolves.toEqual([]);
  });

  it("excludes legacy, accessor-backed, and corrupt rows instead of promoting storage ids", async () => {
    const { factory, library } = await loadLibrary();
    await library.saveBg3dTemplate({
      id: "template-valid",
      name: "Valid",
      createdAt: 400,
      document: canonicalScene(),
    });
    const database = await openTemplateDatabase(
      factory,
      library.BG3D_TEMPLATE_LIBRARY_DATABASE_NAME,
      library.BG3D_TEMPLATE_LIBRARY_DATABASE_VERSION,
    );
    await putRawTemplate(database, {
      id: "legacy-template",
      name: "Legacy",
      createdAt: 500,
      template: {
        customModels: [{ id: "node", modelId: "private-indexeddb-id" }],
      },
      commercialUse: true,
    });
    const validJson = serializeStudioBg3dSceneDocument(canonicalScene()) ?? "";
    await putRawTemplate(database, {
      kind: "toonspectrum-studio-bg3d-template",
      version: 1,
      id: "corrupt-template",
      name: "Corrupt",
      createdAt: 600,
      sceneJson: ` ${validJson}`,
    });
    database.close();

    await expect(library.listBg3dTemplates()).resolves.toMatchObject([
      { id: "template-valid" },
    ]);
  });

  it("fails closed when opening the database is blocked", async () => {
    const request = {} as IDBOpenDBRequest;
    const blockedFactory = {
      open: vi.fn(() => {
        queueMicrotask(() => request.onblocked?.call(
          request,
          new Event("blocked") as IDBVersionChangeEvent,
        ));
        return request;
      }),
    } as unknown as IDBFactory;
    const { library } = await loadLibrary(blockedFactory);

    await expect(library.listBg3dTemplates()).rejects.toMatchObject({
      code: "storage-blocked",
    });
  });
});

describe("BG3D V12 legacy template migration", () => {
  it("imports validated IndexedDB templates once and never resurrects them after V12 deletion", async () => {
    const { library } = await loadLibrary();
    await library.legacySaveBg3dTemplate({
      id: "legacy-template-a",
      name: "Legacy A",
      createdAt: 700,
      document: canonicalScene({ commercialUse: true }),
    });
    const harness = createTemplateAuthorityHarness();

    const first = await library.loadBg3dTemplatesV12WithLegacyMigration({
      authority: harness.authority,
    });
    expect(first.legacyMigration).toEqual({ status: "completed", importedCount: 1 });
    expect(first.entries).toMatchObject([{ id: "legacy-template-a", name: "Legacy A" }]);
    expect(harness.manifest()).toContain(library.BG3D_TEMPLATE_LIBRARY_V12_MANIFEST_KIND);

    await library.deleteBg3dTemplateV12("legacy-template-a", { authority: harness.authority });
    await library.legacySaveBg3dTemplate({
      id: "legacy-template-b",
      name: "Legacy B",
      createdAt: 800,
      document: canonicalScene(),
    });
    const second = await library.loadBg3dTemplatesV12WithLegacyMigration({
      authority: harness.authority,
    });
    expect(second.legacyMigration).toEqual({
      status: "already-complete",
      importedCount: 0,
    });
    expect(second.entries).toEqual([]);
  });

  it("commits an empty manifest as the durable completion marker", async () => {
    const { library } = await loadLibrary();
    const harness = createTemplateAuthorityHarness();

    const first = await library.loadBg3dTemplatesV12WithLegacyMigration({
      authority: harness.authority,
    });
    expect(first.legacyMigration).toEqual({ status: "completed", importedCount: 0 });
    expect(first.entries).toEqual([]);
    expect(harness.manifest()).not.toBeNull();

    await library.legacySaveBg3dTemplate({
      id: "late-legacy-template",
      name: "Late legacy",
      createdAt: 900,
      document: canonicalScene(),
    });
    const second = await library.loadBg3dTemplatesV12WithLegacyMigration({
      authority: harness.authority,
    });
    expect(second.legacyMigration.status).toBe("already-complete");
    expect(second.entries).toEqual([]);
  });

  it("keeps V12 unmarked when the legacy database is blocked", async () => {
    const request = {} as IDBOpenDBRequest;
    const blockedFactory = {
      open: vi.fn(() => {
        queueMicrotask(() => request.onblocked?.call(
          request,
          new Event("blocked") as IDBVersionChangeEvent,
        ));
        return request;
      }),
    } as unknown as IDBFactory;
    const { library } = await loadLibrary(blockedFactory);
    const harness = createTemplateAuthorityHarness();

    await expect(library.loadBg3dTemplatesV12WithLegacyMigration({
      authority: harness.authority,
    })).rejects.toMatchObject({ code: "migration-failed" });
    expect(harness.manifest()).toBeNull();
  });

  it("maps V12 publication failures to an explicit migration error", async () => {
    const { library } = await loadLibrary();
    const authority = {
      readManifest: vi.fn(async () => null),
      readBlob: vi.fn(async () => {
        throw new Error("template manifests do not read blobs");
      }),
      mutate: vi.fn(async () => {
        throw new Error("sqlite publication failed");
      }),
    } as unknown as StudioBg3dLibrariesAuthority;

    await expect(library.loadBg3dTemplatesV12WithLegacyMigration({ authority }))
      .rejects.toMatchObject({
        code: "migration-failed",
        message: "기존 3D 템플릿을 SQLite/OPFS manifest에 최종 게시하지 못했습니다.",
      });
  });

  it("refuses partial migration when any legacy row is invalid", async () => {
    const { factory, library } = await loadLibrary();
    await library.legacySaveBg3dTemplate({
      id: "valid-before-invalid",
      name: "Valid before invalid",
      createdAt: 999,
      document: canonicalScene(),
    });
    const database = await openTemplateDatabase(
      factory,
      library.BG3D_TEMPLATE_LIBRARY_DATABASE_NAME,
      library.BG3D_TEMPLATE_LIBRARY_DATABASE_VERSION,
    );
    await putRawTemplate(database, {
      id: "unsupported-legacy-template",
      name: "Unsupported",
      createdAt: 1_000,
      template: { customModels: [{ modelId: "private-id" }] },
    });
    database.close();
    const harness = createTemplateAuthorityHarness();

    await expect(library.loadBg3dTemplatesV12WithLegacyMigration({
      authority: harness.authority,
    })).rejects.toMatchObject({ code: "migration-failed" });
    expect(harness.manifest()).toBeNull();
  });
});

describe("instantiateBg3dTemplateDocument", () => {
  it("issues collision-free node ids, remaps parents, preserves logical attachments, and omits shots", async () => {
    const { library } = await loadLibrary();
    const candidates = [
      "template-parent",
      "occupied-node",
      "fresh-parent",
      "fresh-parent",
      "fresh-model",
    ];
    const instantiated = library.instantiateBg3dTemplateDocument(
      canonicalScene({ includeShot: true }),
      new Set(["occupied-node"]),
      () => candidates.shift() ?? "never-used",
    );

    expect(instantiated).not.toBeNull();
    expect(instantiated?.document.nodes.map((node) => node.id)).toEqual([
      "fresh-parent",
      "fresh-model",
    ]);
    expect(instantiated?.document.nodes[1]?.parentId).toBe("fresh-parent");
    expect(instantiated?.document.attachments[0]).toMatchObject({
      id: "logical-attachment-a",
      hash: HASH_A,
    });
    expect(instantiated?.document.shots).toBeUndefined();
    expect(instantiated?.document.activeShotId).toBeUndefined();
    expect(serializeStudioBg3dSceneDocument(instantiated?.document)).not.toBeNull();
  });

  it("returns null after bounded repeated collisions", async () => {
    const { library } = await loadLibrary();
    expect(library.instantiateBg3dTemplateDocument(
      canonicalScene(),
      new Set(["occupied-node"]),
      () => "occupied-node",
    )).toBeNull();
  });
});
