// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: { get: mocks.get } }));
const STORAGE_KEY = "toonspectrum:service-capabilities:v1";
const ERROR_EVENT = "toonspectrum:service-capability-error";
const capabilities = {
  publicCatalog: "available", authSession: "available", communityRead: "available",
  communityWrite: "available", marketplaceRead: "available", studioLocalEditing: "available",
  studioProjectRead: "available", studioCloudSave: "available", realtimeCollaboration: "available",
  publishing: "available", serverAi: "available",
} as const;
function report(status: "available" | "degraded" = "available", ageMs = 0) {
  return { status, checkedAt: new Date(Date.now() - ageMs).toISOString(), incidentId: null,
    retryAfterSeconds: status === "degraded" ? 5 : null,
    capabilities: { ...capabilities, studioCloudSave: status === "degraded" ? "unavailable" : "available" } };
}
const releases: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T13:00:00Z"));
  vi.resetModules(); mocks.get.mockReset(); mocks.get.mockImplementation(async () => report());
  localStorage.clear();
});
afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.restoreAllMocks(); vi.useRealTimers();
});
async function start() {
  const subject = await import("./service-capability-state");
  releases.push(subject.startServiceCapabilityRuntime());
  await vi.advanceTimersByTimeAsync(0);
  return subject;
}
function storage(value: ReturnType<typeof report>) {
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: JSON.stringify(value) }));
}
function failure(capability = "creator.work.write", retryAfterSeconds: number | null = 5) {
  window.dispatchEvent(new CustomEvent(ERROR_EVENT, { detail: { capability, retryAfterSeconds } }));
}

describe("서비스 상태 캐시와 재연결 수명주기", () => {
  it("이전 날의 장애 캐시를 현재 전체 서비스 장애로 표시하지 않는다", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(report("degraded", 86_400_000)));
    const subject = await import("./service-capability-state");
    expect(subject.getServiceCapabilitySnapshot().status).toBe("unknown");
    expect(subject.getServiceCapabilitySnapshot().report).toBeNull();
  });
  it("오래 멈춘 탭의 저장소 이벤트가 최신 정상 상태를 덮지 못한다", async () => {
    const subject = await start();
    storage(report("degraded", 30_000));
    expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
    expect(subject.capabilityAvailable("studioCloudSave")).toBe(true);
  });
  it("정상 최신 탭의 복구 보고를 받으면 복구 시각도 갱신한다", async () => {
    mocks.get.mockResolvedValueOnce(report("degraded"));
    const subject = await start();
    await vi.advanceTimersByTimeAsync(1);
    storage(report());
    expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
    expect(subject.getServiceCapabilitySnapshot().recoveredAt).toBe(Date.now());
  });
  it("서버가 제시한 재확인 시각에 실행하고 60초 폴링까지 기다리지 않는다", async () => {
    mocks.get.mockResolvedValueOnce(report("degraded"));
    const subject = await start();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
  });
  it("온라인 복귀는 이전 장애의 재확인 대기 시간을 건너뛴다", async () => {
    mocks.get.mockResolvedValueOnce(report("degraded"));
    const subject = await start();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
  });
  it("서버 응답에 추가된 상태 필드를 허용하고 오래된 경고를 복구한다", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(report("degraded")));
    mocks.get.mockResolvedValueOnce({ ...report(), version: 2, capabilities: { ...capabilities, newCapability: "available" } });
    const subject = await start();
    expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
  });
  it("상태 확인 중 더 최근에 발생한 저장 장애를 지연 정상 응답이 지우지 않는다", async () => {
    const subject = await start();
    let finish: (value: ReturnType<typeof report>) => void = () => undefined;
    mocks.get.mockReturnValueOnce(new Promise<ReturnType<typeof report>>((resolve) => { finish = resolve; }));
    const pending = subject.probeServiceCapabilities(true);
    await vi.advanceTimersByTimeAsync(0);
    failure();
    finish(report());
    await pending;
    expect(subject.getServiceCapabilitySnapshot().status).toBe("degraded");
    expect(subject.capabilityAvailable("studioCloudSave")).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
  });
  it("취소된 상태 확인이 다시 확인 버튼을 무한 비활성화하지 않는다", async () => {
    mocks.get.mockRejectedValueOnce(new DOMException("취소", "AbortError"));
    const subject = await start();
    expect(subject.getServiceCapabilitySnapshot().checking).toBe(false);
  });
  it("같은 구독 해제를 두 번 호출해도 다른 화면의 상태 확인을 중단하지 않는다", async () => {
    const subject = await start();
    const second = subject.startServiceCapabilityRuntime(); releases.push(second);
    const first = releases[0]; first?.(); first?.();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  it("마지막 화면 종료 후 예약된 재확인은 실행하지 않는다", async () => {
    mocks.get.mockResolvedValueOnce(report("degraded"));
    await start();
    for (const release of releases.splice(0)) release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  it("서버 렌더링 스냅샷은 같은 참조로 반환한다", async () => {
    const subject = await import("./service-capability-state");
    expect(subject.getServiceCapabilityServerSnapshot()).toBe(subject.getServiceCapabilityServerSnapshot());
  });
});


it("20분 뒤 복귀해도 과거 backoff를 기다리지 않고 최신 상태를 확인한다", async () => {
  mocks.get.mockResolvedValueOnce({ ...report("degraded"), retryAfterSeconds: 3_600 });
  const subject = await start();
  vi.setSystemTime(Date.now() + 20 * 60 * 1_000);
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
});

it("범위 없는 HTTP 장애는 1초 뒤 상태를 확인하고 반복 이벤트가 검사를 미루지 않는다", async () => {
  const subject = await start();
  failure("", null);
  await vi.advanceTimersByTimeAsync(500);
  failure("", null);
  await vi.advanceTimersByTimeAsync(500);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
});


it("상태 API 자체가 실패해도 자체 오류 이벤트 때문에 즉시 재시도 루프를 만들지 않는다", async () => {
  const { AppApiError } = await import("./api-error");
  mocks.get.mockImplementationOnce(async () => {
    failure("", null);
    throw new AppApiError("상태 API 연결 실패", { kind: "capability_unavailable", status: 503 });
  });
  await start();
  await vi.advanceTimersByTimeAsync(29_999);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.get).toHaveBeenCalledTimes(2);
});

it("반복 포커스는 5초 안에 상태 요청을 쏟아내지 않는다", async () => {
  await start();
  for (let index = 0; index < 20; index += 1) {
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(100);
  }
  expect(mocks.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3_000);
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.get).toHaveBeenCalledTimes(2);
});

