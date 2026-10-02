// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HelpCenterPage } from "./HelpCenterPage";

vi.mock("./BrowserReadinessDiagnostics", () => ({ BrowserReadinessDiagnostics: () => <div data-testid="diagnostics" /> }));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/shared/components/site-experience/WorkflowIllustration", () => ({
  WorkflowIllustration: () => <span data-testid="workflow-illustration" />,
}));

function renderHelp() {
  return render(
    <MemoryRouter initialEntries={["/help"]}>
      <HelpCenterPage />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

function topicLinks() {
  return screen.getAllByRole("link", { name: /관련 화면 열기/ });
}

describe("HelpCenterPage", () => {
  it("lists every help topic, including a path to the full site directory", () => {
    renderHelp();
    expect(screen.getByRole("heading", { level: 1, name: "막힌 곳을 풀고, 다음 컷으로." })).toBeTruthy();
    expect(topicLinks()).toHaveLength(8);
    expect(screen.getByRole("link", { name: /전체 기능 찾기/ }).getAttribute("href")).toBe("/sitemap");
    expect(screen.getByRole("link", { name: /처음 시작하기/ }).getAttribute("href")).toBe("/studio/new");
  });

  it("filters topics by Korean or English keywords and from the popular chips", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "라이선스" } });
    expect(topicLinks().map((link) => link.getAttribute("href"))).toEqual(["/market"]);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "backup" } });
    expect(topicLinks().map((link) => link.getAttribute("href"))).toEqual(["/studio"]);

    fireEvent.click(screen.getByRole("button", { name: "말풍선" }));
    expect(screen.getByRole("button", { name: "말풍선" }).getAttribute("aria-pressed")).toBe("true");
    expect(topicLinks().map((link) => link.getAttribute("href"))).toEqual(["/studio/manual"]);
  });

  it.each([
    ["저장이 안 돼요", "/studio"],
    ["말풍선", "/studio/manual"],
    ["에셋 라이선스", "/market"],
  ])("returns results for the search box example %j", (query, href) => {
    renderHelp();
    const searchbox = screen.getByRole("searchbox");
    // 입력칸 예시 문구가 실제로 검색 결과를 낸다.
    expect(searchbox.getAttribute("placeholder")).toContain(query);
    fireEvent.change(searchbox, { target: { value: query } });
    expect(topicLinks().map((link) => link.getAttribute("href"))).toContain(href);
    expect(screen.queryByText("일치하는 주제를 찾지 못했습니다.")).toBeNull();
  });

  it.each([
    ["로그인이 안 돼요", "/settings"],
    ["브러시가 안 보여요", "/studio/manual"],
    ["speech balloon", "/studio/manual"],
  ])("understands problem sentences such as %j", (query, href) => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: query } });
    expect(topicLinks()[0]?.getAttribute("href")).toBe(href);
  });

  it("searches the FAQ too and expands the matching questions", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "로그인이 안 돼요" } });
    const question = screen.getByText("로그인이 안 되면 어떻게 하나요?").closest("details");
    expect(question?.hasAttribute("open")).toBe(true);
    expect(screen.queryByText("웹툰 작업은 어디서 시작하나요?")).toBeNull();
  });

  it("adds related screens from the site directory without repeating topic cards", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "서비스 상태" } });
    const heading = screen.getByRole("heading", { level: 3, name: "관련 화면" });
    const cards = heading.parentElement?.querySelectorAll("a[data-site-link-card]") ?? [];
    const hrefs = [...cards].map((card) => card.getAttribute("href"));
    expect(hrefs).toContain("/status");
    const topicHrefs = screen.queryAllByRole("link", { name: /관련 화면 열기/ }).map((link) => link.getAttribute("href"));
    expect(hrefs.some((href) => topicHrefs.includes(href))).toBe(false);
    // 주제가 하나도 맞지 않아도 막다른 빈 상태 대신 관련 화면으로 안내한다.
    expect(screen.queryByText("일치하는 주제를 찾지 못했습니다.")).toBeNull();
  });

  it("offers a way out when nothing matches", () => {
    renderHelp();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "존재하지않는주제" } });
    expect(screen.getByText("일치하는 주제를 찾지 못했습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(topicLinks()).toHaveLength(8);
  });

  it("shows the topics as icon-and-name tiles and keeps the self-diagnostics after the FAQ", () => {
    renderHelp();
    const tiles = document.querySelectorAll('a[data-site-link-card="tile"]');
    expect(tiles).toHaveLength(8);
    const faq = screen.getByText("작업을 시작하기 전에");
    const diagnostics = screen.getByTestId("diagnostics");
    expect(faq.compareDocumentPosition(diagnostics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

