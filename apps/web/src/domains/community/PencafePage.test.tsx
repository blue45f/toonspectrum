// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { PencafePage } from "./PencafePage";

const mocks = vi.hoisted(() => ({ crashFeed: false }));

vi.mock("@/shared/components/fan-cafe-panel", () => ({
  FanCafePanel: () => {
    if (mocks.crashFeed) throw new Error("feed crashed");
    return <div data-testid="fan-cafe-panel" />;
  },
}));

vi.mock("@/shared/components/share-page-button", () => ({
  SharePageButton: (props: {
    path: string;
    text: string;
    label?: string;
    actionLabel?: string;
  }) => (
    <output
      data-testid="share-probe"
      data-path={props.path}
      data-title={props.text}
      data-label={props.label}
      data-action-label={props.actionLabel}
    />
  ),
}));

beforeEach(() => {
  mocks.crashFeed = false;
});
afterEach(cleanup);

function renderPage(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/pencafe/:name" element={<PencafePage />} />
        <Route path="/community/pencafe" element={<PencafePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PencafePage", () => {
  it("shares the public fan cafe with an encoded canonical route", async () => {
    renderPage("/pencafe/%EC%9B%B9%ED%88%B0%20%EC%97%B0%EA%B5%AC%ED%9A%8C");

    expect(screen.getByRole("heading", { name: "웹툰 연구회 펜카페" })).toBeTruthy();
    const share = await screen.findByTestId("share-probe");
    expect(share.getAttribute("data-path"))
      .toBe("/pencafe/%EC%9B%B9%ED%88%B0%20%EC%97%B0%EA%B5%AC%ED%9A%8C");
    expect(share.getAttribute("data-title")).toBe("웹툰 연구회 펜카페");
    expect(share.getAttribute("data-label")).toBe("펜카페 공유");
    expect(share.getAttribute("data-action-label")).toBe("펜카페 보기");
  });

  it("shows a page-level error fallback with retry when the feed crashes", async () => {
    mocks.crashFeed = true;
    // 에러 바운더리의 console.error 노이즈를 테스트 출력에서 숨긴다.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      renderPage("/pencafe/%EC%9B%B9%ED%88%B0%20%EC%97%B0%EA%B5%AC%ED%9A%8C");

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("펜카페 피드를 불러오지 못했습니다.");
      expect(screen.queryByTestId("fan-cafe-panel")).toBeNull();

      mocks.crashFeed = false;
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
      expect(await screen.findByTestId("fan-cafe-panel")).toBeTruthy();
    } finally {
      consoleError.mockRestore();
    }
  });
});
