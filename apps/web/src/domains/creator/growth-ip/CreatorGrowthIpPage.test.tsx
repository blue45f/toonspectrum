// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CREATOR_GROWTH_IP_STORAGE_KEY } from "./creator-growth-ip-model";
import { CreatorGrowthIpPage } from "./CreatorGrowthIpPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <CreatorGrowthIpPage />
    </MemoryRouter>,
  );
}

function region(name: RegExp): HTMLElement {
  return screen.getByRole("region", { name });
}

function chooseAgeBand(value: string) {
  fireEvent.change(within(region(/연령대별 기능 제한/u)).getByLabelText("연령대"), { target: { value } });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("CreatorGrowthIpPage", () => {
  it("성장 여정 순서의 목차와 작업 현황을 보여 준다", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "신인 발굴부터 연재·협업·판권 확장까지" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "작업대 섹션" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(9);
    expect(links[0]?.textContent).toContain("연령 정책");
    expect(links[0]?.getAttribute("href")).toBe("#age");
    expect(links[8]?.getAttribute("href")).toBe("#education");
    const summary = region(/내 작업 현황/u);
    expect(within(summary).getByText("발굴 프로필")).toBeTruthy();
    expect(within(summary).getAllByRole("link")).toHaveLength(7);
  });

  it("연령대를 모르면 어시스트·판권 입력을 잠그고 이유를 사람이 읽는 말로 보여 준다", () => {
    renderPage();
    const assistants = region(/해외 어시스트/u);
    const addCandidate = within(assistants).getByRole("button", { name: "후보 추가" });
    expect(addCandidate.closest("fieldset")?.disabled).toBe(true);
    expect(within(assistants).getByText("업무 매칭은 연령대 확인 후 사용할 수 있습니다.")).toBeTruthy();

    const rights = region(/판권·영화화·애니화/u);
    expect(within(rights).getByRole("button", { name: "제안 기록" }).closest("fieldset")?.disabled).toBe(true);
    expect(within(rights).getByRole("link", { name: "연령 정책으로 이동" }).getAttribute("href")).toBe("#age");

    // 저장 값(영문 식별자)이 아니라 한국어 선택지로 보인다.
    const ageSelect = within(region(/연령대별 기능 제한/u)).getByLabelText("연령대");
    expect(within(ageSelect).getByRole("option", { name: "만 18세 이상" })).toBeTruthy();
    expect(within(ageSelect).queryByRole("option", { name: "18-plus" })).toBeNull();
  });

  it("성인 연령대에서 후보를 추가하면 그 섹션 안에 결과를 알리고 안전하지 않은 링크는 걸지 않는다", () => {
    renderPage();
    chooseAgeBand("18-plus");
    expect(screen.getByRole("link", { name: /연령대: 만 18세 이상/u })).toBeTruthy();

    const assistants = region(/해외 어시스트/u);
    fireEvent.change(within(assistants).getByLabelText("후보 이름/식별자"), { target: { value: "Helper" } });
    fireEvent.change(within(assistants).getByLabelText("포트폴리오 주소"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(within(assistants).getByRole("button", { name: "후보 추가" }));

    expect(within(assistants).getByRole("status").textContent).toContain("후보를 소싱 보드에 추가했습니다");
    expect(within(assistants).getByText("Helper")).toBeTruthy();
    expect(within(assistants).getByText(/역할 일치: flat-color/u)).toBeTruthy();
    expect(within(assistants).queryByRole("link", { name: /포트폴리오/u })).toBeNull();
    // 다른 섹션에는 안내가 뜨지 않는다.
    expect(within(region(/시놉시스와 웹소설/u)).getByRole("status").textContent).toBe("");
  });

  it("입력이 빠지면 누른 버튼이 있는 섹션 안에서만 알려 준다", () => {
    renderPage();
    const story = region(/시놉시스와 웹소설/u);
    fireEvent.click(within(story).getByRole("button", { name: "회차 추가" }));
    expect(within(story).getByRole("status").textContent).toBe("회차 제목 또는 요약을 입력하세요.");
    expect(within(region(/음성 대사/u)).getByRole("status").textContent).toBe("");
  });

  it("웹소설 회차를 추가하면 목록과 각색 초안에서 원작 회차 제목을 보여 준다", () => {
    renderPage();
    const story = region(/시놉시스와 웹소설/u);
    for (const title of ["1장", "2장", "3장"]) {
      fireEvent.change(within(story).getByLabelText("회차 제목"), { target: { value: title } });
      fireEvent.click(within(story).getByRole("button", { name: "회차 추가" }));
    }
    expect(within(within(story).getByRole("list", { name: "추가한 회차" })).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(within(story).getByRole("button", { name: "각색 플랜 생성" }));
    expect(within(story).getByText("원작: 1장, 2장")).toBeTruthy();
    expect(within(story).getByText("원작: 3장")).toBeTruthy();
  });

  it("판권 제안의 분야·검토 상태를 한국어로 보여 주고 상태를 바꿀 수 있다", () => {
    renderPage();
    chooseAgeBand("18-plus");
    const rights = region(/판권·영화화·애니화/u);
    fireEvent.change(within(rights).getByLabelText("제안 회사/스튜디오"), { target: { value: "Studio North" } });
    fireEvent.change(within(rights).getByLabelText("제안 범위"), { target: { value: "애니메이션 옵션 2년" } });
    fireEvent.click(within(rights).getByRole("button", { name: "제안 기록" }));

    const item = within(rights).getByText("Studio North").closest("article");
    expect(item).toBeTruthy();
    if (!item) return;
    expect(within(item).getByText("애니메이션")).toBeTruthy();
    const status = within(item).getByLabelText("검토 상태");
    expect(within(status).getByRole("option", { name: "접수" })).toBeTruthy();
    fireEvent.change(status, { target: { value: "needs-counsel" } });
    expect(within(item).getByLabelText("검토 상태")).toHaveProperty("value", "needs-counsel");
  });

  it("작업 내용을 이 브라우저에 저장한다", () => {
    renderPage();
    const support = region(/신인 작가 발굴과 실무 지원/u);
    fireEvent.change(within(support).getByLabelText("필요한 지원 한 줄 요약"), { target: { value: "첫 연재 계약서 검토" } });
    fireEvent.click(within(support).getByRole("button", { name: "요청 등록" }));
    expect(window.localStorage.getItem(CREATOR_GROWTH_IP_STORAGE_KEY)).toContain("첫 연재 계약서 검토");
    const request = within(support).getByText("첫 연재 계약서 검토").closest("li");
    expect(request?.textContent).toContain("멘토링 · 요청됨");
  });

  it("사용 환경과 앱 설치 상태를 내부 상태 값 대신 사람이 읽는 말로 보여 준다", () => {
    renderPage();
    const environment = region(/사용 환경 진단과 앱 설치/u);
    expect(within(environment).getByText("보안 연결(HTTPS)")).toBeTruthy();
    const install = within(environment).getByRole("complementary", { name: "앱 설치 상태" });
    expect(within(install).getByText(/^앱 설치\(PWA\) · /u)).toBeTruthy();
    expect(within(install).getByRole("button", { name: "앱 설치 / 설치 안내" })).toBeTruthy();
    expect(within(install).queryByText(/SW unknown|unavailable/u)).toBeNull();
    expect(within(environment).getByRole("link", { name: "상세 사용 환경 안내" }).getAttribute("href")).toBe("/studio/environment");
  });
});
