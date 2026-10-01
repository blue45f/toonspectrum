// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringFieldNotesPage } from "./EngineeringFieldNotesPage";
import { EngineeringGuidesPage } from "./EngineeringGuidesPage";
import { EngineeringLicensesPage } from "./EngineeringLicensesPage";
import { EngineeringReferencesPage } from "./EngineeringReferencesPage";
import { EngineeringStoryPage } from "./EngineeringStoryPage";
import { EngineeringVideosPage } from "./EngineeringVideosPage";
import { ENGINEERING_FIELD_NOTES, ENGINEERING_TROUBLESHOOTING_CASES as FIELD_INCIDENTS } from "./engineering-field-notes-content";
import { ENGINEERING_REUSE_BLUEPRINTS } from "./engineering-playbook-content";
import { ENGINEERING_TROUBLESHOOTING_CASES as ARCHIVE_INCIDENTS } from "./engineering-story-deep-dive-content";
import { PUBLISHED_ENGINEERING_CHAPTERS, PUBLISHED_ENGINEERING_GUIDES } from "./engineering-story-published-content";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
});

function renderAt(path: string, page: ReactElement) {
  window.history.replaceState(null, "", path);
  const url = new URL(path, "http://localhost");
  return render(<MemoryRouter initialEntries={[`${url.pathname}${url.search}`]}>{page}</MemoryRouter>);
}

/** 넓은 화면·좁은 화면 목차가 모두 DOM에 있으므로 첫 번째 목차를 기준으로 본다. */
function firstToc(name: RegExp): HTMLElement {
  const [toc] = screen.getAllByRole("navigation", { name });
  if (!toc) throw new Error(`table of contents not found: ${String(name)}`);
  return toc;
}

function expectTocTargetsExist(toc: HTMLElement): number {
  const links = within(toc).getAllByRole("link");
  for (const link of links) {
    const target = link.getAttribute("href")?.slice(1) ?? "";
    expect(document.getElementById(target), target).not.toBeNull();
  }
  return links.length;
}

function expectCurrentTechPage(label: RegExp): void {
  const techNav = screen.getByRole("navigation", { name: /기술 문서 메뉴|Engineering documents/u });
  expect(within(techNav).getByRole("link", { name: label }).getAttribute("aria-current")).toBe("page");
  const aboutNav = screen.getByRole("navigation", { name: /ToonStudio 소개 메뉴|ToonStudio introduction/u });
  expect(within(aboutNav).getByRole("link", { name: /기술과 신뢰|Technology & trust/u }).getAttribute("aria-current")).toBe("location");
}

describe("제작 스토리", () => {
  it("31개 챕터를 주제 그룹과 스크롤 목차로 보여주고 다음 단계로 이어진다", () => {
    renderAt("/about/technology/story", <EngineeringStoryPage />);

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expectCurrentTechPage(/제작 스토리|Story/u);
    expect(screen.getByRole("heading", { level: 2, name: /핵심 요약|Key summary/u })).toBeTruthy();
    expect(document.querySelectorAll("article[id]")).toHaveLength(PUBLISHED_ENGINEERING_CHAPTERS.length);
    expect(expectTocTargetsExist(firstToc(/기술 스토리 목차|Engineering story table of contents/u))).toBe(PUBLISHED_ENGINEERING_CHAPTERS.length);

    const pager = screen.getByRole("navigation", { name: /기술 문서 이어보기|Continue through/u });
    expect(within(pager).getByRole("link", { name: /다음 단계.*플레이북|Next step.*Playbook/u }).getAttribute("href"))
      .toBe("/about/technology/playbook");
  });

  it("세부 내용은 접혀 있고 모두 펼치기·모두 접기로 한 번에 바꾼다", () => {
    renderAt("/about/technology/story", <EngineeringStoryPage />);
    const disclosures = [...document.querySelectorAll<HTMLDetailsElement>("details[data-eng-disclosure]")];
    expect(disclosures).toHaveLength(PUBLISHED_ENGINEERING_CHAPTERS.length);
    expect(disclosures.every((element) => !element.open)).toBe(true);

    const [expandAll] = screen.getAllByRole("button", { name: /모두 펼치기|Expand all/u });
    if (!expandAll) throw new Error("expand-all button is missing");
    fireEvent.click(expandAll);
    expect(disclosures.every((element) => element.open)).toBe(true);

    const [collapseAll] = screen.getAllByRole("button", { name: /모두 접기|Collapse all/u });
    if (!collapseAll) throw new Error("collapse-all button is missing");
    fireEvent.click(collapseAll);
    expect(disclosures.every((element) => !element.open)).toBe(true);
  });

  it("챕터 링크로 들어오면 해당 챕터의 근거를 펼쳐 둔다", () => {
    renderAt("/about/technology/story#brush-engine", <EngineeringStoryPage />);
    expect(document.querySelector<HTMLDetailsElement>("#brush-engine details[data-eng-disclosure]")?.open).toBe(true);
    expect(document.querySelector<HTMLDetailsElement>("#architecture details[data-eng-disclosure]")?.open).toBe(false);
  });
});

