// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type { StudioCommentsDocument, StudioCommentThread } from "../studio-comments";
import {
  clampPinCoordinate,
  commentsDocumentToManuscriptPins,
  commentThreadToManuscriptPin,
  computeFlyToTransform,
  countOpenManuscriptPins,
  filterManuscriptPins,
  isPinOverlapping,
  MANUSCRIPT_PIN_FLY_TO_ZOOM,
  MANUSCRIPT_PIN_URGENT_PREFIX,
  manuscriptPinToCommentAnchor,
  numberManuscriptPins,
  pinDistance,
  pinStatusWeight,
  resolvePinStatusFromThread,
  sortPinsForSidebar,
  stripManuscriptPinUrgentPrefix,
  type ManuscriptPin,
  type ManuscriptPinInput,
} from "./manuscript-pin-feedback-model";

function makePinInput(overrides: Partial<ManuscriptPinInput> = {}): ManuscriptPinInput {
  return {
    id: "pin-1",
    x: 0.5,
    y: 0.5,
    status: "open",
    authorId: "user-1",
    authorName: "김작가",
    createdAt: "2026-09-30T00:00:00.000Z",
    threadId: null,
    replyCount: 0,
    ...overrides,
  };
}

function makeThread(overrides: Partial<StudioCommentThread> = {}): StudioCommentThread {
  return {
    id: "thread-1",
    author: { id: "user-1", displayName: "김작가" },
    body: "이 부분 선이 어색해요",
    mentions: [],
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    anchor: { type: "point", pageId: "page-1", x: 0.25, y: 0.75 },
    replies: [],
    resolved: false,
    ...overrides,
  } as StudioCommentThread;
}

