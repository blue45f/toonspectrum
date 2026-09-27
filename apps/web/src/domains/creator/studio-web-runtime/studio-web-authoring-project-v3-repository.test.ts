import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioScene3dDocument } from "../scene3d/studio-scene3d-document";
import {
  createStudioWebAuthoringProjectV3,
  serializeStudioWebAuthoringProjectV3,
} from "./studio-web-authoring-project-v3";
import {
  STUDIO_WEB_AUTHORING_PROJECT_V3_SQLITE_NAMESPACE,
  StudioWebAuthoringProjectV3Repository,
  type StudioWebAuthoringProjectLockProvider,
} from "./studio-web-authoring-project-v3-repository";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

function project(revision = 1) {
  return createStudioWebAuthoringProjectV3({
    projectId: "project:repository",
    title: "Browser 3D project",
    scene: {
      ...createStudioScene3dDocument(
        "project:repository",
        "2026-09-24T00:00:00.000Z",
      ),
      revision,
    },
    revision,
    now: "2026-09-24T00:00:00.000Z",
  });
}

function memoryStore() {
  const rows = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => { rows.set(key, value); },
    delete: async (key) => { rows.delete(key); },
  };
  return { rows, store, lockProvider: testLocks() };
}

function testLocks() {
  const tails = new Map<string, Promise<unknown>>();
  const requests: string[] = [];
  const provider: StudioWebAuthoringProjectLockProvider = {
    request: (name, options, operation) => {
      requests.push(name);
      const run = async () => {
        options.signal?.throwIfAborted();
        return operation();
      };
      const result = (tails.get(name) ?? Promise.resolve()).then(run, run);
      tails.set(name, result);
      return result;
    },
  };
  return { ...provider, requests };
}

