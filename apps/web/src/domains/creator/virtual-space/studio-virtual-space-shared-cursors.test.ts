import { describe, expect, it } from "vitest";

import {
  assignSharedCursorColor,
  encodeStudioSharedCursorClickPacket,
  encodeStudioSharedCursorPacket,
  lerpSharedCursorPosition,
  listSharedCursorPeers,
  mergeSharedCursorClick,
  mergeSharedCursorPacket,
  parseStudioSharedCursorClickPacket,
  parseStudioSharedCursorPacket,
  pruneSharedCursorDirectory,
  sharedCursorClickVisible,
  sharedCursorIdleHidden,
  shouldSendSharedCursor,
  STUDIO_SHARED_CURSOR_CLICK_TTL_MS,
  STUDIO_SHARED_CURSOR_IDLE_HIDE_MS,
  STUDIO_SHARED_CURSOR_STALE_MS,
  worldToScreenCursor,
  type StudioSharedCursorClickPacket,
  type StudioSharedCursorPacket,
} from "./studio-virtual-space-shared-cursors";

function makePacket(overrides: Partial<StudioSharedCursorPacket> = {}): StudioSharedCursorPacket {
  return {
    wire: "toonstudio-space-v1",
    kind: "cursor",
    sequence: 7,
    at: 1_700_000,
    cursor: { x: 120.5, y: 340, hidden: false },
    ...overrides,
  };
}

describe("parseStudioSharedCursorPacket", () => {
  it("유효한 커서 패킷을 파싱한다", () => {
    const packet = parseStudioSharedCursorPacket(JSON.stringify(makePacket()));
    expect(packet).toMatchObject({
      wire: "toonstudio-space-v1",
      kind: "cursor",
      sequence: 7,
      cursor: { x: 120.5, y: 340, hidden: false },
    });
  });

  it("worldScope가 64자리 hex가 아니면 거부한다", () => {
    const bad = parseStudioSharedCursorPacket(
      JSON.stringify(makePacket({ worldScope: "not-a-scope" })),
    );
    expect(bad).toBeNull();
    const good = parseStudioSharedCursorPacket(
      JSON.stringify(makePacket({ worldScope: "a".repeat(64) })),
    );
    expect(good?.worldScope).toBe("a".repeat(64));
  });

  it("잘못된 kind·좌표·본문은 거부한다", () => {
    expect(parseStudioSharedCursorPacket(JSON.stringify({ ...makePacket(), kind: "presence" }))).toBeNull();
    expect(parseStudioSharedCursorPacket(JSON.stringify(makePacket({ cursor: { x: Number.NaN, y: 1, hidden: false } })))).toBeNull();
    expect(parseStudioSharedCursorPacket(JSON.stringify(makePacket({ cursor: { x: 200_000, y: 1, hidden: false } })))).toBeNull();
    expect(parseStudioSharedCursorPacket("not json")).toBeNull();
    expect(parseStudioSharedCursorPacket("")).toBeNull();
  });

  it("1024바이트를 초과하면 거부한다", () => {
    const big = JSON.stringify(makePacket({ cursor: { x: 1, y: 1, hidden: false } })).padEnd(2048, " ");
    expect(parseStudioSharedCursorPacket(big)).toBeNull();
  });
});

describe("encodeStudioSharedCursorPacket", () => {
  it("패킷을 JSON 문자열로 인코딩한다", () => {
    const raw = encodeStudioSharedCursorPacket(makePacket());
    expect(typeof raw).toBe("string");
    expect(parseStudioSharedCursorPacket(raw ?? "")?.sequence).toBe(7);
  });
});

describe("worldToScreenCursor", () => {
  const camera = { x: 100, y: 200, zoom: 2, viewportWidth: 800, viewportHeight: 600 };

  it("월드 좌표를 스크린 좌표로 변환한다", () => {
    expect(worldToScreenCursor({ x: 150, y: 250 }, camera)).toMatchObject({ x: 100, y: 100, visible: true });
  });

  it("뷰포트 밖 좌표는 visible:false를 반환한다", () => {
    expect(worldToScreenCursor({ x: 10_000, y: 10_000 }, camera).visible).toBe(false);
  });

  it("비정상 zoom은 1로 취급한다", () => {
    expect(worldToScreenCursor({ x: 150, y: 250 }, { ...camera, zoom: 0 })).toMatchObject({ x: 50, y: 50 });
  });
});

