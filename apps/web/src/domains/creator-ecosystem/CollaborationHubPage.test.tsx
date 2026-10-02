// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollaborationHubPage } from "./CollaborationHubPage";

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  apiGet: vi.fn(),
}));

vi.mock("@/platform/api", () => ({
  api: {
    get: mocks.apiGet,
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getApiErrorMessage: async (_cause: unknown, fallback: string) => fallback,
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: string | null }) => unknown) =>
    selector({ userId: mocks.userId }),
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

const CREATOR = {
  userId: "u9",
  name: "별작가",
  avatar: null,
  acceptedTypes: ["goods"],
  acceptUnverified: true,
  note: "굿즈 협업 환영합니다.",
};

function mockApiSuccess() {
  mocks.apiGet.mockImplementation(async (url: string) => {
    if (url === "/creator-ecosystem/collaboration/creators") return { items: [CREATOR] };
    if (url.endsWith("/me/preferences")) {
      return { item: { discoverable: true, acceptedTypes: ["goods"], acceptUnverified: false, note: "" } };
    }
    if (url.endsWith("/me/business-profile")) return { item: null };
    if (url.endsWith("/me/inbox") || url.endsWith("/me/sent")) return { items: [] };
    throw new Error(`unexpected url: ${url}`);
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/ecosystem/collaboration"]}>
      <CollaborationHubPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = null;
  mockApiSuccess();
});

afterEach(cleanup);

describe("협업 허브 페이지", () => {
  it("게스트에게 로그인 안내와 공개 작가 목록을 보여준다", async () => {
    renderPage();
    expect(await screen.findByText("별작가")).toBeTruthy();
    expect(
      screen.getByText(/작가 제안 설정, 기업 인증, 제안 송수신은 로그인 후 사용할 수 있습니다/),
    ).toBeTruthy();
    // 비공개 설정 API는 로그인 전에는 호출하지 않는다
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);
    expect(mocks.apiGet).toHaveBeenCalledWith("/creator-ecosystem/collaboration/creators");
  });

  it("로그인하면 개인 설정까지 불러온다", async () => {
    mocks.userId = "me";
    renderPage();
    expect(await screen.findByText("별작가")).toBeTruthy();
    expect(mocks.apiGet).toHaveBeenCalledWith("/creator-ecosystem/collaboration/me/preferences");
    expect(mocks.apiGet).toHaveBeenCalledWith("/creator-ecosystem/collaboration/me/inbox");
  });

  it("작가 목록을 불러오지 못하면 오류를 알린다", async () => {
    mocks.apiGet.mockRejectedValue(new Error("network down"));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("협업 가능한 작가를 불러오지 못했어요.");
  });
});