describe("Studio web authoring project V3 repository", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("persists and reopens a browser-first project without a native host", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => memory.store,
      lockProvider: memory.lockProvider,
    });

    expect((await repository.save(project())).status).toBe("saved");
    expect((await repository.save(project())).status).toBe("unchanged");
    const restored = await repository.load("project:repository");
    expect(restored).toEqual(project());
    expect(restored?.runtime).toMatchObject({
      primaryEnvironment: "browser",
      browserRequired: true,
      nativeRequired: false,
    });
  });

  it("protects durable state from stale and regressing writes", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => memory.store,
      lockProvider: memory.lockProvider,
    });
    await repository.save(project(3));

    await expect(repository.save(project(4), { expectedStoredRevision: 2 }))
      .rejects.toMatchObject({
        code: "revision-conflict",
      });
    await expect(repository.save(project(2)))
      .rejects.toMatchObject({
        code: "revision-regression",
      });
    expect((await repository.load("project:repository"))?.revision).toBe(3);
  });

  it("serializes overlapping saves per project", async () => {
    const memory = memoryStore();
    const gate = Promise.withResolvers<void>();
    let first = true;
    const store: StudioAsyncKeyValueStore = {
      ...memory.store,
      set: async (key, value) => {
        if (first) {
          first = false;
          await gate.promise;
        }
        memory.rows.set(key, value);
      },
    };
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => store,
      lockProvider: memory.lockProvider,
    });

    const one = repository.save(project(1));
    const two = repository.save(project(2));
    gate.resolve();
    await Promise.all([one, two]);
    expect((await repository.load("project:repository"))?.revision).toBe(2);
  });

  it("같은 revision의 다른 내용으로 저장된 원본을 덮어쓰지 않는다", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => memory.store, lockProvider: memory.lockProvider });
    const original = project(3);
    await repository.save(original);

    await expect(repository.save({ ...original, title: "경합한 수정" }, { expectedStoredRevision: 3 }))
      .rejects.toMatchObject({ code: "revision-conflict" });
    expect(await repository.load(original.projectId)).toEqual(original);
  });

  it("저장된 ID가 다르면 원본 바이트를 보존하고 저장을 거부한다", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => memory.store, lockProvider: memory.lockProvider });
    const other = createStudioWebAuthoringProjectV3({
      ...project(),
      projectId: "project:other",
      scene: createStudioScene3dDocument("project:other", "2026-09-24T00:00:00.000Z"),
    });
    const originalRaw = serializeStudioWebAuthoringProjectV3(other);
    memory.rows.set("project:repository", originalRaw);

    await expect(repository.save(project(2))).rejects.toMatchObject({ code: "identity-mismatch" });
    expect(memory.rows.get("project:repository")).toBe(originalRaw);
  });

  it("큐 대기 중 입력이 바뀌어도 요청 시점 ID와 revision으로 저장한다", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => memory.store, lockProvider: memory.lockProvider });
    const pendingProject = { ...project(1) };
    const pending = repository.save(pendingProject);
    pendingProject.projectId = "project:changed";
    pendingProject.revision = 9;

    expect(await pending).toMatchObject({ projectId: "project:repository", revision: 1 });
    expect(await repository.load("project:repository")).toEqual(project(1));
    expect(memory.rows.has("project:changed")).toBe(false);
  });

  it("쓰기 실패와 읽기 실패 후 원본을 유지하고 명시적 재시도를 허용한다", async () => {
    const memory = memoryStore();
    let failWrite = false;
    let failRead = false;
    const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => ({
      ...memory.store,
      get: async (key) => {
        if (failRead) throw new Error("읽기 실패");
        return memory.store.get(key);
      },
      set: async (key, value) => {
        if (failWrite) throw new Error("쓰기 실패");
        await memory.store.set(key, value);
      },
    }), lockProvider: memory.lockProvider });
    await repository.save(project(1));
    const originalRaw = memory.rows.get("project:repository");
    failWrite = true;
    await expect(repository.save(project(2))).rejects.toThrow("쓰기 실패");
    expect(memory.rows.get("project:repository")).toBe(originalRaw);
    failRead = true;
    await expect(repository.load("project:repository")).rejects.toThrow("읽기 실패");
    expect(memory.rows.get("project:repository")).toBe(originalRaw);
    failWrite = false;
    failRead = false;
    await repository.save(project(2), { expectedStoredRevision: 1 });
    expect(await repository.load("project:repository")).toEqual(project(2));
  });

  it("손상된 저장 내용은 비어 있는 프로젝트로 취급하거나 덮어쓰지 않는다", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => memory.store, lockProvider: memory.lockProvider });
    memory.rows.set("project:repository", "");
    await expect(repository.load("project:repository")).rejects.toThrow();
    await expect(repository.save(project(2))).rejects.toThrow();
    expect(memory.rows.get("project:repository")).toBe("");
  });

  it("다른 저장소 instance의 읽기-검사-쓰기를 동일 문서 Web Lock 안에서 실행한다", async () => {
    const memory = memoryStore();
    vi.stubGlobal("navigator", { locks: memory.lockProvider });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    memory.rows.set("project:repository", serializeStudioWebAuthoringProjectV3(project(1)));
    const get = vi.fn(memory.store.get);
    const first = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => ({
      ...memory.store,
      get,
      set: async (key, value) => {
        entered.resolve();
        await release.promise;
        await memory.store.set(key, value);
      },
    }) });
    const second = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => ({ ...memory.store, get }) });
    const saved = first.save(project(2), { expectedStoredRevision: 1 });
    await entered.promise;
    const conflict = expect(second.save({ ...project(2), title: "다른 탭 수정" }, { expectedStoredRevision: 1 }))
      .rejects.toMatchObject({ code: "revision-conflict" });
    await vi.waitFor(() => expect(memory.lockProvider.requests).toHaveLength(2));
    expect(get).toHaveBeenCalledTimes(1);
    release.resolve();
    await saved;
    await conflict;
    expect(await second.load("project:repository")).toEqual(project(2));
    expect(new Set(memory.lockProvider.requests)).toEqual(new Set([
      `${STUDIO_WEB_AUTHORING_PROJECT_V3_SQLITE_NAMESPACE}:project:repository`,
    ]));
  });

  it("최초 저장의 absent 조건과 같은 바이트의 stale 조건도 CAS 충돌로 알린다", async () => {
    const memory = memoryStore();
    const options = { storeFactory: async () => memory.store, lockProvider: memory.lockProvider };
    const first = new StudioWebAuthoringProjectV3Repository(options);
    const second = new StudioWebAuthoringProjectV3Repository(options);
    const outcomes = await Promise.allSettled([
      first.save(project(1), { expectedStoredRevision: null }),
      second.save(project(2), { expectedStoredRevision: null }),
    ]);
    expect(outcomes[0]).toMatchObject({ status: "fulfilled", value: { status: "saved" } });
    expect(outcomes[1]).toMatchObject({ status: "rejected", reason: { code: "revision-conflict" } });
    await expect(second.save(project(1), { expectedStoredRevision: null }))
      .rejects.toMatchObject({ code: "revision-conflict" });
    await expect(second.save(project(1), { expectedStoredRevision: 0 }))
      .rejects.toMatchObject({ code: "revision-conflict" });
    await expect(second.save(project(1), { expectedStoredRevision: 1 }))
      .resolves.toMatchObject({ status: "unchanged" });
  });

  it("Web Locks 미지원 환경은 읽기만 허용하고 원자적 저장 성공을 주장하지 않는다", async () => {
    const memory = memoryStore();
    memory.rows.set("project:repository", serializeStudioWebAuthoringProjectV3(project(1)));
    vi.stubGlobal("navigator", {});
    const storeFactory = vi.fn(async () => memory.store);
    const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory });
    expect(repository.supportsAtomicWrites).toBe(false);
    await expect(repository.save(project(2))).rejects.toMatchObject({ code: "atomic-lock-unavailable" });
    await expect(repository.remove("project:repository")).rejects.toMatchObject({ code: "atomic-lock-unavailable" });
    expect(storeFactory).not.toHaveBeenCalled();
    expect(await repository.load("project:repository")).toEqual(project(1));
  });

  it.each(["", " space", "wrong id", "x".repeat(257)])("잘못된 ID %s는 저장소에 전달하지 않는다", async (id) => {
    const memory = memoryStore();
    const storeFactory = vi.fn(async () => memory.store);
    const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory, lockProvider: memory.lockProvider });
    await expect(repository.load(id)).rejects.toMatchObject({ code: "invalid-id" });
    await expect(repository.remove(id)).rejects.toMatchObject({ code: "invalid-id" });
    await expect(repository.save({ ...project(1), projectId: id })).rejects.toMatchObject({ code: "invalid-id" });
    expect(storeFactory).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, Infinity])("잘못된 예상 revision %s를 거부한다", async (revision) => {
    const memory = memoryStore();
    const storeFactory = vi.fn(async () => memory.store);
    const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory, lockProvider: memory.lockProvider });
    await expect(repository.save(project(1), { expectedStoredRevision: revision }))
      .rejects.toMatchObject({ code: "invalid-revision" });
    await expect(repository.remove("project:repository", { expectedStoredRevision: revision }))
      .rejects.toMatchObject({ code: "invalid-revision" });
    expect(storeFactory).not.toHaveBeenCalled();
  });

  it("잠금을 기다리다 취소한 쓰기는 원본을 변경하지 않고 다음 요청을 허용한다", async () => {
    const memory = memoryStore();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const first = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => ({ ...memory.store, set: async (key, value) => {
        entered.resolve();
        await release.promise;
        await memory.store.set(key, value);
      } }),
      lockProvider: memory.lockProvider,
    });
    const second = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => memory.store,
      lockProvider: memory.lockProvider,
    });
    const controller = new AbortController();
    const saved = first.save(project(1));
    await entered.promise;
    const cancelled = expect(second.save(project(2), { expectedStoredRevision: 1, signal: controller.signal }))
      .rejects.toMatchObject({ code: "cancelled" });
    controller.abort();
    release.resolve();
    await saved;
    await cancelled;
    expect(await second.load("project:repository")).toEqual(project(1));
    await second.save(project(2), { expectedStoredRevision: 1 });
    expect(await second.load("project:repository")).toEqual(project(2));
  });

  it("읽기 완료 직전 취소를 저장/복원 결과로 전달하지 않는다", async () => {
    const memory = memoryStore();
    let controller = new AbortController();
    const set = vi.fn(memory.store.set);
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => ({ ...memory.store, set, get: async () => {
        controller.abort();
        return serializeStudioWebAuthoringProjectV3(project(1));
      } }),
      lockProvider: memory.lockProvider,
    });
    await expect(repository.save(project(2), { signal: controller.signal }))
      .rejects.toMatchObject({ code: "cancelled" });
    expect(set).not.toHaveBeenCalled();
    controller = new AbortController();
    await expect(repository.load("project:repository", { signal: controller.signal }))
      .rejects.toMatchObject({ code: "cancelled" });
  });

  it("쓰기 진행 중 취소는 저장 완료로 숨기지 않고 재조회가 필요한 결과로 알린다", async () => {
    const memory = memoryStore();
    const controller = new AbortController();
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => ({ ...memory.store, set: async (key, value) => {
        await memory.store.set(key, value);
        controller.abort();
      } }),
      lockProvider: memory.lockProvider,
    });
    await expect(repository.save(project(1), { signal: controller.signal }))
      .rejects.toMatchObject({ code: "cancelled-after-write" });
    expect(await repository.load("project:repository")).toEqual(project(1));
  });

  it("삭제도 같은 문서 잠금과 revision 검사를 사용하고 손상 원본을 보존한다", async () => {
    const memory = memoryStore();
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => memory.store,
      lockProvider: memory.lockProvider,
    });
    await repository.save(project(2));
    await expect(repository.remove("project:repository", { expectedStoredRevision: 1 }))
      .rejects.toMatchObject({ code: "revision-conflict" });
    expect(await repository.load("project:repository")).toEqual(project(2));
    await repository.remove("project:repository", { expectedStoredRevision: 2 });
    expect(await repository.load("project:repository")).toBeNull();
    memory.rows.set("project:repository", "");
    await expect(repository.remove("project:repository")).rejects.toThrow();
    expect(memory.rows.get("project:repository")).toBe("");
  });
});
