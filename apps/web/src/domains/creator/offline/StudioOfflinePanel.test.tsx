// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioOfflinePanel } from "./StudioOfflinePanel";

const runtime = vi.hoisted(() => ({
  inspect: vi.fn(),
  prepare: vi.fn(),
  persist: vi.fn(),
}));
const connection = vi.hoisted(() => ({
  current: {
    browserOnline: true,
    serverReachable: true,
    checking: false,
    mode: "online" as "online" | "reconnecting" | "server-unavailable" | "offline",
    serverAvailable: true,
    localOnly: false,
    lastCheckedAt: 1,
    consecutiveFailures: 0,
  },
}));
vi.mock("./studio-offline-client", () => ({
  inspectStudioOfflineDevice: runtime.inspect,
  prepareLoadedStudioOfflineResources: runtime.prepare,
  requestStudioPersistentStorage: runtime.persist,
}));
vi.mock("./use-studio-connectivity", () => ({
  useStudioConnectivity: () => connection.current,
}));
const device = {
  online: true,
  navigationFallback: false,
  supported: true,
  controlled: true,
  offlineReady: true,
  buildId: "build-1",
  persisted: false,
  usage: 10,
  quota: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  connection.current = {
    browserOnline: true,
    serverReachable: true,
    checking: false,
    mode: "online",
    serverAvailable: true,
    localOnly: false,
    lastCheckedAt: 1,
    consecutiveFailures: 0,
  };
  runtime.inspect.mockResolvedValue(device);
  runtime.prepare.mockResolvedValue({
    schema: 1, buildId: "build-1", checked: 5, cached: 5,
    downloadedBytes: 20, missing: [], complete: true,
  });
  runtime.persist.mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "connection");
});
function openPanel() {
  const view = render(<StudioOfflinePanel />);
  const details = view.container.querySelector("details");
  if (details) details.open = true;
  return view;
}

function useServerUnavailable() {
  connection.current = {
    ...connection.current,
    serverReachable: false,
    mode: "server-unavailable",
    serverAvailable: false,
    localOnly: true,
  };
}

describe("automatic Studio offline mode", () => {
  it("does not render offline readiness UI during normal online operation", async () => {
    const view = openPanel();
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('[data-studio-offline-panel="true"]')).toBeNull();
    expect(screen.queryByText(/오프라인 자동 준비/u)).toBeNull();
  });
  it("keeps the same Studio in local-only mode during a server outage", async () => {
    useServerUnavailable();
    openPanel();
    await screen.findByText("서버 장애 · 로컬 작업 중");
    expect(screen.getByText(/드로잉·레이어 편집·로컬 자동 저장/u)).toBeTruthy();
    expect(screen.getByText(/서버 AI는 연결 복구 전 일시 중지/u)).toBeTruthy();
  });

  it("prepares the current Studio pack automatically after mount", async () => {
    vi.useFakeTimers();
    runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    const view = openPanel();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    vi.useRealTimers();
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('[data-studio-offline-panel="true"]')).toBeNull();
  });

  it("rechecks an incomplete offline pack after the server recovers", async () => {
    vi.useFakeTimers();
    runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    runtime.prepare
      .mockResolvedValueOnce({
        schema: 1, buildId: "build-1", checked: 5, cached: 3,
        downloadedBytes: 20, missing: ["/assets/tool.js"], complete: false,
      })
      .mockResolvedValueOnce({
        schema: 1, buildId: "build-1", checked: 5, cached: 5,
        downloadedBytes: 10, missing: [], complete: true,
      });
    useServerUnavailable();
    const view = openPanel();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    expect(runtime.prepare).toHaveBeenCalledTimes(1);

    connection.current = {
      ...connection.current,
      serverReachable: true,
      mode: "online",
      serverAvailable: true,
      localOnly: false,
    };
    view.rerender(<StudioOfflinePanel />);
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    vi.useRealTimers();
    expect(runtime.prepare).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('[data-studio-offline-panel="true"]')).toBeNull();
  });

  it("distinguishes a cached Studio navigation from browser connectivity", async () => {
    runtime.inspect.mockResolvedValue({ ...device, navigationFallback: true });
    openPanel();
    await screen.findByText("저장된 스튜디오 · 로컬 작업 중");
    expect(screen.getByText(/서버 응답 대신 이 기기에 저장된 스튜디오 화면/u)).toBeTruthy();
  });
  it("keeps manual retry separate from manuscript durability", async () => {
    useServerUnavailable();
    runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    openPanel();
    const button = await screen.findByRole("button", { name: "오프라인 준비 다시 시도" });
    fireEvent.click(button);
    expect(await screen.findByText(/편집 리소스 5개/u)).toBeTruthy();
    expect(screen.getByText(/리소스 캐시는 원고 저장과 별개/u)).toBeTruthy();
  });

  it("does not report a partial cache as ready", async () => {
    useServerUnavailable();
    runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    runtime.prepare.mockResolvedValue({
      schema: 1, buildId: "build-1", checked: 5, cached: 3,
      downloadedBytes: 20, missing: ["/assets/tool.js"], complete: false,
    });
    openPanel();
    const button = await screen.findByRole("button", { name: "오프라인 준비 다시 시도" });
    fireEvent.click(button);
    expect(await screen.findByText(/일부 도구는 연결이 필요/u)).toBeTruthy();
  });

  it("skips automatic downloads when data saver is enabled", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    const view = openPanel();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    vi.useRealTimers();
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-studio-offline-panel="true"]')).toBeNull();
  });

  it("keeps an unsupported browser actionable with a backup explanation", async () => {
    useServerUnavailable();
    runtime.inspect.mockResolvedValue({
      ...device, supported: false, controlled: false, offlineReady: null,
    });
    openPanel();
    await screen.findByText(/서비스 워커가 활성화되면 자동 준비/u);
    expect((screen.getByRole("button", { name: "오프라인 준비 다시 시도" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("reports persistence denial without implying cloud save", async () => {
    useServerUnavailable();
    openPanel();
    const button = await screen.findByRole("button", { name: "지속 저장 요청" });
    fireEvent.click(button);
    expect(await screen.findByText(/로컬 자동 저장은 계속되지만/u)).toBeTruthy();
  });

  it("warns when local storage is nearly full without showing offline readiness copy", async () => {
    runtime.inspect.mockResolvedValue({ ...device, usage: 95 });
    openPanel();
    expect(await screen.findByText("저장 공간 부족 · 백업 권장")).toBeTruthy();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/오프라인 자동 준비/u)).toBeNull();
  });
});
