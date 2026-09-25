// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FanCafePanel } from "./fan-cafe-panel";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  state: { userId: null as string | null, sessionToken: null as string | null },
}));

vi.mock("@/platform/api", () => ({
  api: { get: mocks.get, post: vi.fn() },
  getApiErrorMessage: async () =>
    "일부 온라인 기능을 일시적으로 사용할 수 없습니다.",
}));
vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));
vi.mock("@/shared/hooks/use-celebrate", () => ({ useCelebrate: () => vi.fn() }));
vi.mock("@/shared/components/spatial-campus/CampusObjectSource", () => ({
  CampusObjectSource: () => null,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/community"]}>
      <FanCafePanel scope="all" targetLabel="통합" />
    </MemoryRouter>,
  );
}

describe("FanCafePanel outage states", () => {
  it("shows a load failure without claiming there are no posts", async () => {
    mocks.get.mockRejectedValueOnce(new Error("unavailable"));

    renderPanel();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("현재 글이 없다는 뜻은 아닙니다");
    expect(screen.queryByText("아직 팬카페 글이 없습니다.")).toBeNull();
    expect(within(alert).getByRole("button")).toBeTruthy();
  });

  it("shows the true empty state only after a successful empty response", async () => {
    mocks.get.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("첫 대화를 기다리고 있습니다")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