describe("assignSharedCursorColor", () => {
  it("같은 세션은 항상 같은 색을 받는다", () => {
    expect(assignSharedCursorColor("peer:a")).toBe(assignSharedCursorColor("peer:a"));
    expect(assignSharedCursorColor("peer:a")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("다른 세션은 대체로 다른 색을 받는다", () => {
    const colors = new Set(["peer:1", "peer:2", "peer:3", "peer:4", "peer:5"].map(assignSharedCursorColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("shouldSendSharedCursor", () => {
  it("첫 전송은 항상 허용한다", () => {
    expect(shouldSendSharedCursor({
      lastSentAt: 0, now: 1_000, lastSent: null, next: { x: 0, y: 0 }, hiddenChanged: false,
    })).toBe(true);
  });

  it("숨김 상태가 바뀌면 즉시 전송한다", () => {
    expect(shouldSendSharedCursor({
      lastSentAt: 1_000, now: 1_001, lastSent: { x: 5, y: 5 }, next: { x: 5, y: 5 }, hiddenChanged: true,
    })).toBe(true);
  });

  it("2px 이상 움직이면 간격 전에도 전송한다", () => {
    expect(shouldSendSharedCursor({
      lastSentAt: 1_000, now: 1_010, lastSent: { x: 0, y: 0 }, next: { x: 10, y: 0 }, hiddenChanged: false,
    })).toBe(true);
  });

  it("미세한 움직임은 간격이 지날 때까지 스로틀한다", () => {
    expect(shouldSendSharedCursor({
      lastSentAt: 1_000, now: 1_010, lastSent: { x: 0, y: 0 }, next: { x: 1, y: 0 }, hiddenChanged: false,
    })).toBe(false);
    expect(shouldSendSharedCursor({
      lastSentAt: 1_000, now: 1_200, lastSent: { x: 0, y: 0 }, next: { x: 1, y: 0 }, hiddenChanged: false,
    })).toBe(true);
  });
});

describe("sharedCursorIdleHidden", () => {
  it("3초 이상 움직임이 없으면 숨김으로 판단한다", () => {
    expect(sharedCursorIdleHidden(1_000, 1_000 + STUDIO_SHARED_CURSOR_IDLE_HIDE_MS)).toBe(true);
    expect(sharedCursorIdleHidden(1_000, 1_500)).toBe(false);
  });
});

describe("lerpSharedCursorPosition", () => {
  it("목표 지점으로 점진 이동한다", () => {
    const next = lerpSharedCursorPosition({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5);
    expect(next).toMatchObject({ x: 50, y: 0 });
  });

  it("alpha 1이면 즉시 스냅한다 (reduced-motion)", () => {
    expect(lerpSharedCursorPosition({ x: 0, y: 0 }, { x: 100, y: 50 }, 1)).toMatchObject({ x: 100, y: 50 });
  });

  it("임계 거리 안이면 목표에 도착한 것으로 본다", () => {
    expect(lerpSharedCursorPosition({ x: 99.9, y: 0 }, { x: 100, y: 0 }, 0.35)).toMatchObject({ x: 100, y: 0 });
  });
});

describe("mergeSharedCursorPacket / pruneSharedCursorDirectory", () => {
  it("새 피어 커서를 디렉터리에 추가한다", () => {
    const raw = encodeStudioSharedCursorPacket(makePacket()) ?? "";
    const directory = mergeSharedCursorPacket({}, raw, "peer:jun", "준 작가", undefined, 2_000);
    expect(directory["peer:jun"]).toMatchObject({
      sessionId: "peer:jun",
      displayName: "준 작가",
      x: 120.5,
      y: 340,
      hidden: false,
      lastSeen: 2_000,
    });
  });

  it("오래된 시퀀스는 무시한다", () => {
    const first = encodeStudioSharedCursorPacket(makePacket({ sequence: 10 })) ?? "";
    const stale = encodeStudioSharedCursorPacket(makePacket({ sequence: 9, cursor: { x: 1, y: 1, hidden: false } })) ?? "";
    const afterFirst = mergeSharedCursorPacket({}, first, "peer:jun", "준", undefined, 2_000);
    const afterStale = mergeSharedCursorPacket(afterFirst, stale, "peer:jun", "준", undefined, 2_100);
    expect(afterStale["peer:jun"]?.x).toBe(120.5);
    expect(afterStale["peer:jun"]?.lastSeen).toBe(2_000);
  });

  it("worldScope가 다르면 무시한다", () => {
    const raw = encodeStudioSharedCursorPacket(makePacket({ worldScope: "b".repeat(64) })) ?? "";
    expect(mergeSharedCursorPacket({}, raw, "peer:jun", "준", undefined, 2_000)).toEqual({});
  });

  it("오래된 피어를 제거한다", () => {
    const raw = encodeStudioSharedCursorPacket(makePacket()) ?? "";
    const directory = mergeSharedCursorPacket({}, raw, "peer:jun", "준", undefined, 1_000);
    const pruned = pruneSharedCursorDirectory(directory, 1_000 + STUDIO_SHARED_CURSOR_STALE_MS + 1);
    expect(pruned).toEqual({});
    expect(pruneSharedCursorDirectory(directory, 2_000)).toBe(directory);
  });

  it("자기 커서는 목록에서 제외하고 이름순으로 정렬한다", () => {
    const raw = (seq: number) => encodeStudioSharedCursorPacket(makePacket({ sequence: seq })) ?? "";
    let directory = mergeSharedCursorPacket({}, raw(1), "peer:b", "나", undefined, 1_000);
    directory = mergeSharedCursorPacket(directory, raw(2), "peer:a", "가가", undefined, 1_000);
    directory = mergeSharedCursorPacket(directory, raw(3), "peer:c", "다다", undefined, 1_000);
    const peers = listSharedCursorPeers(directory, "peer:b");
    expect(peers.map((peer) => peer.sessionId)).toEqual(["peer:a", "peer:c"]);
  });
});

describe("cursor-click side channel", () => {
  function makeClickPacket(overrides: Partial<StudioSharedCursorClickPacket> = {}): StudioSharedCursorClickPacket {
    return {
      wire: "toonstudio-space-v1",
      kind: "cursor-click",
      sequence: 3,
      at: 1_700_000,
      click: { x: 400, y: 300 },
      ...overrides,
    };
  }

  it("클릭 패킷을 파싱·인코딩한다", () => {
    const raw = encodeStudioSharedCursorClickPacket(makeClickPacket()) ?? "";
    const parsed = parseStudioSharedCursorClickPacket(raw);
    expect(parsed).toMatchObject({
      wire: "toonstudio-space-v1",
      kind: "cursor-click",
      sequence: 3,
      click: { x: 400, y: 300 },
    });
  });

  it("잘못된 클릭 패킷을 거부한다", () => {
    expect(parseStudioSharedCursorClickPacket(JSON.stringify({ ...makeClickPacket(), kind: "cursor" }))).toBeNull();
    expect(parseStudioSharedCursorClickPacket(JSON.stringify(makeClickPacket({ click: { x: Number.NaN, y: 1 } })))).toBeNull();
    expect(parseStudioSharedCursorClickPacket("not json")).toBeNull();
  });

  it("클릭을 디렉터리에 병합한다", () => {
    const raw = encodeStudioSharedCursorClickPacket(makeClickPacket()) ?? "";
    const directory = mergeSharedCursorClick({}, raw, "peer:jun", "준", undefined, 2_000);
    const peer = directory["peer:jun"];
    expect(peer?.lastClick).toMatchObject({ x: 400, y: 300, at: 2_000, sequence: 3 });
    expect(sharedCursorClickVisible(peer?.lastClick, 2_000)).toBe(true);
    expect(sharedCursorClickVisible(peer?.lastClick, 2_000 + STUDIO_SHARED_CURSOR_CLICK_TTL_MS + 1)).toBe(false);
  });

  it("오래된 클릭 시퀀스는 무시한다", () => {
    const first = encodeStudioSharedCursorClickPacket(makeClickPacket({ sequence: 5 })) ?? "";
    const stale = encodeStudioSharedCursorClickPacket(makeClickPacket({ sequence: 4, click: { x: 1, y: 1 } })) ?? "";
    const afterFirst = mergeSharedCursorClick({}, first, "peer:jun", "준", undefined, 2_000);
    const afterStale = mergeSharedCursorClick(afterFirst, stale, "peer:jun", "준", undefined, 2_100);
    expect(afterStale["peer:jun"]?.lastClick?.x).toBe(400);
  });

  it("만료된 클릭 하이라이트만 지우고 피어는 유지한다", () => {
    const raw = encodeStudioSharedCursorClickPacket(makeClickPacket()) ?? "";
    const directory = mergeSharedCursorClick({}, raw, "peer:jun", "준", undefined, 1_000);
    const pruned = pruneSharedCursorDirectory(directory, 1_000 + STUDIO_SHARED_CURSOR_CLICK_TTL_MS + 1);
    expect(pruned["peer:jun"]?.lastClick).toBeNull();
    expect(pruned["peer:jun"]?.sessionId).toBe("peer:jun");
    // 만료 전에는 같은 객체를 유지한다
    expect(pruneSharedCursorDirectory(directory, 1_100)).toBe(directory);
  });

  it("커서 패킷 병합이 클릭 하이라이트를 보존한다", () => {
    const clickRaw = encodeStudioSharedCursorClickPacket(makeClickPacket()) ?? "";
    const cursorRaw = encodeStudioSharedCursorPacket(makePacket({ sequence: 8 })) ?? "";
    let directory = mergeSharedCursorClick({}, clickRaw, "peer:jun", "준", undefined, 1_000);
    directory = mergeSharedCursorPacket(directory, cursorRaw, "peer:jun", "준", undefined, 1_100);
    expect(directory["peer:jun"]?.lastClick?.x).toBe(400);
  });
});