describe("clampPinCoordinate", () => {
  it("0..1 범위로 클램프한다", () => {
    expect(clampPinCoordinate(-0.5)).toBe(0);
    expect(clampPinCoordinate(1.5)).toBe(1);
    expect(clampPinCoordinate(0.42)).toBeCloseTo(0.42);
  });

  it("유한하지 않은 값은 0으로 처리한다", () => {
    expect(clampPinCoordinate(Number.NaN)).toBe(0);
    expect(clampPinCoordinate(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("numberManuscriptPins", () => {
  it("생성 시간 순서대로 1부터 순번을 부여한다", () => {
    const pins = numberManuscriptPins([
      makePinInput({ id: "b", createdAt: "2026-09-30T02:00:00.000Z" }),
      makePinInput({ id: "a", createdAt: "2026-09-30T01:00:00.000Z" }),
    ]);
    expect(pins.map((pin) => pin.id)).toEqual(["a", "b"]);
    expect(pins.map((pin) => pin.number)).toEqual([1, 2]);
  });

  it("원본 배열을 변경하지 않는다", () => {
    const input = [makePinInput({ id: "b" }), makePinInput({ id: "a" })];
    numberManuscriptPins(input);
    expect(input[0].id).toBe("b");
  });
});

describe("filterManuscriptPins", () => {
  const pins: ManuscriptPin[] = numberManuscriptPins([
    makePinInput({ id: "p1", status: "open", authorId: "user-1" }),
    makePinInput({ id: "p2", status: "resolved", authorId: "user-2" }),
    makePinInput({ id: "p3", status: "urgent", authorId: "user-1" }),
  ]);

  it("all 필터는 전체를 반환한다", () => {
    expect(filterManuscriptPins(pins, "all", "user-1")).toHaveLength(3);
  });

  it("open 필터는 미해결(긴급 포함)만 반환한다", () => {
    const filtered = filterManuscriptPins(pins, "open", "user-1");
    expect(filtered.map((pin) => pin.id).sort()).toEqual(["p1", "p3"]);
  });

  it("mine 필터는 현재 작성자의 핀만 반환한다", () => {
    const filtered = filterManuscriptPins(pins, "mine", "user-1");
    expect(filtered.map((pin) => pin.id).sort()).toEqual(["p1", "p3"]);
  });

  it("mine 필터는 작성자 ID가 없으면 빈 배열을 반환한다", () => {
    expect(filterManuscriptPins(pins, "mine", null)).toEqual([]);
  });
});

describe("countOpenManuscriptPins", () => {
  it("해결되지 않은 핀 수를 센다", () => {
    const pins = numberManuscriptPins([
      makePinInput({ status: "open" }),
      makePinInput({ id: "p2", status: "resolved" }),
      makePinInput({ id: "p3", status: "urgent" }),
    ]);
    expect(countOpenManuscriptPins(pins)).toBe(2);
  });
});

describe("resolvePinStatusFromThread", () => {
  it("해결된 스레드는 resolved", () => {
    expect(resolvePinStatusFromThread({ resolved: true, body: "수정했어요" })).toBe("resolved");
  });

  it("긴급 표식이 있는 스레드는 urgent", () => {
    expect(
      resolvePinStatusFromThread({ resolved: false, body: `${MANUSCRIPT_PIN_URGENT_PREFIX}빨리 봐주세요` }),
    ).toBe("urgent");
  });

  it("일반 스레드는 open", () => {
    expect(resolvePinStatusFromThread({ resolved: false, body: "이 부분 확인해주세요" })).toBe("open");
  });

  it("해결된 스레드는 긴급 표식이 있어도 resolved가 우선한다", () => {
    expect(
      resolvePinStatusFromThread({ resolved: true, body: `${MANUSCRIPT_PIN_URGENT_PREFIX}완료` }),
    ).toBe("resolved");
  });
});

describe("stripManuscriptPinUrgentPrefix", () => {
  it("긴급 접두사를 제거한다", () => {
    expect(stripManuscriptPinUrgentPrefix(`${MANUSCRIPT_PIN_URGENT_PREFIX}빨리`)).toBe("빨리");
  });

  it("접두사가 없으면 그대로 둔다", () => {
    expect(stripManuscriptPinUrgentPrefix("그냥 코멘트")).toBe("그냥 코멘트");
  });

  it("접두사만 있으면 빈 문자열이 된다", () => {
    expect(stripManuscriptPinUrgentPrefix(MANUSCRIPT_PIN_URGENT_PREFIX)).toBe("");
  });
});

describe("manuscriptPinToCommentAnchor", () => {
  it("핀 좌표를 point 앵커로 변환한다", () => {
    const anchor = manuscriptPinToCommentAnchor({ x: 0.3, y: 1.7 }, "page-9");
    expect(anchor).toEqual({ type: "point", pageId: "page-9", x: 0.3, y: 1 });
  });
});

describe("commentThreadToManuscriptPin", () => {
  it("point 앵커 스레드를 핀으로 변환한다", () => {
    const pin = commentThreadToManuscriptPin(makeThread(), "page-1", 7);
    expect(pin).not.toBeNull();
    expect(pin?.x).toBeCloseTo(0.25);
    expect(pin?.y).toBeCloseTo(0.75);
    expect(pin?.number).toBe(7);
    expect(pin?.threadId).toBe("thread-1");
    expect(pin?.authorName).toBe("김작가");
    expect(pin?.status).toBe("open");
  });

  it("다른 페이지의 스레드는 null", () => {
    expect(commentThreadToManuscriptPin(makeThread(), "page-2", 1)).toBeNull();
  });

  it("point가 아닌 앵커는 null", () => {
    const thread = makeThread({ anchor: { type: "page", pageId: "page-1" } });
    expect(commentThreadToManuscriptPin(thread, "page-1", 1)).toBeNull();
  });

  it("해결된 스레드는 resolved 상태", () => {
    const pin = commentThreadToManuscriptPin(makeThread({ resolved: true }), "page-1", 1);
    expect(pin?.status).toBe("resolved");
  });
});

describe("commentsDocumentToManuscriptPins", () => {
  it("문서의 point 스레드만 핀으로 변환하고 순번을 부여한다", () => {
    const document = {
      version: 1,
      threads: [
        makeThread({ id: "t1", createdAt: "2026-09-30T02:00:00.000Z" }),
        makeThread({ id: "t2", anchor: { type: "page", pageId: "page-1" } }),
        makeThread({ id: "t3", createdAt: "2026-09-30T01:00:00.000Z" }),
      ],
    } as unknown as StudioCommentsDocument;
    const pins = commentsDocumentToManuscriptPins(document, "page-1");
    expect(pins).toHaveLength(2);
    expect(pins[0].threadId).toBe("t3");
    expect(pins[0].number).toBe(1);
    expect(pins[1].threadId).toBe("t1");
    expect(pins[1].number).toBe(2);
  });
});

describe("pinDistance / isPinOverlapping", () => {
  it("두 핀 사이 거리를 계산한다", () => {
    expect(pinDistance({ x: 0, y: 0 }, { x: 0.03, y: 0.04 })).toBeCloseTo(0.05);
  });

  it("가까운 핀은 겹침으로 판정한다", () => {
    expect(isPinOverlapping({ x: 0.5, y: 0.5 }, [{ x: 0.51, y: 0.51 }])).toBe(true);
    expect(isPinOverlapping({ x: 0.5, y: 0.5 }, [{ x: 0.8, y: 0.8 }])).toBe(false);
    expect(isPinOverlapping({ x: 0.5, y: 0.5 }, [])).toBe(false);
  });
});

describe("sortPinsForSidebar", () => {
  it("긴급 > 미해결 > 해결됨 순으로 정렬한다", () => {
    const pins = numberManuscriptPins([
      makePinInput({ id: "r", status: "resolved" }),
      makePinInput({ id: "u", status: "urgent" }),
      makePinInput({ id: "o", status: "open" }),
    ]);
    const sorted = sortPinsForSidebar(pins);
    expect(sorted.map((pin) => pin.id)).toEqual(["u", "o", "r"]);
  });

  it("같은 상태 내에서는 순번 순서를 유지한다", () => {
    const pins = numberManuscriptPins([
      makePinInput({ id: "a", createdAt: "2026-09-30T02:00:00.000Z" }),
      makePinInput({ id: "b", createdAt: "2026-09-30T01:00:00.000Z" }),
    ]);
    const sorted = sortPinsForSidebar(pins);
    expect(sorted.map((pin) => pin.id)).toEqual(["b", "a"]);
  });
});

describe("pinStatusWeight", () => {
  it("긴급이 가장 먼저 오도록 가중치를 부여한다", () => {
    expect(pinStatusWeight("urgent")).toBeLessThan(pinStatusWeight("open"));
    expect(pinStatusWeight("open")).toBeLessThan(pinStatusWeight("resolved"));
  });
});

describe("commentThreadToManuscriptPin 긴급 라운드트립", () => {
  it("긴급 표식이 있는 스레드는 urgent 핀으로 변환된다", () => {
    const pin = commentThreadToManuscriptPin(
      makeThread({ body: `${MANUSCRIPT_PIN_URGENT_PREFIX}빨리 봐주세요` }),
      "page-1",
      1,
    );
    expect(pin?.status).toBe("urgent");
  });
});

describe("computeFlyToTransform", () => {
  it("핀의 화면 위치를 뷰어 중앙으로 옮기는 transform을 계산한다", () => {
    const next = computeFlyToTransform({
      viewerWidth: 800,
      viewerHeight: 600,
      pinScreenX: 100,
      pinScreenY: 100,
      current: { zoom: 1, panX: 0, panY: 0 },
    });
    expect(next.zoom).toBe(MANUSCRIPT_PIN_FLY_TO_ZOOM);
    // 중앙(400, 300)으로 이동: panX = 400 - 100 * 1.8 = 220
    expect(next.panX).toBeCloseTo(220);
    expect(next.panY).toBeCloseTo(120);
  });

  it("이미 확대된 상태에서는 현재 transform을 기준으로 스케일한다", () => {
    const next = computeFlyToTransform({
      viewerWidth: 800,
      viewerHeight: 600,
      pinScreenX: 400,
      pinScreenY: 300,
      current: { zoom: 2, panX: 50, panY: -20 },
      targetZoom: 2,
    });
    expect(next.zoom).toBe(2);
    // scaleRatio = 1 → pan 유지 + 중앙 오프셋 0
    expect(next.panX).toBeCloseTo(50);
    expect(next.panY).toBeCloseTo(-20);
  });

  it("targetZoom을 지정하면 해당 배율로 이동한다", () => {
    const next = computeFlyToTransform({
      viewerWidth: 1000,
      viewerHeight: 800,
      pinScreenX: 500,
      pinScreenY: 400,
      current: { zoom: 1, panX: 0, panY: 0 },
      targetZoom: 2.5,
    });
    expect(next.zoom).toBe(2.5);
    expect(next.panX).toBeCloseTo(500 - 500 * 2.5);
    expect(next.panY).toBeCloseTo(400 - 400 * 2.5);
  });
});