it("범위 없는 요청 오류도 명시적인 Retry-After를 존중한다", async () => {
  await start();
  failure("", 30);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.get).toHaveBeenCalledTimes(2);
});


it("HTTP 클라이언트와 상태 런타임에서 중복 재시도하지 않는다", async () => {
  await start();
  expect(mocks.get).toHaveBeenCalledWith("/health/capabilities", expect.objectContaining({ retry: 0 }));
});

it("무료 서버 절전 해제 구간의 첫 응답 지연은 경고 대신 연결 준비로 보고 6초 뒤 다시 확인한다", async () => {
  const { AppApiError } = await import("./api-error");
  mocks.get.mockImplementationOnce(async () => {
    throw new AppApiError("응답 지연", { kind: "timeout" });
  });
  const subject = await start();
  expect(subject.getServiceCapabilitySnapshot()).toMatchObject({ status: "degraded", warmingUp: true });
  await vi.advanceTimersByTimeAsync(5_999);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  // 첫 연결 성공은 장애 복구가 아니므로 복구 알림 시각을 남기지 않는다.
  expect(subject.getServiceCapabilitySnapshot()).toMatchObject({ status: "available", warmingUp: false, recoveredAt: null });
});

it("한 번 연결에 성공한 뒤의 지연은 절전 해제가 아니라 일반 장애로 다룬다", async () => {
  const { AppApiError } = await import("./api-error");
  const subject = await start();
  mocks.get.mockImplementationOnce(async () => {
    throw new AppApiError("응답 지연", { kind: "timeout" });
  });
  await subject.probeServiceCapabilities(true);
  expect(subject.getServiceCapabilitySnapshot()).toMatchObject({ status: "degraded", warmingUp: false });
});

it("본문 없는 게이트웨이 503(Render 절전 해제 실패)도 절전 해제로 보고 6초 뒤 다시 확인한다", async () => {
  const { AppApiError } = await import("./api-error");
  mocks.get.mockImplementationOnce(async () => {
    // Render가 깨우기에 실패하면 오류 봉투도 Retry-After도 없는 503을 돌려준다.
    throw new AppApiError("일부 온라인 기능을 일시적으로 사용할 수 없습니다.", { kind: "capability_unavailable", status: 503 });
  });
  const subject = await start();
  expect(subject.getServiceCapabilitySnapshot()).toMatchObject({ status: "degraded", warmingUp: true });
  await vi.advanceTimersByTimeAsync(5_999);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(subject.getServiceCapabilitySnapshot()).toMatchObject({ status: "available", warmingUp: false, recoveredAt: null });
});

it("Retry-After를 실은 API 503은 절전 해제가 아니라 실제 장애로 보고 그 시각에 다시 확인한다", async () => {
  const { AppApiError } = await import("./api-error");
  mocks.get.mockImplementationOnce(async () => {
    throw new AppApiError("일부 온라인 기능을 일시적으로 사용할 수 없습니다.", { kind: "capability_unavailable", status: 503, retryAfterSeconds: 30 });
  });
  const subject = await start();
  expect(subject.getServiceCapabilitySnapshot()).toMatchObject({ status: "degraded", warmingUp: false });
  await vi.advanceTimersByTimeAsync(29_999);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(subject.getServiceCapabilitySnapshot().status).toBe("available");
});

