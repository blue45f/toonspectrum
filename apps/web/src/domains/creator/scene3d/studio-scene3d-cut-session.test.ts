import { describe, expect, it, vi } from "vitest";

import { createStudioScene3dDocument } from "./studio-scene3d-document";
import { StudioScene3dCutSession, type StudioScene3dCutHost } from "./studio-scene3d-cut-session";
import {
  approveStudioScene3dVersionedCut,
  createStudioScene3dVersionedCut,
  parseStudioScene3dCutSource,
  type StudioScene3dCutSource,
} from "./studio-scene3d-shot-versions";
import {
  createStudioWebAuthoringProjectV3,
  parseStudioWebAuthoringProjectV3,
  serializeStudioWebAuthoringProjectV3,
} from "../studio-web-runtime/studio-web-authoring-project-v3";
import {
  StudioWebAuthoringProjectV3Repository,
  type StudioWebAuthoringProjectLockProvider,
  type StudioWebAuthoringProjectSaveReceipt,
} from "../studio-web-runtime/studio-web-authoring-project-v3-repository";

const PROJECT_ID = "project:cut-session";

function source(revision = 1, projectId = PROJECT_ID): StudioScene3dCutSource {
  return parseStudioScene3dCutSource({
    scene: { ...createStudioScene3dDocument(projectId, "2026-09-27T00:00:00.000Z"), revision },
    characters: {},
  });
}

function savedProject(revision = 1, projectId = PROJECT_ID) {
  return createStudioWebAuthoringProjectV3({
    projectId, title: "컷 세션 테스트", ...source(revision, projectId), revision,
    now: "2026-09-27T00:00:00.000Z",
  });
}

function fixture() {
  const rows = new Map<string, string>();
  const tails = new Map<string, Promise<unknown>>();
  const lockProvider: StudioWebAuthoringProjectLockProvider = {
    request: (name, options, operation) => {
      const run = async () => { options.signal?.throwIfAborted(); return operation(); };
      const pending = (tails.get(name) ?? Promise.resolve()).then(run, run);
      tails.set(name, pending);
      return pending;
    },
  };
  const store = {
    get: vi.fn(async (key: string) => rows.get(key) ?? null),
    set: vi.fn(async (key: string, raw: string) => { rows.set(key, raw); }),
    delete: vi.fn(async (key: string) => { rows.delete(key); }),
  };
  const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => store, lockProvider });
  let liveSource = source();
  let blocked: string | null = null;
  const applySource = vi.fn<StudioScene3dCutHost["applySource"]>(async (next, _cut, signal) => {
    if (!signal.aborted) liveSource = next;
  });
  const host: StudioScene3dCutHost = {
    projectId: PROJECT_ID,
    readSource: () => liveSource,
    blockedReason: () => blocked,
    applySource,
  };
  return {
    rows, store, repository, host, applySource,
    session: new StudioScene3dCutSession(host, repository),
    setSource: (next: StudioScene3dCutSource) => { liveSource = next; },
    setBlocked: (reason: string | null) => { blocked = reason; },
  };
}

