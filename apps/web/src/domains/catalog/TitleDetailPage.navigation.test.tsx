// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TitleDetailBreadcrumb } from "./TitleDetailBreadcrumb";
import { TitleDetailPage } from "./TitleDetailPage";

import { useI18n } from "@/shared/lib/i18n-core";

const resource = vi.hoisted(() => ({ loading: true, error: null as string | null, notFound: false }));
vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({ ...resource, data: null, reload: vi.fn() }),
}));
vi.mock("@/platform/environment/use-app-config", () => ({ useAppConfig: () => ({ showSynopsis: true }) }));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(), useJsonLd: vi.fn(), useMetaDescription: vi.fn(),
  useMetaRobots: vi.fn(), usePageSocialMeta: vi.fn(),
}));

const initialLanguage = useI18n.getState().lang;
afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

describe("작품 상세에서 목록 복귀", () => {
  it.each([
    ["ko", "작품 목록", "작품 탐색 경로"],
    ["en", "Story list", "Story navigation"],
  ])("%s에서 현재 작품을 알리고 직접 방문해도 목록으로 이동한다", (lang, label, name) => {
    useI18n.setState({ lang });
    render(<MemoryRouter initialEntries={["/title/direct-visit"]}>
      <Routes>
        <Route path="/title/:slug" element={<TitleDetailBreadcrumb title="아주 긴 제목을 가진 작품의 다음 이야기" />} />
        <Route path="/explore" element={<h1>탐색 목록 도착</h1>} />
      </Routes>
    </MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name });
    expect(navigation.querySelector('[aria-current="page"]')?.textContent).toBe("아주 긴 제목을 가진 작품의 다음 이야기");
    const link = within(navigation).getByRole("link", { name: label });
    expect(link.getAttribute("href")).toBe("/explore");
    fireEvent.click(link);
    expect(screen.getByRole("heading", { name: "탐색 목록 도착" })).toBeTruthy();
  });

  it.each([
    [true, null, false],
    [false, "상세 조회 실패", false],
    [false, null, true],
  ])("로딩=%s 오류=%s 없는 작품=%s에서도 탐색 경로를 제공한다", (loading, error, notFound) => {
    useI18n.setState({ lang: "ko" });
    Object.assign(resource, { loading, error, notFound });
    render(<MemoryRouter initialEntries={["/title/unavailable"]}><TitleDetailPage /></MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name: "작품 탐색 경로" });
    expect(within(navigation).getByRole("link", { name: "작품 목록" }).getAttribute("href")).toBe("/explore");
    expect(navigation.querySelector('[aria-current="page"]')?.textContent).toBe("작품 상세");
  });
});
