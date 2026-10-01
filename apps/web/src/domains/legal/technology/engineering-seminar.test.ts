// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildOfflineEngineeringDeck } from "./engineering-deck-export";
import {
  buildDeckTrack,
  deckTrackSlideCount,
  deckTrackTotalSeconds,
  formatClock,
  paceDeltaSeconds,
} from "./engineering-deck-model";
import {
  DECK_TRACKS,
  clampDeckIndex,
  engineeringDeckHref,
  parseEngineeringDeckState,
} from "./engineering-deck-state";
import { SEMINAR_LESSONS } from "./engineering-seminar-curriculum";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import {
  TALK_FACTS_REVIEWED_AT,
  TALK_SECTIONS,
  TALK_SLIDES,
  TALK_TOTAL_SECONDS,
  planTalkSections,
  talkSlideStartSeconds,
  type TalkSlide,
} from "./engineering-talk-deck";
import { deckCommandForKey } from "./use-engineering-deck";

const koOnly = (text: { readonly ko: string }): string => text.ko;
const chapterIds = new Set<string>(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => chapter.id));
const talkSlides: readonly TalkSlide[] = TALK_SLIDES;

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("세미나 발표(30분) 원본", () => {
  it("문제 → 제품 → 아키텍처 → 핵심 기술 → 품질 → 운영 → 한계 → 질의응답 순서로 정확히 30분이다", () => {
    expect(TALK_SECTIONS.map((section) => section.id)).toEqual([
      "opening", "product", "architecture", "core", "quality", "operations", "lessons", "qa",
    ]);
    expect(TALK_TOTAL_SECONDS).toBe(30 * 60);
    const plans = planTalkSections();
    expect(plans.reduce((sum, plan) => sum + plan.seconds, 0)).toBe(TALK_TOTAL_SECONDS);
    let expectedIndex = 0;
    for (const plan of plans) {
      expect(plan.firstSlideIndex, plan.id).toBe(expectedIndex);
      expect(plan.slideCount, plan.id).toBeGreaterThan(0);
      expectedIndex += plan.slideCount;
    }
    expect(expectedIndex).toBe(TALK_SLIDES.length);
    // 구간 순서가 슬라이드 순서와 어긋나지 않는다(같은 구간이 흩어지지 않음).
    const order = TALK_SLIDES.map((slide) => TALK_SECTIONS.findIndex((section) => section.id === slide.section));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("핵심 기술 구간은 드로잉·로컬 저장·협업·가상 스튜디오·3D·AI를 모두 다룬다", () => {
    const core = TALK_SLIDES.filter((slide) => slide.section === "core").map((slide) => slide.chapterId);
    expect(core).toEqual([
      "brush-engine",
      "browser-local-compute",
      "collaborative-crdt-boundary",
      "virtual-studio-world-authority",
      "web-3d-engine",
      "free-ai-routing",
    ]);
  });

  it("모든 슬라이드에 번역·발표자 노트와 실제 존재하는 근거가 있다", () => {
    expect(new Set(talkSlides.map((slide) => slide.id)).size).toBe(talkSlides.length);
    for (const slide of talkSlides) {
      for (const locale of ["ko", "en"] as const) {
        expect(slide.title[locale].length, slide.id).toBeGreaterThan(5);
        expect(slide.lead[locale].length, slide.id).toBeGreaterThan(10);
        expect(slide.notes[locale].length, slide.id).toBeGreaterThan(60);
      }
      if (slide.chapterId) expect(chapterIds.has(slide.chapterId), slide.id).toBe(true);
      for (const id of slide.statusChapterIds ?? []) expect(chapterIds.has(id), id).toBe(true);
      for (const path of slide.evidence ?? []) expect(existsSync(path), `${slide.id}: ${path}`).toBe(true);
      if (slide.art) expect(existsSync(`apps/web/public${slide.art.src}`), slide.art.src).toBe(true);
    }
  });

  it("슬라이드의 설정 수치는 실제 설정·코드 값과 같다(없는 수치를 만들지 않는다)", () => {
    const facts = new Map(talkSlides.flatMap((slide) => slide.facts ?? []).map((fact) => [
      koOnly(fact.label),
      typeof fact.value === "string" ? fact.value : koOnly(fact.value),
    ] as const));
    const wrangler = source("deploy/cloudflare-realtime/wrangler.jsonc");
    expect(facts.get("방당 최대 동시 연결(설정값)")).toBe("64");
    expect(wrangler).toContain('"REALTIME_MAX_CONNECTIONS_PER_ROOM": "64"');
    expect(facts.get("재접속 재개 허용 창(설정값)")).toBe("10s");
    expect(wrangler).toContain('"REALTIME_RESUME_WINDOW_MS": "10000"');

    const proximity = source("apps/web/src/domains/creator/virtual-space/studio-virtual-space-proximity.ts");
    expect(proximity).toMatch(/STUDIO_PROXIMITY_GREET_RADIUS = 160;/u);
    expect(proximity).toMatch(/STUDIO_PROXIMITY_FAREWELL_RADIUS = 220;/u);
    expect(proximity).toMatch(/STUDIO_PROXIMITY_CHAT_RADIUS = 200;/u);
    expect(facts.get("인사 진입 / 이탈 반경")).toBe("160 / 220px");
    expect(facts.get("대화 힌트 반경")).toBe("200px");
    expect(source("apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts")).toContain("HUDDLE_MAX_REMOTE_PEERS = 3;");
    expect(facts.get("허들 원격 참가자 상한")).toBe("3");

    const render = source("render.yaml");
    expect(render).toMatch(/plan: free/u);
    expect(render).toMatch(/autoDeployTrigger: "off"/u);

    const ratchetSource = source("config/architecture-boundary-ratchet.json");
    const ratchet: unknown = JSON.parse(ratchetSource);
    expect(ratchet).toMatchObject({ webToAdmin: 0, webToApi: 0, adminToWeb: 0, adminToApi: 0, apiToWeb: 0, apiToAdmin: 0 });
    // 발표자 노트가 말하는 레거시 상한은 래칫 설정과 같아야 한다(래칫이 줄면 대본도 고친다).
    const quality = talkSlides.find((slide) => slide.id === "talk-quality");
    for (const key of ["webSharedToDomain", "webCrossDomainDeepImport"]) {
      const value = new RegExp(`"${key}":\\s*(\\d+)`, "u").exec(ratchetSource)?.[1];
      expect(value, key).toMatch(/^\d+$/u);
      expect(quality?.notes.ko, key).toContain(`(${value ?? ""})`);
      expect(quality?.notes.en, key).toContain(`(${value ?? ""})`);
    }
    expect(TALK_FACTS_REVIEWED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it("슬라이드 시작 시각은 앞선 슬라이드 시간의 누적이다", () => {
    const starts = talkSlideStartSeconds();
    expect(starts[0]).toBe(0);
    for (let index = 1; index < TALK_SLIDES.length; index += 1) {
      expect(starts[index]).toBe((starts[index - 1] ?? 0) + (TALK_SLIDES[index - 1]?.seconds ?? 0));
    }
  });
});

describe("발표 트랙 모델", () => {
  it.each(DECK_TRACKS)("%s 트랙은 번역 없이 센 슬라이드 수·시간과 같다", (track) => {
    const model = buildDeckTrack(track, koOnly);
    expect(model.slides).toHaveLength(deckTrackSlideCount(track));
    expect(model.totalSeconds).toBe(deckTrackTotalSeconds(track));
    expect(model.sections.reduce((sum, section) => sum + section.slideCount, 0)).toBe(model.slides.length);
    expect(new Set(model.slides.map((slide) => slide.id)).size).toBe(model.slides.length);
    for (const slide of model.slides) {
      expect(slide.title.length, slide.id).toBeGreaterThan(3);
      expect(slide.notes.length, slide.id).toBeGreaterThan(10);
    }
  });

  it("세미나 발표는 19장·30분, 심화 강의는 기존 30개 레슨을 모두 쓴다", () => {
    expect(buildDeckTrack("talk", koOnly).slides).toHaveLength(TALK_SLIDES.length);
    expect(deckTrackTotalSeconds("talk")).toBe(1800);
    const lecture = buildDeckTrack("lecture", koOnly);
    expect(lecture.slides.map((slide) => slide.id)).toEqual(SEMINAR_LESSONS.map((lesson) => lesson.id));
    expect(lecture.slides[0]?.id).toBe("seminar-opening");
    expect(lecture.slides.at(-1)?.id).toBe("seminar-close");
  });

  it("상태 배지는 챕터 데이터에서 가져온다", () => {
    const limits = buildDeckTrack("talk", koOnly).slides.find((slide) => slide.id === "talk-limits");
    expect(limits?.statusChips?.map((chip) => chip.status)).toEqual(
      limits?.statusChips?.map((chip) => PUBLISHED_ENGINEERING_CHAPTERS.find((chapter) => chapter.id === chip.id)?.status),
    );
  });

  it("경과 시간과 예정 시각의 차이를 계산한다", () => {
    const slide = { plannedStartSeconds: 120, plannedSeconds: 60 };
    expect(paceDeltaSeconds(90, slide)).toBe(-30);
    expect(paceDeltaSeconds(150, slide)).toBe(0);
    expect(paceDeltaSeconds(200, slide)).toBe(20);
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(1800)).toBe("30:00");
    expect(formatClock(-75)).toBe("01:15");
  });
});

describe("레슨 원본(심화 강의 트랙)", () => {
  it("모든 레슨에 번역·대본·질문·구현 챕터 근거가 있다", () => {
    expect(new Set(SEMINAR_LESSONS.map((lesson) => lesson.id)).size).toBe(30);
    for (const lesson of SEMINAR_LESSONS) {
      expect(chapterIds.has(lesson.chapterId)).toBe(true);
      expect(lesson.points).toHaveLength(3);
      expect(lesson.flow.length).toBeGreaterThanOrEqual(3);
      expect(lesson.technologies.length).toBeGreaterThan(0);
      for (const locale of ["ko", "en"] as const) {
        expect(lesson.title[locale].length).toBeGreaterThan(10);
        expect(lesson.script[locale].length).toBeGreaterThan(120);
        expect(lesson.question[locale].length).toBeGreaterThan(10);
      }
    }
  });
});

describe("발표 URL 상태", () => {
  it("기본은 세미나 발표이며 #slide-n 딥링크를 읽는다", () => {
    expect(parseEngineeringDeckState("", "")).toEqual({ track: "talk", index: 0, view: "audience" });
    expect(parseEngineeringDeckState("?track=lecture", "#slide-12")).toEqual({ track: "lecture", index: 11, view: "audience" });
    expect(parseEngineeringDeckState("?track=talk&view=presenter", "#slide-3")).toEqual({ track: "talk", index: 2, view: "presenter" });
  });

  it("예전 링크(audience·duration·#deck=)도 새 트랙으로 연다", () => {
    expect(parseEngineeringDeckState("?audience=seminar&duration=30", "#deck=seminar:9")).toEqual({ track: "talk", index: 8, view: "audience" });
    expect(parseEngineeringDeckState("?audience=seminar&duration=15", "#deck=investor:3")).toEqual({ track: "brief", index: 2, view: "audience" });
    expect(parseEngineeringDeckState("?audience=study&duration=45", "")).toEqual({ track: "lecture", index: 0, view: "audience" });
  });

  it("잘못된 상태와 범위 밖 위치를 제한한다", () => {
    expect(parseEngineeringDeckState("?track=unknown&audience=nope", "#slide-0")).toEqual({ track: "talk", index: 0, view: "audience" });
    expect(parseEngineeringDeckState("", "#deck=seminar:Infinity")).toEqual({ track: "talk", index: 0, view: "audience" });
    expect(clampDeckIndex(999, 19)).toBe(18);
    expect(clampDeckIndex(-2, 19)).toBe(0);
    expect(clampDeckIndex(Number.NaN, 19)).toBe(0);
    expect(clampDeckIndex(1, 0)).toBe(0);
  });

  it("주소를 만들고 다시 읽으면 같은 위치다", () => {
    const href = engineeringDeckHref({ track: "talk", index: 6, view: "presenter" });
    expect(href).toBe("/about/technology/deck?track=talk&view=presenter#slide-7");
    const url = new URL(href, "https://toonstudio.cloud");
    expect(parseEngineeringDeckState(url.search, url.hash)).toEqual({ track: "talk", index: 6, view: "presenter" });
  });
});

describe("발표 단축키", () => {
  const button = (): HTMLButtonElement => document.createElement("button");
  const input = (): HTMLInputElement => document.createElement("input");
  const key = (value: string, target: EventTarget | null = null, shiftKey = false) => ({
    key: value, shiftKey, altKey: false, ctrlKey: false, metaKey: false, target,
  });

  it("탐색·발표 도구 키를 명령으로 바꾼다", () => {
    expect(deckCommandForKey(key("ArrowRight"), false)).toBe("next");
    expect(deckCommandForKey(key("PageUp"), false)).toBe("previous");
    expect(deckCommandForKey(key(" "), false)).toBe("next");
    expect(deckCommandForKey(key(" ", null, true), false)).toBe("previous");
    expect(deckCommandForKey(key("Home"), false)).toBe("first");
    expect(deckCommandForKey(key("End"), false)).toBe("last");
    expect(deckCommandForKey(key("f"), false)).toBe("present");
    expect(deckCommandForKey(key("N"), false)).toBe("notes");
    expect(deckCommandForKey(key("s"), false)).toBe("notes");
    expect(deckCommandForKey(key("o"), false)).toBe("overview");
    expect(deckCommandForKey(key("b"), false)).toBe("blackout");
    expect(deckCommandForKey(key("."), false)).toBe("blackout");
    expect(deckCommandForKey(key("t"), false)).toBe("timer");
    expect(deckCommandForKey(key("?"), false)).toBe("help");
    expect(deckCommandForKey(key("Escape"), false)).toBe("escape");
    expect(deckCommandForKey({ ...key("ArrowRight"), ctrlKey: true }, false)).toBeNull();
  });

  it("입력 칸과 버튼의 기본 동작을 빼앗지 않는다", () => {
    expect(deckCommandForKey(key("ArrowRight", input()), true)).toBeNull();
    expect(deckCommandForKey(key("f", input()), true)).toBeNull();
    expect(deckCommandForKey(key("ArrowRight", button()), false)).toBeNull();
    expect(deckCommandForKey(key("ArrowRight", button()), true)).toBe("next");
    expect(deckCommandForKey(key(" ", button()), true)).toBeNull();
    expect(deckCommandForKey(key("Enter", button()), true)).toBeNull();
  });
});

describe("오프라인 발표본", () => {
  it("외부 리소스 없이 조작 가능하고 콘텐츠 HTML을 이스케이프한다", () => {
    const html = buildOfflineEngineeringDeck([
      { id: "demo", eyebrow: "TEST", title: "<img src=x onerror=alert(1)>", lead: "A & B", points: ["<script>"], notes: "</script><script>alert(1)</script>" },
    ], "ko");
    expect(html).toContain("&lt;img");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("<img src=x");
    expect(html.match(/<script>/gu)).toHaveLength(1);
    expect(html).not.toMatch(/<(?:script|img|link)[^>]+(?:src|href)=/u);
    expect(html).toContain("ArrowRight");
    expect(html).toContain("외부 영상과 서비스는 포함하지 않습니다");
  });

  it("세미나 발표 전체를 한 파일로 내보낸다", () => {
    const model = buildDeckTrack("talk", koOnly);
    const html = buildOfflineEngineeringDeck(model.slides, "ko");
    expect(html.match(/<article data-slide/gu)).toHaveLength(model.slides.length);
    expect(html).toContain(`<option value="${model.slides.length - 1}">`);
  });
});
