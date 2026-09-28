// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionDemoProject } from "./production-demo";
import { useProductionProjectSession } from "./use-production-project-session";
import type { ProductionClientCommand, ProductionProjectRecord } from "./production-api";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), revision: 1, listeners: new Set<() => void>() }));
vi.mock("./production-api", () => ({ getProductionProject: mocks.load, executeProductionCommand: mocks.save }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthSessionRevision: () => mocks.revision, listeners: mocks.listeners }));
vi.mock("@/platform/api", () => ({ httpStatus: (error: { status?: number }) => error.status,
  getApiErrorMessage: async (error: Error, fallback: string) => error.message || fallback }));
const access = { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" as const };
const record = (projectId = "project-a", revision = 1): ProductionProjectRecord => ({ aggregate: { ...createProductionDemoProject(), projectId, revision }, access });
const demo = { create: () => createProductionDemoProject(), reduce: (current: ProductionProjectRecord["aggregate"]) => ({ ...current, revision: current.revision + 1 }) };
const command: ProductionClientCommand = { type: "upsert-task", task: createProductionDemoProject().tasks[0]! };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => { vi.clearAllMocks(); mocks.revision = 1; mocks.load.mockResolvedValue(record()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("프로젝트·계정별 협업 요청 수명", () => {
  it("비로그인 실제 프로젝트는 조회하지 않고 권한을 닫는다", () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", null, demo));
    expect(mocks.load).not.toHaveBeenCalled(); expect(result.current.access.view).toBe(false);
  });
  it("프로젝트 이동 뒤 늦게 온 이전 응답을 새 화면에 표시하지 않는다", async () => {
    const first = deferred<ProductionProjectRecord>(); mocks.load.mockReturnValueOnce(first.promise).mockResolvedValue(record("project-b"));
    const { result, rerender } = renderHook(({ id }) => useProductionProjectSession(id, "owner", demo), { initialProps: { id: "project-a" } });
    rerender({ id: "project-b" });
    await waitFor(() => expect(result.current.aggregate?.projectId).toBe("project-b"));
    await act(async () => first.resolve(record("project-a", 10)));
    expect(result.current.aggregate?.projectId).toBe("project-b");
  });
  it("전송 중 프로젝트를 바꾸면 오래된 결과와 대기 명령을 폐기한다", async () => {
    const saved = deferred<{ aggregate: ProductionProjectRecord["aggregate"] }>(); mocks.save.mockReturnValue(saved.promise);
    const { result, rerender } = renderHook(({ id }) => useProductionProjectSession(id, "owner", demo), { initialProps: { id: "project-a" } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first!: Promise<unknown>, second!: Promise<unknown>;
    act(() => { first = result.current.executeStrict(command, "저장").catch((error: unknown) => error); second = result.current.executeStrict(command, "다음").catch((error: unknown) => error); });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    mocks.load.mockResolvedValue(record("project-b")); rerender({ id: "project-b" });
    await waitFor(() => expect(result.current.aggregate?.projectId).toBe("project-b"));
    await act(async () => { saved.resolve({ aggregate: record("project-a", 5).aggregate }); await Promise.all([first, second]); });
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(result.current.aggregate?.projectId).toBe("project-b");
    expect(await first).toBeInstanceOf(Error); expect(await second).toBeInstanceOf(Error);
  });
  it("계정 변경 직후 기존 프로젝트와 권한을 숨긴다", async () => {
    const { result, rerender } = renderHook(({ actor }) => useProductionProjectSession("project-a", actor, demo), { initialProps: { actor: "owner" as string | null } });
    await waitFor(() => expect(result.current.aggregate).not.toBeNull());
    mocks.revision += 1; rerender({ actor: null });
    expect(result.current.aggregate).toBeNull(); expect(result.current.access.edit).toBe(false);
  });
  it("저장 실패는 strict 호출자에게 전달하고 성공 알림으로 바꾸지 않는다", async () => {
    mocks.save.mockRejectedValue(new Error("연결 실패"));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.executeStrict(command, "저장 완료")).rejects.toThrow("연결 실패"); });
    expect(result.current.saveState).toBe("error"); expect(result.current.notice).not.toBe("저장 완료");
  });
  it("충돌 뒤 최신 버전으로 다시 읽되 실패한 명령을 자동 재실행하지 않는다", async () => {
    mocks.save.mockRejectedValue(Object.assign(new Error("동시 수정 충돌"), { status: 409 }));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.load.mockResolvedValue(record("project-a", 7));
    await act(async () => { await expect(result.current.executeStrict(command, "저장 완료")).rejects.toThrow("최신 상태"); });
    expect(result.current.aggregate?.revision).toBe(7); expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("권한 회수 응답은 읽기 캐시까지 제거한다", async () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.load.mockRejectedValue(Object.assign(new Error("권한 없음"), { status: 403 }));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate).toBeNull(); expect(result.current.access.view).toBe(false);
  });
  it("잠깐의 조회 실패에는 화면을 유지하고 재접속으로 복구한다", async () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.load.mockRejectedValueOnce(new Error("일시적 장애"));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate?.revision).toBe(1); expect(result.current.notice).toContain("장애");
    mocks.load.mockResolvedValue(record("project-a", 3));
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.aggregate?.revision).toBe(3));
    expect(result.current.saveState).toBe("idle");
    expect(result.current.notice).toContain("다시 저장");
  });
  it("느린 재조회가 더 최신 저장 결과를 덮어쓰지 않는다", async () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const stale = deferred<ProductionProjectRecord>(); mocks.load.mockReturnValueOnce(stale.promise);
    let read!: Promise<void>; act(() => { read = result.current.refresh(); });
    mocks.save.mockResolvedValue({ aggregate: record("project-a", 2).aggregate });
    await act(async () => result.current.executeStrict(command, "완료"));
    await act(async () => { stale.resolve(record()); await read; });
    expect(result.current.aggregate?.revision).toBe(2);
  });
});

