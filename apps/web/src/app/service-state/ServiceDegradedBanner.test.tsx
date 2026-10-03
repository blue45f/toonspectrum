// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceDegradedBanner } from "./ServiceDegradedBanner";

import { useI18n } from "@/shared/lib/i18n";

const availableCapabilities = {
  publicCatalog: "available",
  authSession: "available",
  communityRead: "available",
  communityWrite: "available",
  marketplaceRead: "available",
  studioLocalEditing: "available",
  studioProjectRead: "available",
  studioCloudSave: "available",
  realtimeCollaboration: "available",
  publishing: "available",
  serverAi: "available",
} as const;

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  state: {} as Record<string, unknown>,
}));

vi.mock("@/platform/service-capability-state", () => ({
  requestServiceCapabilityRefresh: mocks.refresh,
  useServiceCapabilityState: () => mocks.state,
}));
function renderBanner(immersive: boolean) {
  return render(
    <MemoryRouter>
      <ServiceDegradedBanner immersive={immersive} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    status: "degraded",
    checking: false,
    report: {
      status: "degraded",
      incidentId: "inc_test",
      retryAfterSeconds: 30,
      checkedAt: new Date().toISOString(),
      capabilities: {
        ...availableCapabilities,
        communityRead: "unavailable",
        studioCloudSave: "unavailable",
      },
    },
    lastError: null,
    nextProbeAt: null,
    recoveredAt: null,
  };
});
afterEach(cleanup);

describe.each([false, true])("ServiceDegradedBanner immersive=%s", (immersive) => {
  it("states the affected capabilities without blocking local editing", () => {
    renderBanner(immersive);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("커뮤니티 조회");
    expect(status.textContent).toContain("클라우드 저장");
    expect(status.textContent).toContain("로컬 편집은 계속 사용할 수 있습니다");

    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "상태 자세히" }).getAttribute("href"))
      .toBe("/status");
  });

  it("announces recovery without retaining the degraded copy", () => {
    mocks.state = {
      ...mocks.state,
      status: "available",
      report: {
        status: "available",
        incidentId: null,
        retryAfterSeconds: null,
        checkedAt: new Date().toISOString(),
        capabilities: availableCapabilities,
      },
      recoveredAt: Date.now(),
    };

    renderBanner(immersive);

    expect(screen.getByRole("status").textContent)
      .toContain("온라인 기능이 복구되었습니다");
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
  });
});

it("몰입 화면의 상단 도구를 덮지 않고 장애 상세를 펼치거나 접을 수 있다", () => {
  render(<MemoryRouter><ServiceDegradedBanner immersive /></MemoryRouter>);
  const status = screen.getByRole("status");
  // 가상 스튜디오 도크가 게시하는 여백 변수보다 위에 뜨고, 변수가 없으면 기존 5.5rem을 유지한다.
  expect(status.className).toContain("bottom-[calc(max(5.5rem,var(--immersive-dock-clearance,0px))+env(safe-area-inset-bottom))]");
  expect(status.className).not.toContain("top-");
  expect(status.className).toContain("max-sm:bg-panel");
  expect(status.querySelector("div")?.className).toContain("max-sm:grid-cols-[auto_minmax(0,1fr)]");
  const detail = screen.getByText(/로컬 편집은 계속 사용할 수 있습니다/);
  expect(detail.hidden).toBe(true);
  const expand = screen.getByRole("button", { name: "서비스 상태 알림 펼치기" });
  expect(expand.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(expand);
  expect(detail.hidden).toBe(false);
  const collapse = screen.getByRole("button", { name: "서비스 상태 알림 접기" });
  expect(collapse.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(collapse);
  expect(detail.hidden).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "상태 자세히" }).getAttribute("href")).toBe("/status");
});

it("고정 알림의 높이 변경에 맞춰 조작부 공간을 확보하고 해제한다", () => {
  const property = "--service-status-overlay-clearance";
  document.documentElement.style.setProperty(property, "8px");
  const view = renderBanner(true);
  const banner = screen.getByRole("status");
  banner.style.position = "fixed";
  const bounds = vi.spyOn(banner, "getBoundingClientRect");
  bounds.mockReturnValue(new DOMRect(0, 600, 390, 150));
  fireEvent(window, new Event("resize"));
  expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 600 + 12}px`);
  bounds.mockReturnValue(new DOMRect(0, 520, 390, 230));
  fireEvent.click(screen.getByRole("button", { name: "서비스 상태 알림 펼치기" }));
  expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 520 + 12}px`);
  view.unmount();
  expect(document.documentElement.style.getPropertyValue(property)).toBe("8px");
  bounds.mockRestore();
  document.documentElement.style.removeProperty(property);
});

it("일반 문서 흐름의 알림은 고정 조작부의 공간을 변경하지 않는다", () => {
  const property = "--service-status-overlay-clearance";
  const view = renderBanner(false);
  fireEvent(window, new Event("resize"));
  expect(document.documentElement.style.getPropertyValue(property)).toBe("");
  view.unmount();
});


it("단일 요청 실패만으로 커뮤니티·저장·협업 전체가 제한됐다고 안내하지 않는다", () => {
  mocks.state = { ...mocks.state, report: null };
  renderBanner(false);
  const status = screen.getByRole("status");
  expect(status.textContent).toContain("온라인 연결 상태를 다시 확인하고 있습니다");
  expect(status.textContent).not.toContain("커뮤니티·클라우드 저장·협업·게시");
  expect(status.textContent).not.toContain("일부 온라인 기능을 잠시 사용할 수 없습니다");
  expect(screen.getByRole("button", { name: "다시 확인" })).toBeTruthy();
});

