import { describe, it, expect } from "vitest";

import {
  PAGE_NAME_MAX,
  PAGE_NOTE_MAX,
  PASTE_OFFSET,
  CLIPBOARD_FALLBACK_KEY,
  STUDIO_CLIPBOARD_KIND,
  STUDIO_CLIPBOARD_VERSION,
  autoPageName,
  pageDisplayName,
  hasCustomPageName,
  normalizePageMeta,
  withPageMeta,
  buildClipboardPayload,
  serializeClipboardPayload,
  parseClipboardPayload,
  isClipboardPayload,
  collectCopyElements,
  planClipboardPaste,
  writeClipboardFallback,
  readClipboardFallback,
  type ClipboardElementLike,
  type StudioClipboardPayload,
} from "./studio-page-meta";

// 결정적 id 생성기 (uuid 대체)
function seqId(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

// 인메모리 가짜 저장소 (studio-clips 테스트와 동일 패턴)
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    _map: map,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 페이지 메타
// ─────────────────────────────────────────────────────────────────────────────

describe("autoPageName", () => {
  it("0-기반 인덱스로 '1페이지' 규칙", () => {
    expect(autoPageName(0)).toBe("1페이지");
    expect(autoPageName(4)).toBe("5페이지");
  });

  it("음수/실수/NaN 방어", () => {
    expect(autoPageName(-3)).toBe("1페이지");
    expect(autoPageName(1.9)).toBe("2페이지");
    expect(autoPageName(Number.NaN)).toBe("1페이지");
  });
});

describe("pageDisplayName", () => {
  it("커스텀 이름이 있으면 우선", () => {
    expect(pageDisplayName({ name: "오프닝 씬" }, 0)).toBe("오프닝 씬");
  });

  it("이름 없음/공백/비문자열(레거시 문서)은 자동 이름", () => {
    expect(pageDisplayName({}, 2)).toBe("3페이지");
    expect(pageDisplayName({ name: "   " }, 2)).toBe("3페이지");
    expect(pageDisplayName({ name: 42 }, 2)).toBe("3페이지");
    expect(pageDisplayName(null, 2)).toBe("3페이지");
    expect(pageDisplayName(undefined, 2)).toBe("3페이지");
  });

  it("앞뒤 공백은 잘라 표시", () => {
    expect(pageDisplayName({ name: "  회상 컷  " }, 0)).toBe("회상 컷");
  });
});

describe("hasCustomPageName", () => {
  it("유효한 커스텀 이름만 true", () => {
    expect(hasCustomPageName({ name: "클라이맥스" })).toBe(true);
    expect(hasCustomPageName({ name: "" })).toBe(false);
    expect(hasCustomPageName({ name: 1 })).toBe(false);
    expect(hasCustomPageName({})).toBe(false);
    expect(hasCustomPageName(null)).toBe(false);
  });
});

describe("normalizePageMeta", () => {
  it("레거시 페이지(메타 없음) → 빈 메타", () => {
    expect(normalizePageMeta({ id: "p1", elements: [] })).toEqual({});
    expect(normalizePageMeta(null)).toEqual({});
    expect(normalizePageMeta("문자열")).toEqual({});
  });

  it("유효한 name/note 만 통과", () => {
    expect(normalizePageMeta({ name: "씬 1", note: "주인공 등장" })).toEqual({
      name: "씬 1",
      note: "주인공 등장",
    });
    expect(normalizePageMeta({ name: 7, note: ["x"] })).toEqual({});
  });

  it("초과 길이는 최대치로 자른다", () => {
    const meta = normalizePageMeta({
      name: "가".repeat(PAGE_NAME_MAX + 10),
      note: "나".repeat(PAGE_NOTE_MAX + 10),
    });
    expect(meta.name).toHaveLength(PAGE_NAME_MAX);
    expect(meta.note).toHaveLength(PAGE_NOTE_MAX);
  });
});

describe("withPageMeta", () => {
  const pages = () => [
    { id: "a", elements: [], canvasH: 1080 },
    { id: "b", elements: [], canvasH: 1080 },
  ];

  it("이름/메모 설정 — 불변, 다른 페이지는 그대로", () => {
    const src = pages();
    const next = withPageMeta(src, "b", { name: "엔딩", note: "노을 배경" });
    expect(next).not.toBe(src);
    expect(next[0]).toBe(src[0]); // 무관 페이지 참조 보존
    expect(next[1]).toMatchObject({ id: "b", name: "엔딩", note: "노을 배경" });
    expect(src[1]).not.toHaveProperty("name"); // 원본 불변
  });

  it("빈 값(null/공백)은 키 자체를 제거 — 직렬화가 레거시와 동일 형태", () => {
    const named = withPageMeta(pages(), "a", { name: "임시", note: "메모" });
    const cleared = withPageMeta(named, "a", { name: null, note: "   " });
    expect(cleared[0]).not.toHaveProperty("name");
    expect(cleared[0]).not.toHaveProperty("note");
    const json = JSON.parse(JSON.stringify(cleared[0])) as Record<string, unknown>;
    expect("name" in json).toBe(false);
    expect("note" in json).toBe(false);
  });

  it("패치에 없는 필드는 유지(부분 패치)", () => {
    const named = withPageMeta(pages(), "a", { name: "씬", note: "콘티" });
    const patched = withPageMeta(named, "a", { name: "씬 2" });
    expect(patched[0]).toMatchObject({ name: "씬 2", note: "콘티" });
  });

  it("실질 변화 없으면 원본 배열 참조 반환(undo 오염 방지)", () => {
    const src = pages();
    expect(withPageMeta(src, "a", { name: "" })).toBe(src); // 이름 없음 → 없음
    expect(withPageMeta(src, "없는페이지", { name: "x" })).toBe(src);
    const named = withPageMeta(src, "a", { name: "씬" });
    expect(withPageMeta(named, "a", { name: "  씬  " })).toBe(named); // trim 후 동일
  });

  it("초과 길이는 잘라 저장", () => {
    const next = withPageMeta(pages(), "a", { name: "가".repeat(PAGE_NAME_MAX + 5) });
    expect((next[0] as { name?: string }).name).toHaveLength(PAGE_NAME_MAX);
  });

  it("pagesList JSON 직렬화 왕복에도 메타가 살아남는다(하위호환 옵셔널)", () => {
    const next = withPageMeta(pages(), "a", { name: "도입부", note: "비 오는 거리" });
    const revived = JSON.parse(JSON.stringify(next)) as Array<Record<string, unknown>>;
    expect(normalizePageMeta(revived[0])).toEqual({ name: "도입부", note: "비 오는 거리" });
    expect(normalizePageMeta(revived[1])).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 요소 클립보드 — 페이로드 직렬화/파싱
// ─────────────────────────────────────────────────────────────────────────────

const SRC = { canvasW: 720, canvasH: 1080, pageId: "page-1" };

function textEl(id: string, x = 100, y = 200): ClipboardElementLike {
  return { id, type: "text", text: "대사", x, y, width: 220, fontSize: 40, fill: "#111", rotation: 0 };
}

function drawEl(id: string, points: number[] = [10, 20, 30, 40]): ClipboardElementLike {
  return { id, type: "draw", points, stroke: "#000", strokeWidth: 4 };
}

describe("buildClipboardPayload", () => {
  it("버전·출처 페이지 크기·출처 페이지 id·복사 시각을 싣는다", () => {
    const p = buildClipboardPayload([textEl("e1")], SRC, 1234);
    expect(p.kind).toBe(STUDIO_CLIPBOARD_KIND);
    expect(p.version).toBe(STUDIO_CLIPBOARD_VERSION);
    expect(p.copiedAt).toBe(1234);
    expect(p.source).toEqual({ canvasW: 720, canvasH: 1080, pageId: "page-1" });
    expect(p.els).toHaveLength(1);
  });

  it("깊은 복사 — 원본 요소를 변형해도 페이로드는 불변", () => {
    const el = drawEl("e1");
    const p = buildClipboardPayload([el], SRC, 1);
    (el.points as number[])[0] = 999;
    expect((p.els[0].points as number[])[0]).toBe(10);
  });

  it("id 없는 항목·비객체는 걸러낸다", () => {
    const p = buildClipboardPayload([textEl("ok"), { type: "text" }, null, "junk", 42], SRC, 1);
    expect(p.els.map((e) => e.id)).toEqual(["ok"]);
  });

  it("잘못된 출처 크기는 안전값으로 대체하고 pageId 없으면 생략", () => {
    const p = buildClipboardPayload([textEl("e1")], { canvasW: Number.NaN, canvasH: -5 }, 1);
    expect(p.source.canvasW).toBeGreaterThan(0);
    expect(p.source.canvasH).toBeGreaterThan(0);
    expect("pageId" in p.source).toBe(false);
  });
});

describe("serialize/parse round trip", () => {
  it("직렬화 → 파싱 왕복이 동일 페이로드", () => {
    const p = buildClipboardPayload([textEl("e1"), drawEl("e2")], SRC, 55);
    expect(parseClipboardPayload(serializeClipboardPayload(p))).toEqual(p);
  });

  it("일반 텍스트/타 JSON/깨진 JSON 은 null (무해 통과)", () => {
    expect(parseClipboardPayload(null)).toBeNull();
    expect(parseClipboardPayload(undefined)).toBeNull();
    expect(parseClipboardPayload("")).toBeNull();
    expect(parseClipboardPayload("안녕하세요 일반 텍스트")).toBeNull();
    expect(parseClipboardPayload('{"kind":"other","els":[]}')).toBeNull();
    expect(parseClipboardPayload(`{broken ${STUDIO_CLIPBOARD_KIND}`)).toBeNull();
  });

  it("상위 버전/형식 불일치 페이로드는 거부", () => {
    const p = buildClipboardPayload([textEl("e1")], SRC, 1);
    const higher = { ...p, version: STUDIO_CLIPBOARD_VERSION + 1 };
    expect(parseClipboardPayload(JSON.stringify(higher))).toBeNull();
    expect(isClipboardPayload({ ...p, els: "not-array" })).toBe(false);
    expect(isClipboardPayload({ ...p, source: { canvasW: 0, canvasH: 1080 } })).toBe(false);
    expect(isClipboardPayload({ ...p, copiedAt: "yesterday" })).toBe(false);
  });

  it("알 수 없는 추가 필드는 허용(전방 호환)", () => {
    const p = buildClipboardPayload([textEl("e1")], SRC, 1);
    const withExtra = JSON.stringify({ ...p, futureField: { a: 1 } });
    expect(parseClipboardPayload(withExtra)).not.toBeNull();
  });
});

describe("collectCopyElements", () => {
  const els = [
    { id: "a" },
    { id: "b", groupId: "g1" },
    { id: "c", groupId: "g1" },
    { id: "d" },
  ];

  it("다중 선택(marquee)이 우선 — 문서 순서 보존", () => {
    expect(collectCopyElements(els, "a", ["d", "b"]).map((e) => e.id)).toEqual(["b", "d"]);
  });

  it("단일 선택 — 그룹 소속이면 그룹 전체", () => {
    expect(collectCopyElements(els, "b", []).map((e) => e.id)).toEqual(["b", "c"]);
    expect(collectCopyElements(els, "a", []).map((e) => e.id)).toEqual(["a"]);
  });

  it("선택 없음/유령 id 는 빈 배열", () => {
    expect(collectCopyElements(els, null, [])).toEqual([]);
    expect(collectCopyElements(els, "zzz", [])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 요소 클립보드 — 붙여넣기 planner
// ─────────────────────────────────────────────────────────────────────────────

describe("planClipboardPaste", () => {
  it("id 전부 재발급 + hidden/locked 해제, ids 는 요소 순서와 일치", () => {
    const p = buildClipboardPayload(
      [{ ...textEl("e1"), hidden: true, locked: true }, drawEl("e2")],
      SRC,
      1
    );
    const plan = planClipboardPaste(p, { canvasW: 720, canvasH: 1080, pageId: "page-2" }, seqId());
    expect(plan).not.toBeNull();
    expect(plan!.els.map((e) => e.id)).toEqual(plan!.ids);
    expect(plan!.ids).toEqual(["id-1", "id-2"]);
    expect(plan!.els.every((e) => e.hidden === false && e.locked === false)).toBe(true);
  });

  it("groupId 재매핑 — 같은 그룹은 같은 새 id, 원래 id 와는 다름", () => {
    const p = buildClipboardPayload(
      [
        { ...textEl("e1"), groupId: "g1" },
        { ...textEl("e2", 300, 300), groupId: "g1" },
        { ...textEl("e3", 400, 400), groupId: "g2" },
      ],
      SRC,
      1
    );
    const plan = planClipboardPaste(p, { canvasW: 720, canvasH: 1080, pageId: "page-2" }, seqId())!;
    const [a, b, c] = plan.els;
    expect(a.groupId).toBe(b.groupId);
    expect(a.groupId).not.toBe("g1");
    expect(c.groupId).not.toBe(a.groupId);
    expect(c.groupId).not.toBe("g2");
  });

  it("같은 페이지 → PASTE_OFFSET 겹침 방지, draw 는 points 로 이동", () => {
    const p = buildClipboardPayload([textEl("e1", 100, 200), drawEl("e2", [10, 20, 30, 40])], SRC, 1);
    const plan = planClipboardPaste(p, { canvasW: 720, canvasH: 1080, pageId: "page-1" }, seqId())!;
    expect(plan.els[0].x).toBe(100 + PASTE_OFFSET);
    expect(plan.els[0].y).toBe(200 + PASTE_OFFSET);
    expect(plan.els[1].points).toEqual([10 + PASTE_OFFSET, 20 + PASTE_OFFSET, 30 + PASTE_OFFSET, 40 + PASTE_OFFSET]);
    expect(plan.els[1].x).toBeUndefined(); // draw 에 x/y 키를 만들어내지 않음
  });

  it("연속 붙여넣기 캐스케이드 — offsetSteps 단수만큼 계단식", () => {
    const p = buildClipboardPayload([textEl("e1", 100, 200)], SRC, 1);
    const plan = planClipboardPaste(p, { canvasW: 720, canvasH: 1080, pageId: "page-1" }, seqId(), {
      offsetSteps: 3,
    })!;
    expect(plan.els[0].x).toBe(100 + PASTE_OFFSET * 3);
    expect(plan.els[0].y).toBe(200 + PASTE_OFFSET * 3);
  });

  it("다른 페이지 → 원좌표 유지(오프셋 없음)", () => {
    const p = buildClipboardPayload([textEl("e1", 100, 200)], SRC, 1);
    const plan = planClipboardPaste(p, { canvasW: 720, canvasH: 1080, pageId: "page-2" }, seqId())!;
    expect(plan.els[0].x).toBe(100);
    expect(plan.els[0].y).toBe(200);
  });

  it("캔버스 폭이 다르면 지오메트리를 비율 스케일(좌표·크기·points·선굵기)", () => {
    const p = buildClipboardPayload([textEl("e1", 100, 200), drawEl("e2", [10, 20, 30, 40])], SRC, 1);
    const plan = planClipboardPaste(p, { canvasW: 1440, canvasH: 2160, pageId: "page-2" }, seqId())!;
    expect(plan.els[0]).toMatchObject({ x: 200, y: 400, width: 440, fontSize: 80 });
    expect(plan.els[1].points).toEqual([20, 40, 60, 80]);
    expect(plan.els[1].strokeWidth).toBe(8);
  });

  it("대상 캔버스에서 완전히 벗어난 묶음만 안으로 구조(짧은 페이지로 붙여넣기)", () => {
    // 긴 페이지(y=3000)에서 복사 → 1080 높이 페이지: 완전 이탈이므로 하단에 맞춤
    const tall = buildClipboardPayload(
      [{ id: "e1", type: "image", x: 100, y: 3000, width: 200, height: 100 }],
      { canvasW: 720, canvasH: 4000, pageId: "page-1" },
      1
    );
    const rescued = planClipboardPaste(tall, { canvasW: 720, canvasH: 1080, pageId: "page-2" }, seqId())!;
    expect(rescued.els[0].y).toBe(1080 - 100); // 하단 끝에 맞춤
    expect(rescued.els[0].x).toBe(100); // 가로는 이탈 아님 → 유지

    // 부분 겹침(절반 걸침)은 의도 존중 — 보정하지 않음
    const partial = buildClipboardPayload(
      [{ id: "e1", type: "image", x: 600, y: 1000, width: 300, height: 300 }],
      SRC,
      1
    );
    const kept = planClipboardPaste(partial, { canvasW: 720, canvasH: 1080, pageId: "page-2" }, seqId())!;
    expect(kept.els[0]).toMatchObject({ x: 600, y: 1000 });
  });

  it("캔버스보다 큰 묶음은 시작 모서리(0)에 맞춘다", () => {
    const p = buildClipboardPayload(
      [{ id: "e1", type: "image", x: 800, y: 0, width: 2000, height: 100 }],
      { canvasW: 720, canvasH: 1080 },
      1
    );
    const plan = planClipboardPaste(p, { canvasW: 720, canvasH: 1080 }, seqId())!;
    expect(plan.els[0].x).toBe(0);
  });

  it("빈/불량 페이로드는 null", () => {
    const empty = buildClipboardPayload([], SRC, 1);
    expect(planClipboardPaste(empty, { canvasW: 720, canvasH: 1080 }, seqId())).toBeNull();
    const bogus = { kind: "other" } as unknown as StudioClipboardPayload;
    expect(planClipboardPaste(bogus, { canvasW: 720, canvasH: 1080 }, seqId())).toBeNull();
  });

  it("페이로드 원본을 변형하지 않는다(재붙여넣기 안전)", () => {
    const p = buildClipboardPayload([textEl("e1", 100, 200)], SRC, 1);
    planClipboardPaste(p, { canvasW: 720, canvasH: 1080, pageId: "page-1" }, seqId());
    expect(p.els[0]).toMatchObject({ id: "e1", x: 100, y: 200 });
    expect("hidden" in p.els[0]).toBe(false); // planner 가 페이로드에 역주입하지 않음
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// localStorage 폴백
// ─────────────────────────────────────────────────────────────────────────────

describe("clipboard fallback storage", () => {
  it("쓰기 → 읽기 왕복", () => {
    const s = fakeStorage();
    const p = buildClipboardPayload([textEl("e1")], SRC, 9);
    writeClipboardFallback(s, p);
    expect(readClipboardFallback(s)).toEqual(p);
  });

  it("저장소 부재·빈 키·깨진 값은 null", () => {
    expect(readClipboardFallback(null)).toBeNull();
    expect(readClipboardFallback(undefined)).toBeNull();
    expect(readClipboardFallback(fakeStorage())).toBeNull();
    expect(readClipboardFallback(fakeStorage({ [CLIPBOARD_FALLBACK_KEY]: "{oops" }))).toBeNull();
    expect(readClipboardFallback(fakeStorage({ [CLIPBOARD_FALLBACK_KEY]: '{"kind":"other"}' }))).toBeNull();
  });

  it("쓰기 실패(쿼터 초과)는 조용히 무시", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => writeClipboardFallback(throwing, buildClipboardPayload([textEl("e1")], SRC, 1))).not.toThrow();
    writeClipboardFallback(null, buildClipboardPayload([textEl("e1")], SRC, 1)); // no-op
  });
});