describe("실제 V3 저장소를 사용하는 컷 세션의 비동기 안전성", () => {
  it("복원 전과 지연 복원 중에는 컷 변경과 저장을 허용하지 않는다", async () => {
    const { session, repository, store } = fixture();
    const pending = Promise.withResolvers<null>();
    vi.spyOn(repository, "load").mockImplementationOnce(() => pending.promise);
    expect(() => session.capture("첫 컷")).toThrow(/복원/);
    await expect(session.save()).rejects.toThrow(/복원/);
    const restore = session.restore();
    expect(session.read().phase).toBe("loading");
    expect(() => session.capture("첫 컷")).toThrow(/복원/);
    await expect(session.save()).rejects.toThrow(/복원/);
    expect(store.set).not.toHaveBeenCalled();
    pending.resolve(null);
    await restore;
    session.capture("첫 컷");
    await session.save();
    expect(session.read()).toMatchObject({ phase: "ready", dirty: false });
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  it("취소된 이전 복원이 늦게 완료되어도 새 세션 원본과 선택을 바꾸지 않는다", async () => {
    const { session, repository, applySource } = fixture();
    const stale = Promise.withResolvers<ReturnType<typeof savedProject>>();
    vi.spyOn(repository, "load").mockImplementationOnce(() => stale.promise);
    const restore = session.restore();
    session.cancel();
    expect(session.read().phase).toBe("error");
    await session.restore();
    session.capture("새로 만든 컷");
    const current = session.read();
    stale.resolve(savedProject(9));
    await restore;
    expect(session.read()).toBe(current);
    expect(applySource).not.toHaveBeenCalled();
  });

  it("dispose 뒤 도착한 복원은 호스트나 구독자에게 전달하지 않는다", async () => {
    const { session, repository, applySource } = fixture();
    const delayed = Promise.withResolvers<ReturnType<typeof savedProject>>();
    vi.spyOn(repository, "load").mockImplementationOnce(() => delayed.promise);
    const listener = vi.fn();
    session.subscribe(listener);
    const restore = session.restore();
    session.dispose();
    const snapshot = session.read();
    const published = listener.mock.calls.length;
    delayed.resolve(savedProject(4));
    await restore;
    expect(session.read()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(published);
    expect(applySource).not.toHaveBeenCalled();
  });

  it("저장 원본의 호스트 적용이 끝나기 전에는 컷을 생성하지 않고 취소 signal을 전달한다", async () => {
    const { session, rows, applySource } = fixture();
    rows.set(PROJECT_ID, serializeStudioWebAuthoringProjectV3(savedProject(2)));
    const applied = Promise.withResolvers<void>();
    applySource.mockImplementationOnce(() => applied.promise);
    const restore = session.restore();
    await vi.waitFor(() => expect(applySource).toHaveBeenCalledTimes(1));
    expect(() => session.capture("성급한 컷")).toThrow(/복원/);
    session.cancel();
    expect(applySource.mock.calls[0]?.[2].aborted).toBe(true);
    applied.resolve();
    await restore;
    expect(session.read()).toMatchObject({ phase: "error", project: null });
  });

  it("손상된 복원은 쓰기 경로를 잠그고 명시적 재시도로만 준비 상태가 된다", async () => {
    const { session, rows, store } = fixture();
    rows.set(PROJECT_ID, "손상된 백업");
    await session.restore();
    expect(session.read().phase).toBe("error");
    expect(() => session.capture("새 컷")).toThrow(/복원/);
    await expect(session.save()).rejects.toThrow(/복원/);
    expect(store.set).not.toHaveBeenCalled();
    rows.set(PROJECT_ID, serializeStudioWebAuthoringProjectV3(savedProject(3)));
    await session.restore();
    expect(session.read()).toMatchObject({ phase: "ready", project: { revision: 3 }, dirty: false });
  });

  it("저장 실패는 dirty와 컷을 보존하고 같은 저장 revision으로 재시도한다", async () => {
    const { session, repository, store } = fixture();
    await session.restore();
    session.capture("보존할 컷");
    const before = session.read().project?.shotVersions;
    const save = vi.spyOn(repository, "save");
    store.set.mockRejectedValueOnce(new Error("로컬 저장 실패"));
    await session.save();
    expect(session.read()).toMatchObject({ phase: "error", dirty: true, notice: "로컬 저장 실패" });
    expect(session.read().project?.shotVersions).toEqual(before);
    await session.save();
    expect(save.mock.calls.map((call) => call[1]?.expectedStoredRevision)).toEqual([null, null]);
    expect(session.read()).toMatchObject({ phase: "ready", dirty: false });
    expect((await repository.load(PROJECT_ID))?.shotVersions).toEqual(before);
  });

  it("다른 프로젝트 JSON과 손상 JSON은 호스트·컷·승인 상태를 변경하지 않는다", async () => {
    const { session, applySource } = fixture();
    await session.restore();
    session.capture("승인 컷");
    const id = session.read().selectedId;
    if (!id) throw new Error("컷 ID 없음");
    session.approve(id);
    const before = session.backup();
    await expect(session.importJson(serializeStudioWebAuthoringProjectV3(savedProject(1, "project:other"))))
      .rejects.toThrow(/다른 프로젝트/);
    await expect(session.importJson("{invalid")).rejects.toThrow();
    expect(session.backup()).toBe(before);
    expect(applySource).not.toHaveBeenCalled();
  });

  it("JSON 가져오기의 호스트 실패와 취소는 이전 컷을 보존하며 재시도가 가능하다", async () => {
    const { session, applySource } = fixture();
    await session.restore();
    session.capture("기존 컷");
    const before = session.read().project;
    const raw = serializeStudioWebAuthoringProjectV3(savedProject(5));
    applySource.mockRejectedValueOnce(new Error("뷰포트 잠금 실패"));
    await session.importJson(raw);
    expect(session.read()).toMatchObject({ phase: "error", notice: "뷰포트 잠금 실패" });
    expect(session.read().project).toBe(before);
    const delayed = Promise.withResolvers<void>();
    applySource.mockImplementationOnce(() => delayed.promise);
    const imported = session.importJson(raw);
    session.cancel();
    delayed.resolve();
    await imported;
    expect(session.read().project).toBe(before);
    await session.importJson(raw);
    expect(session.read()).toMatchObject({ phase: "ready", dirty: true, project: { scene: { revision: 5 } } });
  });

  it("입력 잠금과 존재하지 않는 컷 ID가 활성 호스트 변경을 막는다", async () => {
    const { session, applySource, setBlocked } = fixture();
    await session.restore();
    session.capture("첫 컷");
    const before = session.read().project;
    setBlocked("다른 편집 명령이 진행 중입니다.");
    expect(() => session.capture("둘째 컷")).toThrow(/다른 편집/);
    await expect(session.apply("missing")).rejects.toThrow(/다른 편집/);
    setBlocked(null);
    await expect(session.apply("missing")).rejects.toThrow(/선택한 컷/);
    expect(() => session.remove("missing")).toThrow(/선택한 컷/);
    expect(session.read().project).toBe(before);
    expect(applySource).not.toHaveBeenCalled();
  });

  it("이전 저장의 늦은 receipt가 재복원 이후 다른 컷의 상태를 덮어쓰지 않는다", async () => {
    const { session, repository } = fixture();
    await session.restore();
    session.capture("이전 컷");
    const delayed = Promise.withResolvers<StudioWebAuthoringProjectSaveReceipt>();
    vi.spyOn(repository, "save").mockImplementationOnce(() => delayed.promise);
    const save = session.save();
    session.cancel();
    await session.restore();
    session.capture("현재 컷");
    const current = session.read();
    delayed.resolve({ status: "saved", projectId: PROJECT_ID, revision: 999, byteLength: 100 });
    await save;
    expect(session.read()).toBe(current);
    await session.save();
    expect(session.read().project?.revision).toBeLessThan(999);
  });

  it("독립 두 세션이 같은 revision을 저장하면 뒤쪽은 충돌을 표시하고 컷을 보존한다", async () => {
    const { session: first, repository, host } = fixture();
    const second = new StudioScene3dCutSession(host, repository);
    await Promise.all([first.restore(), second.restore()]);
    first.capture("첫 세션 컷");
    second.capture("두 번째 세션 컷");
    const secondCuts = second.read().project?.shotVersions;
    await first.save();
    await second.save();
    expect(second.read()).toMatchObject({ phase: "error", dirty: true });
    expect(second.read().notice).toMatch(/revision/);
    expect(second.read().project?.shotVersions).toEqual(secondCuts);
    await expect(second.save()).rejects.toThrow(/다시 불러오기/);
    expect(() => second.capture("충돌 뒤 컷")).toThrow(/다시 불러오기/);
    expect(parseStudioWebAuthoringProjectV3(second.backup()).shotVersions).toEqual(secondCuts);
    expect((await repository.load(PROJECT_ID))?.shotVersions?.cuts[0]?.name).toBe("첫 세션 컷");
  });

  it("쓰기 완료 직전 취소하면 재복원으로 저장 상태를 확인하기 전 추가 저장을 막는다", async () => {
    const { session, repository, store, rows } = fixture();
    await session.restore();
    session.capture("취소 시점의 컷");
    store.set.mockImplementationOnce(async (key, raw) => { rows.set(key, raw); session.cancel(); });
    await session.save();
    expect(session.read().dirty).toBe(true);
    await expect(session.save()).rejects.toThrow(/다시 불러오기/);
    expect(() => session.capture("확인 전 컷")).toThrow(/다시 불러오기/);
    expect(parseStudioWebAuthoringProjectV3(session.backup()).shotVersions?.cuts[0]?.name).toBe("취소 시점의 컷");
    expect(store.set).toHaveBeenCalledTimes(1);
    await session.restore();
    expect(session.read()).toMatchObject({ phase: "ready", dirty: false });
    expect(session.read().project).toEqual(await repository.load(PROJECT_ID));
    await session.save();
    expect(session.read()).toMatchObject({ phase: "ready", dirty: false });
  });

  it("원고 승인 컷 A를 재편집할 때 저장소의 같은 ID 최신 컷 B가 원본과 승인을 덮어쓰지 않는다", async () => {
    const { repository, rows, store, host, applySource } = fixture();
    const pinned = approveStudioScene3dVersionedCut(createStudioScene3dVersionedCut({
      ...source(1), id: "cut:shared-id", name: "원고에 승인된 A",
    }));
    const newer = {
      ...createStudioScene3dVersionedCut({ ...source(8), id: pinned.id, name: "저장소 최신 B" }),
      revision: pinned.revision + 3,
    };
    const stored = createStudioWebAuthoringProjectV3({
      projectId: PROJECT_ID, title: "현재 작업 B", ...source(8), revision: 8,
      shotVersions: { version: 1, cuts: [newer] }, now: "2026-09-27T00:00:00.000Z",
    });
    const storedRaw = serializeStudioWebAuthoringProjectV3(stored);
    const pinnedBefore = JSON.stringify(pinned);
    rows.set(PROJECT_ID, storedRaw);
    const session = new StudioScene3dCutSession({ ...host, readPinnedCut: () => pinned }, repository);

    await session.restore();

    expect(applySource).toHaveBeenCalledTimes(1);
    expect(applySource.mock.calls[0]?.[0]).toEqual(pinned.source);
    expect(applySource.mock.calls[0]?.[1]).toMatchObject({
      sourceHash: pinned.sourceHash, status: "approved", camera: pinned.camera,
    });
    expect(JSON.stringify(pinned)).toBe(pinnedBefore);
    const restored = session.read();
    expect(restored).toMatchObject({ phase: "ready", dirty: true });
    const cuts = restored.project?.shotVersions?.cuts ?? [];
    expect(cuts.find((cut) => cut.id === newer.id)).toEqual(newer);
    const retainedPinned = cuts.find((cut) => cut.id !== newer.id && cut.sourceHash === pinned.sourceHash);
    expect(retainedPinned).toMatchObject({ status: "approved", camera: pinned.camera, source: pinned.source });
    expect(restored.selectedId).toBe(retainedPinned?.id);
    expect(rows.get(PROJECT_ID)).toBe(storedRaw);
    expect(store.set).not.toHaveBeenCalled();

    await session.save();
    const saved = await repository.load(PROJECT_ID);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(saved?.shotVersions?.cuts.find((cut) => cut.id === newer.id)).toEqual(newer);
    expect(saved?.shotVersions?.cuts.find((cut) => cut.id === retainedPinned?.id)?.status).toBe("approved");
  });
  it("저장 중 뷰포트가 바뀌면 요청 버전 저장과 남은 변경을 구분한다", async () => {
    const { session, repository, host } = fixture();
    let revision = 1;
    Object.assign(host, { readRevision: () => revision });
    await session.restore();
    session.capture("저장 대상");
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof repository.save>>>();
    vi.spyOn(repository, "save").mockImplementationOnce(() => pending.promise);
    const saving = session.save();
    revision = 2;
    pending.resolve({ status: "saved", projectId: PROJECT_ID, revision: 2, byteLength: 100 });
    await saving;
    expect(session.read()).toMatchObject({ phase: "ready", dirty: true });
    expect(session.read().notice).toMatch(/저장 중 바뀐 장면/u);
  });

  it("저장소를 읽는 동안 편집한 장면을 뒤늦은 복원으로 덮지 않는다", async () => {
    const { session, repository, host, applySource } = fixture();
    let revision = 1;
    Object.assign(host, { readRevision: () => revision });
    const pending = Promise.withResolvers<ReturnType<typeof savedProject>>();
    vi.spyOn(repository, "load").mockImplementationOnce(() => pending.promise);
    const restoring = session.restore();
    revision = 2;
    pending.resolve(savedProject());
    await restoring;
    expect(applySource).not.toHaveBeenCalled();
    expect(session.read()).toMatchObject({ phase: "error", project: null });
    expect(session.read().notice).toMatch(/장면이 변경/u);
  });

  it("JSON 가져오기 뒤 컷 undo/redo는 고정 컷만 되돌리고 실제 장면 원본과 일치한다", async () => {
    const { session, host, applySource } = fixture();
    await session.restore();
    session.capture("가져오기 전 컷");
    const cut = session.read().project?.shotVersions?.cuts[0];
    await session.importJson(serializeStudioWebAuthoringProjectV3(savedProject(8)));
    expect(host.readSource().scene.revision).toBe(8);
    session.step("undo");
    expect(session.read().project?.shotVersions?.cuts).toEqual([cut]);
    expect(session.read().project?.scene).toEqual(host.readSource().scene);
    session.step("redo");
    expect(session.read().project?.shotVersions?.cuts ?? []).toEqual([]);
    expect(session.read().project?.scene).toEqual(host.readSource().scene);
    expect(applySource).toHaveBeenCalledTimes(1);
  });

  it("JSON 백업은 아직 로컬 저장하지 않은 현재 장면과 승인 컷을 함께 보존한다", async () => {
    const { session, setSource, setBlocked, store } = fixture();
    await session.restore();
    session.capture("고정 컷");
    const id = session.read().selectedId!;
    session.approve(id);
    const cut = session.read().project?.shotVersions?.cuts[0];
    setSource(source(9));
    const backup = parseStudioWebAuthoringProjectV3(session.backup());
    expect(backup.scene.revision).toBe(9);
    expect(backup.shotVersions?.cuts).toEqual([cut]);
    expect(store.set).not.toHaveBeenCalled();
    setBlocked("다른 편집 세션");
    expect(() => session.backup()).toThrow("다른 편집 세션");
  });

  it("JSON 복원의 카메라가 지연되면 문서 가져오기와 뷰포트 대기를 구분한다", async () => {
    const { session, applySource } = fixture();
    await session.restore();
    applySource.mockResolvedValueOnce("deferred");
    await session.importJson(serializeStudioWebAuthoringProjectV3(savedProject(8)));
    expect(session.read().notice).toMatch(/카메라는 뷰포트 준비 후/u);
  });
});
