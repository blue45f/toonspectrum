// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requests = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/platform/api", () => ({ apiFetch: requests.fetch }));

const available = { capabilities: { studioProjectRead: "available", studioCloudSave: "available" } };
const unavailable = { capabilities: { studioProjectRead: "unavailable", studioCloudSave: "unavailable" } };
const cleanups: Array<() => void> = [];

function deferredBody() {
  let resolve: (value: unknown) => void = () => undefined;
  const body = new Promise<unknown>((done) => { resolve = done; });
  const response = new Response(null, { status: 200 });
  vi.spyOn(response, "json").mockImplementation(() => body);
  return { response, resolve };
}

async function flush() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  requests.fetch.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Studio 연결 상태 비동기 세대", () => {
  it.each([true, false])("새 검사 결과 이후 늦게 끝난 이전 응답이 서버 상태를 덮지 않는다: %s", async (newAvailable) => {
    const old = deferredBody();
    requests.fetch.mockResolvedValueOnce(old.response).mockResolvedValueOnce(new Response(JSON.stringify(newAvailable ? available : unavailable)));
    const runtime = await import("./studio-connectivity");
    cleanups.push(runtime.startStudioConnectivityRuntime());
    await flush();
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(runtime.getStudioConnectivitySnapshot().serverAvailable).toBe(newAvailable);
    old.resolve(newAvailable ? unavailable : available);
    await flush();
    expect(runtime.getStudioConnectivitySnapshot().serverAvailable).toBe(newAvailable);
  });

  it("마지막 화면이 닫힌 뒤 늦게 읽힌 응답을 발행하지 않는다", async () => {
    const old = deferredBody();
    requests.fetch.mockResolvedValueOnce(old.response);
    const runtime = await import("./studio-connectivity");
    const stop = runtime.startStudioConnectivityRuntime();
    await flush();
    stop();
    const before = runtime.getStudioConnectivitySnapshot();
    old.resolve(unavailable);
    await flush();
    expect(runtime.getStudioConnectivitySnapshot()).toBe(before);
  });

  it.each([true, false])("새 실제 요청 결과를 오래된 상태 검사가 취소하지 않는다: %s", async (succeeded) => {
    const old = deferredBody();
    requests.fetch.mockResolvedValueOnce(old.response);
    const runtime = await import("./studio-connectivity");
    cleanups.push(runtime.startStudioConnectivityRuntime());
    await flush();
    if (succeeded) runtime.reportStudioServerRequestSuccess();
    else runtime.reportStudioServerRequestFailure(new TypeError("Failed to fetch"));
    expect(runtime.getStudioConnectivitySnapshot().serverAvailable).toBe(succeeded);
    old.resolve(succeeded ? unavailable : available);
    await flush();
    expect(runtime.getStudioConnectivitySnapshot().serverAvailable).toBe(succeeded);
  });

  it("시간이 초과된 검사에서 늦게 읽은 정상 본문을 재연결 성공으로 쓰지 않는다", async () => {
    const old = deferredBody();
    requests.fetch.mockResolvedValueOnce(old.response);
    const runtime = await import("./studio-connectivity");
    cleanups.push(runtime.startStudioConnectivityRuntime());
    await flush();
    vi.advanceTimersByTime(4_000);
    old.resolve(available);
    await flush();
    expect(runtime.getStudioConnectivitySnapshot()).toMatchObject({ serverAvailable: false, checking: false });
  });
});
