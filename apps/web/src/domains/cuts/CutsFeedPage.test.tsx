// @vitest-environment jsdom
/**
 * 컷츠 피드 준비 상태 테스트 —
 * 저장소 하이드레이션·시드 확인 전에는 빈 상태를 그리지 않고 로딩을 보여주고,
 * 준비가 끝나면 시드 클립 피드가 열리는지 검증한다.
 */
import "fake-indexeddb/auto";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CutsFeedPage } from "./CutsFeedPage";

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CutsFeedPage 준비 상태", () => {
  it("하이드레이션 전에는 빈 상태 대신 로딩을 보여주고, 준비 후 시드 피드가 열린다", async () => {
    render(
      <MemoryRouter initialEntries={["/cuts"]}>
        <CutsFeedPage />
      </MemoryRouter>,
    );

    // 첫 렌더에서 "클립이 없어요" 빈 상태가 깜빡이면 안 된다.
    expect(screen.queryByText("아직 공개된 클립이 없어요.")).toBeNull();
    expect(screen.getByText("클립을 불러오는 중…")).toBeTruthy();

    // 하이드레이션 + 시드가 끝나면 클립 아이템이 렌더된다.
    await waitFor(() => {
      expect(document.querySelectorAll(".cuts-feed__item").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("클립을 불러오는 중…")).toBeNull();
    expect(screen.queryByText("아직 공개된 클립이 없어요.")).toBeNull();
  });
});