it("서버가 확인한 로그인 상태 저하를 정확한 기능 이름으로 안내한다", () => {
  mocks.state = { ...mocks.state, report: {
    status: "degraded", capabilities: { ...availableCapabilities, authSession: "degraded" },
  } };
  renderBanner(false);
  expect(screen.getByRole("status").textContent).toContain("로그인·세션");
  expect(screen.getByRole("status").textContent).not.toContain("클라우드 저장");
});

describe("절전 해제 안내", () => {
  it("첫 연결 대기 중에는 장애 경고 대신 조용한 연결 안내만 보인다", () => {
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
    const { container } = renderBanner(false);
    const notice = screen.getByRole("status");
    expect(notice.getAttribute("data-service-degraded-banner")).toBe("warming");
    expect(notice.textContent).toContain("온라인 기능을 연결하는 중이에요.");
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
    expect(container.querySelector('[data-service-degraded-banner="degraded"]')).toBeNull();
  });

  it("연결 대기 구간이 끝나면 기존 장애 안내로 돌아간다", () => {
    mocks.state = { ...mocks.state, warmingUp: false };
    renderBanner(false);
    expect(screen.getByRole("status").getAttribute("data-service-degraded-banner")).toBe("degraded");
  });
});

describe("일반 화면 알림의 휴대폰 접힘", () => {
  it("설명은 휴대폰 폭에서만 접혀 있고, 토글로 펼치거나 접는다", () => {
    renderBanner(false);
    const description = screen.getByText(/로컬 편집은 계속 사용할 수 있습니다/);
    // 넓은 화면에서는 항상 보이므로 hidden 속성이 아니라 휴대폰 폭 CSS로만 접는다.
    expect(description.hidden).toBe(false);
    expect(description.className).toContain("max-sm:hidden");

    const expand = screen.getByRole("button", { name: "서비스 상태 알림 펼치기" });
    expect(expand.className).toContain("sm:hidden");
    expect(expand.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expand);
    expect(description.className).not.toContain("max-sm:hidden");
    const collapse = screen.getByRole("button", { name: "서비스 상태 알림 접기" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapse);
    expect(description.className).toContain("max-sm:hidden");
  });

  it("조작 버튼 두 개는 휴대폰에서 한 줄 전체 폭 두 칸으로 놓인다", () => {
    renderBanner(false);
    const actions = screen.getByRole("button", { name: "다시 확인" }).parentElement;
    expect(actions?.className).toContain("max-sm:grid-cols-2");
    expect(actions?.className).toContain("max-sm:w-full");
  });
});

describe("영어 화면", () => {
  afterEach(() => {
    useI18n.getState().setLang("ko");
  });

  it("장애 안내와 기능 이름, 조작 버튼을 영어로 보여 준다", () => {
    useI18n.getState().setLang("en");
    renderBanner(false);
    const status = screen.getByRole("status");

    expect(status.textContent).toContain("Some online features are temporarily unavailable.");
    expect(status.textContent).toContain("Community browsing · Cloud save are limited.");
    expect(status.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Status details" }).getAttribute("href")).toBe("/status");
  });

  it("연결 준비 안내도 영어로 보여 준다", () => {
    useI18n.getState().setLang("en");
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
    renderBanner(false);
    const notice = screen.getByRole("status");

    expect(notice.textContent).toContain("Connecting online features.");
    expect(notice.textContent).not.toMatch(/[가-힣]/u);
  });
});

describe("연결 준비 칩의 자리", () => {
  const property = "--service-status-overlay-clearance";

  beforeEach(() => {
    mocks.state = { ...mocks.state, report: null, warmingUp: true };
  });

  it("알림 열(왼쪽 아래)의 맨 아래 칸에 놓이고 휴대폰에서는 조작 열을 비켜 한 줄 칩이 된다", () => {
    renderBanner(false);
    const chip = screen.getByRole("status");

    expect(chip.className).toContain("left-4");
    expect(chip.className).not.toContain("left-1/2");
    // 휴대폰: 하단 탭 위 기준선, 오른쪽 조작 열 폭만큼 줄임, 두 번째 문장은 화면 읽기 전용.
    expect(chip.className).toContain("max-md:bottom-[max(var(--site-float-base),");
    expect(chip.className).toContain("max-md:left-3");
    expect(chip.className).toContain("max-md:max-w-[calc(100vw-0.75rem-max(0.75rem,var(--site-float-column)))]");
    expect(screen.getByText("탐색과 로컬 작업은 지금 바로 할 수 있어요.").className).toContain("max-md:sr-only");
  });

  it("점유 높이를 게시해 그 위의 OST·베타 안내가 칩을 가리지 않게 하고, 사라지면 거둔다", () => {
    const view = renderBanner(false);
    const chip = screen.getByRole("status");
    chip.style.position = "fixed";
    const bounds = vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 700, 240, 34));

    fireEvent(window, new Event("resize"));
    expect(document.documentElement.style.getPropertyValue(property)).toBe(`${window.innerHeight - 700 + 12}px`);

    view.unmount();
    expect(document.documentElement.style.getPropertyValue(property)).toBe("");
    bounds.mockRestore();
  });
});
