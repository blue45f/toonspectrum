// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaInstallShowcase } from "./PwaInstallShowcase";

const installSnapshotMock = {
  status: "available",
  platform: "android",
  standalone: false,
  online: true,
  serviceWorkerStatus: "active",
} as const;
const installServerSnapshotMock = {
  status: "unknown",
  platform: "unknown",
  standalone: false,
  online: true,
  serviceWorkerStatus: "none",
} as const;

vi.mock("@/shared/lib/pwa-install-store", () => ({
  // useSyncExternalStore는 getSnapshot 결과의 참조 안정성을 요구하므로 고정 객체를 돌려준다.
  getPwaInstallSnapshot: vi.fn(() => installSnapshotMock),
  getPwaInstallServerSnapshot: vi.fn(() => installServerSnapshotMock),
  requestPwaInstall: vi.fn(async () => "accepted" as const),
  subscribePwaInstall: vi.fn(() => () => undefined),
}));

vi.mock("@/shared/catalog/catalog-static", () => ({
  resolveAssetUrl: (path: string) => path,
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateBilingualValueForActiveLocale: (_scope: string, ko: unknown) => ko,
  useBilingualI18nRevision: () => undefined,
}));

function renderShowcase(props?: Partial<Parameters<typeof PwaInstallShowcase>[0]>) {
  return render(
    <PwaInstallShowcase
      onClose={props?.onClose ?? vi.fn()}
      onInstalled={props?.onInstalled ?? vi.fn()}
      trigger={props?.trigger ?? "manual"}
      page
    />,
  );
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PwaInstallShowcase", () => {
  it("제목과 4개 기능 카드를 렌더링한다", () => {
    renderShowcase();
    expect(screen.getByText("툰스튜디오를 앱으로 설치하세요")).toBeTruthy();
    expect(screen.getByText("오프라인에서도 그리기")).toBeTruthy();
    expect(screen.getByText("1초 만에 실행")).toBeTruthy();
    expect(screen.getByText("전체화면 캔버스")).toBeTruthy();
    expect(screen.getByText("자동 저장·동기화")).toBeTruthy();
  });

  it("플랫폼 탭을 전환하면 단계 가이드가 바뀐다", () => {
    renderShowcase();
    expect(screen.getByText("Chrome으로 툰스튜디오 열기")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "iPhone·iPad" }));
    expect(screen.getByText("Safari로 툰스튜디오 열기")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "PC·Mac" }));
    expect(screen.getByText("Chrome·Edge로 열기")).toBeTruthy();
  });

  it("설치 버튼을 누르면 requestPwaInstall을 호출한다", async () => {
    const onInstalled = vi.fn();
    const onClose = vi.fn();
    const { requestPwaInstall } = await import("@/shared/lib/pwa-install-store");
    renderShowcase({ onInstalled, onClose });
    fireEvent.click(screen.getByRole("button", { name: "앱 설치하기" }));
    expect(requestPwaInstall).toHaveBeenCalledTimes(1);
  });

  it("설치가 취소되면 무반응으로 끝내지 않고 취소 안내를 보여준다", async () => {
    const { requestPwaInstall } = await import("@/shared/lib/pwa-install-store");
    vi.mocked(requestPwaInstall).mockResolvedValue("dismissed");
    renderShowcase();
    fireEvent.click(screen.getByRole("button", { name: /앱 설치하기/ }));
    expect(await screen.findByText(/설치가 취소됐어요/)).toBeTruthy();
  });

  it("수동 설치로 넘어가면 아래 방법을 따르라는 안내를 보여준다", async () => {
    const { requestPwaInstall } = await import("@/shared/lib/pwa-install-store");
    vi.mocked(requestPwaInstall).mockResolvedValue("manual");
    renderShowcase();
    fireEvent.click(screen.getByRole("button", { name: /앱 설치하기/ }));
    expect(await screen.findByText(/기기별 설치 방법을 따라 주세요/)).toBeTruthy();
  });

  it("이미 설치된 상태로 열리면 처음부터 설치 완료로 표시한다", async () => {
    const { getPwaInstallSnapshot } = await import("@/shared/lib/pwa-install-store");
    vi.mocked(getPwaInstallSnapshot).mockReturnValue({
      status: "installed",
      platform: "android",
      standalone: true,
      online: true,
      serviceWorkerStatus: "active",
    } as ReturnType<typeof getPwaInstallSnapshot>);
    renderShowcase();
    expect(screen.getByRole("button", { name: /설치 완료/ })).toBeTruthy();
  });

  it("플랫폼 탭이 가이드 패널과 aria로 연결된다", () => {
    renderShowcase();
    const tab = screen.getByRole("tab", { name: "iPhone·iPad" });
    expect(tab.getAttribute("aria-controls")).toBe("pwa-guide-panel");
    fireEvent.click(tab);
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe("pwa-guide-tab-ios");
  });

  it("dialog role과 aria 속성을 가진다 (모달 모드)", () => {
    render(
      <PwaInstallShowcase onClose={vi.fn()} onInstalled={vi.fn()} trigger="manual" />,
    );
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });

  it("Escape 키로 닫힌다", () => {
    const onClose = vi.fn();
    render(<PwaInstallShowcase onClose={onClose} onInstalled={vi.fn()} trigger="manual" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
