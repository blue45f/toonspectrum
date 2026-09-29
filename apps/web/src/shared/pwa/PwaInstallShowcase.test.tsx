// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaInstallShowcase } from "./PwaInstallShowcase";

vi.mock("@/shared/lib/pwa-install-store", () => ({
  getPwaInstallSnapshot: vi.fn(() => ({
    status: "available",
    platform: "android",
    standalone: false,
    online: true,
    serviceWorkerStatus: "active",
  })),
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