describe("적용 가이드", () => {
  it("재사용 청사진부터 시작하고 상태 필터에 맞춰 가이드와 목차를 줄인다", () => {
    renderAt("/about/technology/guides", <EngineeringGuidesPage />);

    expectCurrentTechPage(/적용 가이드|Guides/u);
    const blueprints = document.getElementById("blueprints");
    if (!blueprints) throw new Error("blueprints section is missing");
    expect(within(blueprints).getAllByRole("heading", { level: 3 })).toHaveLength(ENGINEERING_REUSE_BLUEPRINTS.length);
    expect(screen.getByRole("heading", { name: /Toss 인증|Toss authentication/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /CI와 선택형 Testifly 포털|CI with an optional Testifly portal/u })).toBeTruthy();

    const liveFilter = screen.getByRole("button", { name: /^운영$|^Live$/u });
    fireEvent.click(liveFilter);
    expect(liveFilter.getAttribute("aria-pressed")).toBe("true");
    const live = PUBLISHED_ENGINEERING_GUIDES.filter((guide) => guide.status === "live");
    expect(screen.getByText(new RegExp(`${String(live.length)}개 / 전체 ${String(PUBLISHED_ENGINEERING_GUIDES.length)}개 가이드`, "u"))).toBeTruthy();
    expect(screen.getByRole("heading", { name: /성능 예산|Performance budget/u })).toBeTruthy();
    // 청사진 + 가이드 + 경계
    expect(expectTocTargetsExist(firstToc(/적용 가이드 목차|Implementation guide contents/u))).toBe(live.length + 2);
  });
});

