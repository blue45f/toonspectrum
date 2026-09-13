// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioOfflinePanel } from "./StudioOfflinePanel";

const runtime = vi.hoisted(() => ({ inspect: vi.fn(), prepare: vi.fn(), persist: vi.fn() }));
vi.mock("./studio-offline-client", () => ({
  inspectStudioOfflineDevice: runtime.inspect,
  prepareLoadedStudioOfflineResources: runtime.prepare,
  requestStudioPersistentStorage: runtime.persist,
}));

const device = { online: true, navigationFallback: false, supported: true, controlled: true, persisted: false, usage: 10, quota: 100 };
beforeEach(() => {
  vi.clearAllMocks(); runtime.inspect.mockResolvedValue(device);
  runtime.prepare.mockResolvedValue({ schema: 1, buildId: "test", checked: 5, cached: 5, downloadedBytes: 20, missing: [], complete: true });
  runtime.persist.mockResolvedValue(false);
});
afterEach(cleanup);
function openPanel() {
  const view = render(<StudioOfflinePanel />);
  const details = view.container.querySelector("details");
  if (details) details.open = true;
  return view;
}
describe("offline preparation UI", () => {
  it("distinguishes cached-shell recovery from an internet connection indicator", async () => {
    runtime.inspect.mockResolvedValue({ ...device, navigationFallback: true }); openPanel();
    await screen.findByText("저장된 화면 · 로컬 작업 안내");
    expect(screen.getByText(/인터넷 연결 표시와 서버 상태는 다를 수 있습니다/u)).toBeTruthy();
    expect(runtime.prepare).not.toHaveBeenCalled();
  });
  it("does not download assets or request persistent storage without a user action", async () => {
    openPanel(); await waitFor(() => expect(runtime.inspect).toHaveBeenCalled());
    expect(runtime.prepare).not.toHaveBeenCalled(); expect(runtime.persist).not.toHaveBeenCalled();
  });
  it("separates prepared resources from saved manuscripts", async () => {
    openPanel();
    const button = screen.getByRole("button", { name: "오프라인 리소스 준비" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await screen.findByText(/현재 불러온 리소스 5개를 확인했습니다/u);
    expect(screen.getByText(/리소스 준비는 원고 저장이 아닙니다/u)).toBeTruthy();
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
  });
  it("does not report a partial cache as ready", async () => {
    runtime.prepare.mockResolvedValue({ checked: 5, cached: 3, complete: false }); openPanel();
    const button = screen.getByRole("button", { name: "오프라인 리소스 준비" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button);
    await screen.findByText(/오프라인 재실행을 보장할 수 없습니다/u);
  });
  it("keeps an unsupported browser actionable with a backup explanation", async () => {
    runtime.inspect.mockResolvedValue({ ...device, supported: false, controlled: false }); openPanel();
    await screen.findByText(/이 브라우저에서는 준비 기능이 제한될 수 있습니다/u);
    expect((screen.getByRole("button", { name: "오프라인 리소스 준비" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("reports persistence denial without implying the manuscript was saved", async () => {
    openPanel(); const button = screen.getByRole("button", { name: "지속 저장 요청" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button);
    await screen.findByText(/지속 저장을 허용하지 않았거나 지원하지 않습니다/u);
  });
  it("warns when storage is nearly full", async () => {
    runtime.inspect.mockResolvedValue({ ...device, usage: 95 }); openPanel();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
