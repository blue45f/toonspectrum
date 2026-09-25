// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CafesPage } from "./CafesPage";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getApiErrorMessage: vi.fn(async () =>
    "일부 온라인 기능을 일시적으로 사용할 수 없습니다.",
  ),
  state: { userId: null as string | null, sessionToken: null as string | null },
}));

vi.mock("@/platform/api", () => ({
  api: { get: mocks.get, post: vi.fn() },
  getApiErrorMessage: mocks.getApiErrorMessage,
}));
vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
  useHydrated: () => true,
}));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
}));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);
function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/community/cafes"]}>
      <CafesPage />
    </MemoryRouter>,
  );
}

describe("CafesPage remote-data states", () => {
  it("renders an error without also claiming that the list is empty", async () => {
    mocks.get.mockRejectedValueOnce(new Error("unavailable"));

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("현재 목록이 비어 있다는 뜻은 아닙니다");
    expect(screen.queryByText("조건에 맞는 커뮤니티가 없어요.")).toBeNull();
    expect(screen.getByRole("button", { name: /재시도|다시 시도/u })).toBeTruthy();
  });

  it("renders the empty state only after a successful zero-item response", async () => {
    mocks.get.mockResolvedValueOnce({ items: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("조건에 맞는 커뮤니티가 없어요.")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
