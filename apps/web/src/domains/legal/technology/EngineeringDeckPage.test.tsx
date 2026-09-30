// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringDeckPage } from "./EngineeringDeckPage";
import { SEMINAR_LESSONS } from "./engineering-seminar-curriculum";
import { TALK_SLIDES } from "./engineering-talk-deck";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderDeck(path = "/about/technology/deck") {
  window.history.replaceState(null, "", path);
  const url = new URL(path, "http://localhost");
  return render(
    <MemoryRouter initialEntries={[`${url.pathname}${url.search}`]}>
      <EngineeringDeckPage />
    </MemoryRouter>,
  );
}

/** 페이지 안 미리보기 무대의 현재 슬라이드 id. */
function stageSlideId(): string | null | undefined {
  return document.querySelector('[data-engineering-deck-shell] [data-deck-stage] [data-deck-slide]')?.getAttribute("data-slide-id");
}

function pageSelect(): HTMLSelectElement {
  const shell = document.querySelector<HTMLElement>("[data-engineering-deck-shell]");
  if (!shell) throw new Error("deck shell is missing");
  const select = within(shell).getByRole("combobox", { name: /발표 슬라이드 선택|Select presentation slide/u });
  if (!(select instanceof HTMLSelectElement)) throw new Error("slide select is missing");
  return select;
}

function key(value: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document, { key: value, ...init });
}

describe("발표 모드 기본 화면", () => {
  it("세미나 발표(19장·30분)를 기본으로 열고 버튼·키보드로 넘기며 #slide-n 주소를 맞춘다", () => {
    renderDeck();

    const select = pageSelect();
    expect(select.options).toHaveLength(TALK_SLIDES.length);
    expect(stageSlideId()).toBe(TALK_SLIDES[0]?.id);
    const previous = screen.getByRole("button", { name: /^이전$|^Previous$/u });
    expect(previous.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /^다음$|^Next$/u }));
    expect(stageSlideId()).toBe(TALK_SLIDES[1]?.id);
    expect(window.location.search).toBe("?track=talk");
    expect(window.location.hash).toBe("#slide-2");

    key("ArrowRight");
    key("PageDown");
    expect(select.value).toBe("3");
    key(" ", { shiftKey: true });
    expect(select.value).toBe("2");
    key("End");
    expect(stageSlideId()).toBe(TALK_SLIDES.at(-1)?.id);
    key("Home");
    expect(stageSlideId()).toBe(TALK_SLIDES[0]?.id);
    expect(previous.hasAttribute("disabled")).toBe(true);
  });

  it("숫자 입력 후 Enter로 해당 번호 슬라이드로 이동한다", () => {
    renderDeck();
    key("1");
    key("2");
    expect(screen.getByText(/12번으로 이동: Enter|Go to 12: Enter/u)).toBeTruthy();
    key("Enter");
    expect(stageSlideId()).toBe(TALK_SLIDES[11]?.id);
    expect(window.location.hash).toBe("#slide-12");
  });

  it("버튼에 포커스가 있으면 Space는 버튼 동작으로 남긴다", () => {
    renderDeck();
    const notes = screen.getAllByRole("button", { name: /발표자 노트|Speaker notes/u })[0];
    if (!notes) throw new Error("speaker notes toggle is missing");
    notes.focus();
    fireEvent.keyDown(notes, { key: " " });
    expect(stageSlideId()).toBe(TALK_SLIDES[0]?.id);
  });

  it("예전 링크(?audience=seminar#deck=seminar:9)를 새 주소로 바꿔 같은 위치를 연다", () => {
    renderDeck("/about/technology/deck?audience=seminar&duration=30#deck=seminar:9");
    expect(stageSlideId()).toBe(TALK_SLIDES[8]?.id);
    expect(window.location.search).toBe("?track=talk");
    expect(window.location.hash).toBe("#slide-9");
  });

  it("트랙을 바꾸면 첫 슬라이드부터 해당 트랙을 보여주고 발표 준비실은 세미나 트랙에만 둔다", () => {
    renderDeck();
    expect(screen.getByRole("heading", { name: /리허설에 필요한 세 가지|Three things to rehearse/u })).toBeTruthy();

    const trackGroup = screen.getByRole("group", { name: /발표 트랙|Presentation track/u });
    const lecture = within(trackGroup).getByRole("button", { name: /심화 강의|Deep lecture/u });
    fireEvent.click(lecture);
    expect(lecture.getAttribute("aria-pressed")).toBe("true");
    expect(pageSelect().options).toHaveLength(SEMINAR_LESSONS.length);
    expect(stageSlideId()).toBe(SEMINAR_LESSONS[0]?.id);
    expect(window.location.search).toBe("?track=lecture");
    expect(screen.queryByRole("heading", { name: /리허설에 필요한 세 가지|Three things to rehearse/u })).toBeNull();
  });

  it("발표자 패널은 노트·구간 예산·다음 슬라이드를 보여주고 타이머를 조작한다", () => {
    renderDeck("/about/technology/deck?track=talk#slide-3");
    const panel = screen.getByRole("region", { name: /발표자 도구|Presenter tools/u });
    const firstNoteLine = TALK_SLIDES[2]?.notes.ko.split("\n")[0] ?? "";
    expect(panel.textContent).toContain(firstNoteLine);
    // 문제 정의 구간 = 표지 45초 + 목차 45초 + 문제 90초
    expect(panel.textContent).toMatch(/예산 03:00|Budget 03:00/u);
    const nextTitle = TALK_SLIDES[3]?.title.ko ?? "";
    expect(within(panel).getByRole("button", { name: (name) => name === `다음 슬라이드로 이동: ${nextTitle}` })).toBeTruthy();

    const start = within(panel).getByRole("button", { name: /타이머 시작|Start timer/u });
    fireEvent.click(start);
    expect(within(panel).getByRole("button", { name: /타이머 일시정지|Pause timer/u })).toBeTruthy();
    expect(sessionStorage.getItem("toonstudio-engineering-deck-timer")).toContain("startedAt");
  });

  it("개요(O)에서 슬라이드를 골라 이동한다", () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    renderDeck();
    key("o");
    const overview = screen.getByRole("region", { name: /슬라이드 개요|Slide overview/u });
    const items = within(overview).getAllByRole("button").filter((button) => button.classList.contains("deck-overview__item"));
    expect(items).toHaveLength(TALK_SLIDES.length);
    const fifth = items[4];
    if (!fifth) throw new Error("overview item is missing");
    fireEvent.click(fifth);
    expect(stageSlideId()).toBe(TALK_SLIDES[4]?.id);
    expect(screen.queryByRole("region", { name: /슬라이드 개요|Slide overview/u })).toBeNull();
  });
});

