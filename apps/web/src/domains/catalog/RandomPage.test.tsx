// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RandomPage } from "./RandomPage";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/platform/api", () => ({ apiFetch: api.fetch }));
vi.mock("@/shared/navigation/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/random"]}>
      <RandomPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.fetch.mockReset();
});

afterEach(() => cleanup());

describe("랜덤 페이지 빈 결과와 오류 분리", () => {
  it("API가 성공했지만 뽑을 작품이 없으면 오류가 아닌 빈 상태로 안내한다", async () => {
    api.fetch.mockResolvedValue(jsonResponse({ slug: null }));

    renderPage();

    expect(await screen.findByText("조건에 맞는 작품이 없어요")).toBeTruthy();
    expect(screen.queryByText(/불러오지 못했어요/u)).toBeNull();
    expect(screen.getByRole("link", { name: "탐색에서 조건 바꾸기" })).toBeTruthy();
  });

  it("API 호출이 실패하면 재시도가 있는 오류 상태로 안내하고, 재시도하면 다시 호출한다", async () => {
    api.fetch.mockResolvedValue(jsonResponse({}, false, 500));

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("랜덤 작품을 불러오지 못했어요");
    expect(screen.queryByText("조건에 맞는 작품이 없어요")).toBeNull();

    fireEvent.click(within(alert).getByRole("button"));
    expect(api.fetch).toHaveBeenCalledTimes(2);
  });
});