describe("심화 노트", () => {
  it("노트를 분야·검색으로 좁히고, 장애·교훈 기록을 같은 페이지에서 제공한다", () => {
    renderAt("/about/technology/field-notes", <EngineeringFieldNotesPage />);

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expectCurrentTechPage(/심화 노트|Field notes/u);
    expect(document.querySelectorAll("[data-engineering-field-note]")).toHaveLength(ENGINEERING_FIELD_NOTES.length);
    expect(screen.getByRole("heading", { name: /Open API마다|Rights, provenance/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /실패를 숨기지 않고|Failures converted/u })).toBeTruthy();
    const incidents = [...document.querySelectorAll("#incidents details[data-eng-disclosure]")];
    expect(incidents).toHaveLength(FIELD_INCIDENTS.length + ARCHIVE_INCIDENTS.length);
    expect(new Set(incidents.map((incident) => incident.id)).size).toBe(incidents.length);
    expect(document.getElementById("service-worker-update-race")).not.toBeNull();
    expect(screen.getByRole("link", { name: /참고한 제품 보기|See reference products/u }).getAttribute("href"))
      .toBe("/about/technology/references#reference-products");

    const threeDFilter = screen.getByRole("button", { name: /^Blender · 3D$/u });
    fireEvent.click(threeDFilter);
    expect(threeDFilter.getAttribute("aria-pressed")).toBe("true");
    const threeD = ENGINEERING_FIELD_NOTES.filter((note) => note.category === "three-d-dcc").length;
    expect(document.querySelectorAll('[data-engineering-field-note="three-d-dcc"]')).toHaveLength(threeD);
    expect(document.querySelectorAll("[data-engineering-field-note]")).toHaveLength(threeD);

    fireEvent.click(screen.getByRole("button", { name: /^전체$|^All$/u }));
    fireEvent.change(screen.getByRole("searchbox", { name: /기술 노트 검색|Search field notes/u }), { target: { value: "MediaPipe" } });
    expect(document.querySelectorAll('[data-engineering-field-note-id="browser-local-ai"]')).toHaveLength(1);
    expect(document.querySelectorAll("[data-engineering-field-note]")).toHaveLength(1);
    expect(screen.getByText(new RegExp(`1개 / 전체 ${String(ENGINEERING_FIELD_NOTES.length)}개 노트`, "u"))).toBeTruthy();
  });

  it("장애 기록 링크로 들어오면 그 기록을 펼친다", () => {
    renderAt("/about/technology/field-notes#service-worker-update-race", <EngineeringFieldNotesPage />);
    const incident = document.getElementById("service-worker-update-race");
    expect(incident instanceof HTMLDetailsElement && incident.open).toBe(true);
  });
});

describe("참고 자료", () => {
  it("사용·평가·참고 관계를 검색하고, 참고 제품을 모아 보여준다", () => {
    renderAt("/about/technology/references", <EngineeringReferencesPage />);

    expectCurrentTechPage(/참고 자료|References/u);
    expect(document.querySelectorAll("[data-reference-card]").length).toBeGreaterThanOrEqual(10);
    expect(document.getElementById("reference-products")).not.toBeNull();
    expect(screen.getByRole("heading", { name: /참고한 제품과 실제로 채택한 패턴|Reference products, applied patterns/u })).toBeTruthy();
    expect(screen.getByRole("link", { name: /심화 노트의 장애 기록|field-notes incident log/u }).getAttribute("href"))
      .toBe("/about/technology/field-notes#incidents");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Blender MCP" } });
    expect(screen.getByRole("heading", { name: "Blender MCP" })).toBeTruthy();
    expect(document.querySelectorAll("[data-reference-card]")).toHaveLength(1);
  });
});

describe("영상·라이선스", () => {
  it("영상 페이지는 같은 장면 원본과 영상 구성안을 함께 보여준다", () => {
    renderAt("/about/technology/videos", <EngineeringVideosPage />);
    expectCurrentTechPage(/영상|Video/u);
    expect(screen.getByRole("heading", { level: 1, name: /서비스 설명, 발표 화면|Service copy, presentation screens/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /검토 가능한 렌더 파이프라인|Reviewable render pipeline/u })).toBeTruthy();
    expect(document.querySelector('[aria-labelledby="storyboard-title"] ol')?.children).toHaveLength(12);
    const treatments = document.getElementById("film-treatments");
    if (!treatments) throw new Error("film treatments section is missing");
    expect(within(treatments).getAllByRole("heading", { level: 3 })).toHaveLength(4);
  });

  it("라이선스 페이지는 사용 기술과 권리 계층을 보여준다", () => {
    renderAt("/about/technology/licenses", <EngineeringLicensesPage />);
    expectCurrentTechPage(/라이선스|Licenses/u);
    expect(screen.getByRole("heading", { level: 1, name: /라이선스|Licensing/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /사용한 기술|Document what each technology/u })).toBeTruthy();
  });
});
