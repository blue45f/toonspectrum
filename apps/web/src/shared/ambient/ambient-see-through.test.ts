// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AMBIENT_SEE_THROUGH_ATTRIBUTE,
  findAmbientSeeThroughLayers,
  keepAmbientSeeThrough,
  markAmbientSeeThroughLayers,
} from "./ambient-see-through";

const PAGE = "rgb(7, 10, 20)";
const PANEL = "rgb(11, 16, 29)";

/** jsdom은 레이아웃이 없어 폭을 data-width로 흉내 낸다. */
function mockWidths() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement) {
    const width = Number(this.dataset.width ?? 0);
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 100, width, height: 100, toJSON: () => ({}) };
  });
}

function build(html: string): HTMLElement {
  document.body.innerHTML = html;
  const main = document.getElementById("main");
  if (!main) throw new Error("main missing");
  return main;
}

function ids(elements: Iterable<HTMLElement>): string[] {
  return [...elements].map((element) => element.id);
}

beforeEach(mockWidths);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("findAmbientSeeThroughLayers", () => {
  it("페이지 바탕과 같은 색을 칠하는 전폭 래퍼만 고르고, 투명한 래퍼는 지나쳐 안쪽을 본다", () => {
    const main = build(`
      <main id="main" data-width="1400" style="background-color: ${PAGE}">
        <div id="stage" data-width="1400" style="background-color: transparent">
          <div id="page" data-width="1400" style="background-color: ${PAGE}; position: relative">
            <section id="card" data-width="600" style="background-color: ${PAGE}"></section>
          </div>
        </div>
      </main>`);
    expect(ids(findAmbientSeeThroughLayers(main, PAGE))).toEqual(["main", "page"]);
  });

  it("다른 색 띠는 그대로 두고 그 안쪽으로도 내려가지 않는다(안쪽을 비우면 띠 색이 드러난다)", () => {
    const main = build(`
      <main id="main" data-width="1400">
        <div id="band" data-width="1400" style="background-color: ${PANEL}">
          <div id="inner" data-width="1400" style="background-color: ${PAGE}"></div>
        </div>
      </main>`);
    expect(findAmbientSeeThroughLayers(main, PAGE)).toEqual([]);
  });

  it("카드·입력창 같은 표면(테두리·둥근 모서리)과 폼 컨트롤은 비우지 않는다", () => {
    const main = build(`
      <main id="main" data-width="400">
        <div id="bordered" data-width="380" style="background-color: ${PAGE}; border-top-width: 1px; border-top-style: solid; border-top-color: rgb(40, 40, 60)"></div>
        <div id="rounded" data-width="380" style="background-color: ${PAGE}; border-top-left-radius: 12px"></div>
        <input id="field" data-width="380" style="background-color: ${PAGE}" />
        <div id="plain" data-width="380" style="background-color: ${PAGE}"></div>
      </main>`);
    expect(ids(findAmbientSeeThroughLayers(main, PAGE))).toEqual(["plain"]);
  });

  it("sticky·fixed·absolute 요소는 스크롤되는 내용을 가릴 수 있어 그대로 둔다", () => {
    const main = build(`
      <main id="main" data-width="1400">
        <nav id="sticky" data-width="1400" style="background-color: ${PAGE}; position: sticky"></nav>
        <div id="cover" data-width="1400" style="background-color: ${PAGE}; position: absolute"></div>
        <div id="fixed" data-width="1400" style="background-color: ${PAGE}; position: fixed"></div>
      </main>`);
    expect(findAmbientSeeThroughLayers(main, PAGE)).toEqual([]);
  });

  it("폭이 기준의 90%보다 좁은 요소는 래퍼로 보지 않는다", () => {
    const main = build(`
      <main id="main" data-width="1000">
        <div id="narrow" data-width="800" style="background-color: ${PAGE}"></div>
        <div id="wide" data-width="950" style="background-color: ${PAGE}"></div>
      </main>`);
    expect(ids(findAmbientSeeThroughLayers(main, PAGE))).toEqual(["wide"]);
  });

  it("display: contents 래퍼는 크기가 없어도 안쪽을 본다", () => {
    const main = build(`
      <main id="main" data-width="1000">
        <div id="contents" style="display: contents">
          <div id="page" data-width="1000" style="background-color: ${PAGE}"></div>
        </div>
      </main>`);
    expect(ids(findAmbientSeeThroughLayers(main, PAGE))).toEqual(["page"]);
  });

  it("페이지 바탕색을 알 수 없으면(투명) 아무것도 고르지 않는다", () => {
    const main = build(`<main id="main" data-width="1000" style="background-color: ${PAGE}"></main>`);
    expect(findAmbientSeeThroughLayers(main, "rgba(0, 0, 0, 0)")).toEqual([]);
  });
});

describe("markAmbientSeeThroughLayers", () => {
  it("이전 표시를 떼고 원래 바탕색으로 다시 판정한다", () => {
    const main = build(`
      <main id="main" data-width="1000">
        <div id="page" data-width="1000" style="background-color: ${PAGE}"></div>
      </main>`);
    const page = document.getElementById("page");
    if (!page) throw new Error("page missing");
    const first = markAmbientSeeThroughLayers(main, PAGE);
    expect(page.hasAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE)).toBe(true);
    // 페이지가 다른 색 띠로 바뀌면 다음 판정에서 표시가 빠진다.
    page.style.backgroundColor = PANEL;
    const second = markAmbientSeeThroughLayers(main, PAGE, first);
    expect(second.size).toBe(0);
    expect(page.hasAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE)).toBe(false);
  });
});

describe("keepAmbientSeeThrough", () => {
  it("나중에 들어온 페이지 래퍼도 잠시 뒤 표시하고, 정리하면 모든 표시를 뗀다", async () => {
    vi.useFakeTimers();
    const main = build(`<main id="main" data-width="1000" style="background-color: ${PAGE}"></main>`);
    const stop = keepAmbientSeeThrough(main, () => PAGE);
    expect(main.hasAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE)).toBe(true);

    const page = document.createElement("div");
    page.dataset.width = "1000";
    page.style.backgroundColor = PAGE;
    main.append(page);
    // MutationObserver 콜백(마이크로태스크) 뒤 간격 제한 타이머가 돈다.
    await Promise.resolve();
    expect(page.hasAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE)).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(page.hasAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE)).toBe(true);

    stop();
    expect(main.hasAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE)).toBe(false);
    expect(page.hasAttribute(AMBIENT_SEE_THROUGH_ATTRIBUTE)).toBe(false);
  });
});