describe("발표 화면", () => {
  it("발표 시작 시 전체 화면 발표 레이어를 열고 블랙아웃·노트·Esc를 지원한다", () => {
    renderDeck();
    const startButton = screen.getByRole("button", { name: /발표 시작|Start presenting/u });
    fireEvent.click(startButton);

    const dialog = screen.getByRole("dialog", { name: /기술 발표 화면|Engineering presentation/u });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.querySelector(".deck-present__stage [data-deck-slide]")?.getAttribute("data-slide-id")).toBe(TALK_SLIDES[0]?.id);

    key("ArrowRight");
    expect(dialog.querySelector(".deck-present__stage [data-deck-slide]")?.getAttribute("data-slide-id")).toBe(TALK_SLIDES[1]?.id);

    key("b");
    expect(within(dialog).getByRole("button", { name: /블랙아웃 해제|End blackout/u })).toBeTruthy();
    // 블랙아웃 중 첫 키는 화면만 되돌리고 슬라이드는 넘기지 않는다.
    key("ArrowRight");
    expect(within(dialog).queryByRole("button", { name: /블랙아웃 해제|End blackout/u })).toBeNull();
    expect(dialog.querySelector(".deck-present__stage [data-deck-slide]")?.getAttribute("data-slide-id")).toBe(TALK_SLIDES[1]?.id);

    key("n");
    expect(within(dialog).getByRole("region", { name: /발표자 도구|Presenter tools/u })).toBeTruthy();

    key("Escape");
    expect(screen.queryByRole("dialog", { name: /기술 발표 화면|Engineering presentation/u })).toBeNull();
    expect(stageSlideId()).toBe(TALK_SLIDES[1]?.id);
  });

  it("?view=presenter는 발표자 창(노트·다음 슬라이드·타이머)으로 열린다", () => {
    renderDeck("/about/technology/deck?track=talk&view=presenter#slide-3");
    const presenter = screen.getByRole("dialog", { name: /발표자 화면|Presenter view/u });
    expect(presenter.querySelector(".deck-present__stage [data-deck-slide]")?.getAttribute("data-slide-id")).toBe(TALK_SLIDES[2]?.id);
    expect(presenter.textContent).toContain(TALK_SLIDES[2]?.notes.ko.split("\n")[0] ?? "");
    expect(within(presenter).getByRole("timer", { name: /발표 경과 시간|Talk elapsed time/u })).toBeTruthy();
    expect(window.location.search).toBe("?track=talk&view=presenter");
  });
});

describe("발표 보조 도구", () => {
  it("오프라인 발표본을 현재 트랙 이름으로 내려받는다", () => {
    const createObjectURL = vi.fn(() => "blob:deck");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function recordDownload(this: HTMLAnchorElement) {
      expect(this.download).toBe("toonstudio-talk-deck.html");
    });

    renderDeck();
    fireEvent.click(screen.getByRole("button", { name: /오프라인 발표본|Offline deck/u }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/오프라인 발표본을 만들었습니다|Offline deck created/u)).toBeTruthy();
  });

  it("팝업이 막히면 발표자 창을 열 수 없다고 알려 준다", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    renderDeck("/about/technology/deck?track=talk#slide-4");
    fireEvent.click(screen.getByRole("button", { name: /발표자 창 열기|Open presenter window/u }));
    expect(window.open).toHaveBeenCalledWith(
      "/about/technology/deck?track=talk&view=presenter#slide-4",
      "toonstudio-deck-presenter",
      expect.stringContaining("popup"),
    );
    expect(screen.getByText(/팝업이 차단되었습니다|popup was blocked/u)).toBeTruthy();
  });

  it("인쇄용 전체 슬라이드는 화면 낭독에서 숨긴다", () => {
    renderDeck();
    const printDeck = document.querySelector("[data-engineering-print-deck]");
    expect(printDeck?.getAttribute("aria-hidden")).toBe("true");
    expect(printDeck?.querySelectorAll("[data-deck-slide]")).toHaveLength(TALK_SLIDES.length);
  });
});
