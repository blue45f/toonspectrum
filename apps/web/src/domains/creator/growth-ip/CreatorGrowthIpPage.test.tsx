// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function stepTabs(): HTMLElement {
  return screen.getByRole("tablist", { name: "작업대 단계" });
}

/** 단계 탭을 눌러 그 단계를 연다(한 번에 한 단계만 그려지므로, 다른 단계를 보려면 먼저 열어야 한다). */
function openStep(name: RegExp) {
  fireEvent.click(within(stepTabs()).getByRole("tab", { name }));
}

function chooseAgeBand(value: string) {
  fireEvent.change(within(region(/연령대별 기능 제한/u)).getByLabelText("연령대"), { target: { value } });
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
});

describe("CreatorGrowthIpPage", () => {
  it("성장 여정 순서의 단계 탭을 보여 주고 한 번에 한 단계만 보인다", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "신인 발굴부터 연재·협업·판권 확장까지" })).toBeTruthy();

    const tabs = within(stepTabs()).getAllByRole("tab");
    expect(tabs).toHaveLength(9);
    expect(tabs[0]?.textContent).toContain("연령 정책");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[8]?.textContent).toContain("교육");
    // 선택된 탭만 Tab 순서에 들어가고, 패널은 선택된 탭이 이름을 붙인다.
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0]?.id);

    // 첫 단계만 보이고, 나머지 단계 본문은 숨겨져 화면과 보조기술에 노출되지 않는다.
    expect(region(/연령대별 기능 제한/u)).toBeTruthy();
    expect(screen.queryByRole("region", { name: /해외 어시스트/u })).toBeNull();
    expect(screen.queryByRole("region", { name: /판권·영화화·애니화/u })).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("방향키·Home·End로 단계 탭을 오가고 이전·다음 단계 버튼으로 이어 간다", () => {
    renderPage();
    const tabs = within(stepTabs()).getAllByRole("tab");
    const first = tabs[0];
    if (!first) throw new Error("첫 탭이 없습니다");

    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(within(stepTabs()).getByRole("tab", { selected: true }).textContent).toContain("발굴·지원");
    expect(region(/신인 작가 발굴과 실무 지원/u)).toBeTruthy();

    fireEvent.keyDown(within(stepTabs()).getByRole("tab", { selected: true }), { key: "End" });
    expect(within(stepTabs()).getByRole("tab", { selected: true }).textContent).toContain("교육");
    // 마지막 단계에는 '다음' 대신 '이전'만 있다.
    const footer = screen.getByRole("navigation", { name: "이전·다음 단계" });
    expect(within(footer).queryByRole("button", { name: /^다음/u })).toBeNull();

    fireEvent.click(within(footer).getByRole("button", { name: /^이전 · /u }));
    expect(within(stepTabs()).getByRole("tab", { selected: true }).textContent).toContain("환경·앱 설치");

    fireEvent.keyDown(within(stepTabs()).getByRole("tab", { selected: true }), { key: "Home" });
    expect(within(stepTabs()).getByRole("tab", { selected: true }).textContent).toContain("연령 정책");
    expect(within(screen.getByRole("navigation", { name: "이전·다음 단계" })).queryByRole("button", { name: /^이전/u })).toBeNull();
  });

  it("선택한 단계를 주소 해시에 담고, 해시가 바뀌면 그 단계를 연다", async () => {
    renderPage();
    openStep(/판권/u);
    expect(window.location.hash).toBe("#rights");

    // 본문 안 해시 링크("연령 정책으로 이동")가 해당 단계를 연다.
    fireEvent.click(within(region(/판권·영화화·애니화/u)).getByRole("link", { name: "연령 정책으로 이동" }));
    await waitFor(() => expect(within(stepTabs()).getByRole("tab", { selected: true }).textContent).toContain("연령 정책"));

    act(() => {
      window.location.hash = "#story";
    });
    await waitFor(() => expect(within(stepTabs()).getByRole("tab", { selected: true }).textContent).toContain("시놉시스·웹소설"));
    // 단계가 아닌 해시는 무시한다(해시 이벤트가 도착할 시간을 준 뒤에도 그대로).
    act(() => {
      window.location.hash = "#unknown";
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(within(stepTabs()).getByRole("tab", { selected: true }).textContent).toContain("시놉시스·웹소설");
  });

  it("연령대를 모르면 어시스트·판권 입력을 잠그고 이유를 사람이 읽는 말로 보여 준다", () => {
    renderPage();
    openStep(/어시스트/u);
    const assistants = region(/해외 어시스트/u);
    const addCandidate = within(assistants).getByRole("button", { name: "후보 추가" });
    expect(addCandidate.closest("fieldset")?.disabled).toBe(true);
    expect(within(assistants).getByText("업무 매칭은 연령대 확인 후 사용할 수 있습니다.")).toBeTruthy();

    openStep(/판권/u);
    const rights = region(/판권·영화화·애니화/u);
    expect(within(rights).getByRole("button", { name: "제안 기록" }).closest("fieldset")?.disabled).toBe(true);
    expect(within(rights).getByRole("link", { name: "연령 정책으로 이동" }).getAttribute("href")).toBe("#age");

    // 저장 값(영문 식별자)이 아니라 한국어 선택지로 보인다.
    openStep(/연령 정책/u);
    const ageSelect = within(region(/연령대별 기능 제한/u)).getByLabelText("연령대");
    expect(within(ageSelect).getByRole("option", { name: "만 18세 이상" })).toBeTruthy();
    expect(within(ageSelect).queryByRole("option", { name: "18-plus" })).toBeNull();
  });

  it("성인 연령대에서 후보를 추가하면 그 단계 안에 결과를 알리고, 탭에 쌓인 개수를 보여 주며, 안전하지 않은 링크는 걸지 않는다", () => {
    renderPage();
    chooseAgeBand("18-plus");
    // 머리말의 연령대 바로가기는 지금 연령대를 보여 준다.
    expect(screen.getByRole("button", { name: /연령대: 만 18세 이상/u })).toBeTruthy();

    openStep(/어시스트/u);
    const assistants = region(/해외 어시스트/u);
    fireEvent.change(within(assistants).getByLabelText("후보 이름/식별자"), { target: { value: "Helper" } });
    fireEvent.change(within(assistants).getByLabelText("포트폴리오 주소"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(within(assistants).getByRole("button", { name: "후보 추가" }));

    expect(within(assistants).getByRole("status").textContent).toContain("후보를 소싱 보드에 추가했습니다");
    expect(within(assistants).getByText("Helper")).toBeTruthy();
    expect(within(assistants).getByText(/역할 일치: flat-color/u)).toBeTruthy();
    expect(within(assistants).queryByRole("link", { name: /포트폴리오/u })).toBeNull();
    // 쌓인 항목 수는 탭에 보이고(스크린리더용 문구 포함), 항목이 없는 단계에는 숫자가 없다.
    expect(within(stepTabs()).getByRole("tab", { name: /어시스트.*항목\s*1/u })).toBeTruthy();
    expect(within(stepTabs()).getByRole("tab", { name: "판권" })).toBeTruthy();

    // 다른 단계에는 안내가 뜨지 않는다.
    openStep(/시놉시스/u);
    expect(within(region(/시놉시스와 웹소설/u)).getByRole("status").textContent).toBe("");
  });

  it("입력이 빠지면 누른 버튼이 있는 단계 안에서만 알려 준다", () => {
    renderPage();
    openStep(/시놉시스/u);
    const story = region(/시놉시스와 웹소설/u);
    fireEvent.click(within(story).getByRole("button", { name: "회차 추가" }));
    expect(within(story).getByRole("status").textContent).toBe("회차 제목 또는 요약을 입력하세요.");
    openStep(/음성 대사/u);
    expect(within(region(/음성 대사/u)).getByRole("status").textContent).toBe("");
  });

  it("웹소설 회차를 추가하면 목록과 각색 초안에서 원작 회차 제목을 보여 준다", () => {
    renderPage();
    openStep(/시놉시스/u);
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
    openStep(/판권/u);
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

  it("작업 내용을 이 브라우저에 저장하고, 다른 단계를 다녀와도 유지한다", () => {
    renderPage();
    openStep(/발굴·지원/u);
    const support = region(/신인 작가 발굴과 실무 지원/u);
    fireEvent.change(within(support).getByLabelText("필요한 지원 한 줄 요약"), { target: { value: "첫 연재 계약서 검토" } });
    fireEvent.click(within(support).getByRole("button", { name: "요청 등록" }));
    expect(window.localStorage.getItem(CREATOR_GROWTH_IP_STORAGE_KEY)).toContain("첫 연재 계약서 검토");
    const request = within(support).getByText("첫 연재 계약서 검토").closest("li");
    expect(request?.textContent).toContain("멘토링 · 요청됨");

    openStep(/교육/u);
    openStep(/발굴·지원/u);
    expect(within(region(/신인 작가 발굴과 실무 지원/u)).getByText("첫 연재 계약서 검토")).toBeTruthy();
  });

  it("단계를 오가도 아직 등록하지 않은 입력 초안은 사라지지 않는다", () => {
    renderPage();
    openStep(/발굴·지원/u);
    const summary = within(region(/신인 작가 발굴과 실무 지원/u)).getByLabelText("필요한 지원 한 줄 요약");
    fireEvent.change(summary, { target: { value: "계약서 검토 부탁" } });

    openStep(/교육/u);
    // 다른 단계를 보는 동안 지원 단계 패널은 숨겨질 뿐 사라지지 않는다.
    expect(screen.queryByRole("region", { name: /신인 작가 발굴과 실무 지원/u })).toBeNull();
    expect(document.getElementById("growth-ip-panel-support")?.hasAttribute("hidden")).toBe(true);

    openStep(/발굴·지원/u);
    expect(within(region(/신인 작가 발굴과 실무 지원/u)).getByLabelText("필요한 지원 한 줄 요약")).toHaveProperty("value", "계약서 검토 부탁");
  });

  it("사용 환경과 앱 설치 상태를 내부 상태 값 대신 사람이 읽는 말로 보여 준다", () => {
    renderPage();
    openStep(/환경·앱 설치/u);
    const environment = region(/사용 환경 진단과 앱 설치/u);
    expect(within(environment).getByText("보안 연결(HTTPS)")).toBeTruthy();
    const install = within(environment).getByRole("complementary", { name: "앱 설치 상태" });
    expect(within(install).getByText(/^앱 설치\(PWA\) · /u)).toBeTruthy();
    expect(within(install).getByRole("button", { name: "앱 설치 / 설치 안내" })).toBeTruthy();
    expect(within(install).queryByText(/SW unknown|unavailable/u)).toBeNull();
    expect(within(environment).getByRole("link", { name: "상세 사용 환경 안내" }).getAttribute("href")).toBe("/studio/environment");
  });
});