it("사용자 ID가 같아도 로그인 세대가 바뀌면 권한과 프로젝트를 다시 확인한다", async () => {
  const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.load.mockResolvedValue({ ...record("project-a", 5), access: { ...access, edit: false, comment: false, manage: false, owner: false, role: "viewer" } });
  act(() => { mocks.revision += 1; for (const notify of mocks.listeners) notify(); });
  await waitFor(() => expect(result.current.aggregate?.revision).toBe(5));
  expect(result.current.access.edit).toBe(false);
  expect(mocks.load).toHaveBeenCalledTimes(2);
});

it("앞선 저장이 실패하면 기존 대기열은 자동 재실행하지 않고 명시적 재시도만 허용한다", async () => {
  const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.save.mockRejectedValueOnce(new Error("일시적 저장 실패"));
  let operations!: Promise<unknown>[];
  act(() => { operations = [result.current.executeStrict(command, "첫 변경"), result.current.executeStrict(command, "대기 변경")].map((operation) => operation.catch((error: unknown) => error)); });
  let results!: unknown[];
  await act(async () => { results = await Promise.all(operations); });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(results[1]).toBeInstanceOf(Error);
  expect(String(results[1])).toContain("대기 중인 변경");
  mocks.save.mockResolvedValueOnce({ aggregate: record("project-a", 2).aggregate });
  await act(async () => result.current.executeStrict(command, "명시적 재시도"));
  expect(result.current.aggregate?.revision).toBe(2);
});

it("200 응답이라도 접근 거부나 다른 프로젝트가 반환되면 이전 캐시를 폐기한다", async () => {
  const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mocks.load.mockResolvedValueOnce({ ...record(), access: { ...access, view: false } });
  await act(async () => result.current.refresh());
  expect(result.current.aggregate).toBeNull(); expect(result.current.access.view).toBe(false);
  mocks.load.mockResolvedValueOnce(record("project-b"));
  await act(async () => result.current.refresh());
  expect(result.current.aggregate).toBeNull();
});

it("계정 변경 전에 캡처한 저장 함수는 새 계정 권한으로 실행되지 않는다", async () => {
  const { result, rerender } = renderHook(({ actor }) => useProductionProjectSession("project-a", actor, demo), { initialProps: { actor: "owner" } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const previousSave = result.current.executeStrict;
  rerender({ actor: "another-user" });
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  await act(async () => { await expect(previousSave(command, "이전 계정 변경")).rejects.toThrow("계정이나 프로젝트"); });
  expect(mocks.save).not.toHaveBeenCalled();
});
