import { describe, expect, it } from "vitest";
import type { StudioOfficeInteractionResult } from "./studio-virtual-space-office-interactables";
import {
  resolveOfficeWorkDecisions,
  STUDIO_MATERIALS_HREF,
  type StudioWorkBridgeContext,
} from "./studio-virtual-space-work-bridge";

const TEAM: StudioWorkBridgeContext = { projectId: "proj 1", personal: false, objectKind: null };
const PERSONAL: StudioWorkBridgeContext = { projectId: "proj 1", personal: true, objectKind: null };
const withKind = (base: StudioWorkBridgeContext, objectKind: StudioWorkBridgeContext["objectKind"]): StudioWorkBridgeContext =>
  ({ ...base, objectKind });

const kinds = (result: StudioOfficeInteractionResult, context: StudioWorkBridgeContext = TEAM): readonly string[] =>
  resolveOfficeWorkDecisions(result, context).map((decision) => decision.kind);

describe("resolveOfficeWorkDecisions — 업무 화면 연결", () => {
  it("화이트보드는 프로젝트 협업 캔버스로 이동한다", () => {
    const decisions = resolveOfficeWorkDecisions({ kind: "open-whiteboard", objectId: "wb" }, TEAM);
    expect(decisions).toEqual([{ kind: "route", href: "/studio/work/proj%201/canvas" }]);
  });

  it("개인 공간의 화이트보드는 내 스튜디오 홈으로 이동한다", () => {
    const decisions = resolveOfficeWorkDecisions({ kind: "open-whiteboard", objectId: "wb" }, PERSONAL);
    expect(decisions).toEqual([{ kind: "route", href: "/studio" }]);
  });

  it("프로젝트 보드는 오늘 보드 패널을 연다", () => {
    expect(resolveOfficeWorkDecisions({ kind: "open-project-board", objectId: "pb" }, TEAM))
      .toEqual([{ kind: "panel", panel: "today" }]);
  });

  it("책장은 자료 탐색 화면으로 이동한다", () => {
    expect(resolveOfficeWorkDecisions({ kind: "open-materials", objectId: "shelf" }, TEAM))
      .toEqual([{ kind: "route", href: STUDIO_MATERIALS_HREF }]);
    expect(STUDIO_MATERIALS_HREF).toBe("/research/material-assets");
  });

  it("게시판 공지는 오늘 보드 패널에서 확인한다", () => {
    expect(resolveOfficeWorkDecisions({ kind: "open-notices", objectId: "bb" }, TEAM))
      .toEqual([{ kind: "panel", panel: "today" }]);
  });
});

describe("resolveOfficeWorkDecisions — 회의 연결", () => {
  it("회의실 문과 회의 테이블 모두 상태 전이 후 허들로 이어진다", () => {
    for (const result of [{ kind: "enter-meeting", objectId: "door" }, { kind: "start-huddle", objectId: "table" }] as const) {
      expect(resolveOfficeWorkDecisions(result, TEAM)).toEqual([
        { kind: "status", userStatus: "in-meeting" },
        { kind: "huddle" },
      ]);
    }
  });
});

describe("resolveOfficeWorkDecisions — 책상과 집중", () => {
  it("내 책상에 앉으면 집중 상태와 집중 세션 시작이 함께 온다", () => {
    const sit: StudioOfficeInteractionResult = { kind: "sit", objectId: "desk", seatPoint: { x: 0, y: 0 } };
    expect(resolveOfficeWorkDecisions(sit, withKind(TEAM, "desk"))).toEqual([
      { kind: "status", userStatus: "focusing", activity: "focused" },
      { kind: "focus", command: "start" },
    ]);
  });

  it("내 책상에서 일어나면 세션을 멈추고 상태를 되돌린다", () => {
    expect(resolveOfficeWorkDecisions({ kind: "stand" }, withKind(TEAM, "desk"))).toEqual([
      { kind: "focus", command: "stop" },
      { kind: "status", userStatus: "available", activity: "available" },
    ]);
  });

  it("일반 의자의 앉기·일어서기는 알림만이다", () => {
    const sit: StudioOfficeInteractionResult = { kind: "sit", objectId: "chair", seatPoint: { x: 0, y: 0 } };
    expect(kinds(sit, withKind(TEAM, "chair"))).toEqual(["notice"]);
    expect(kinds({ kind: "stand" }, withKind(TEAM, "chair"))).toEqual(["notice"]);
    expect(kinds({ kind: "stand" }, TEAM)).toEqual(["notice"]);
  });
});

describe("resolveOfficeWorkDecisions — 휴식", () => {
  it("카페테리아 휴식은 상태 전이와 커피 이모트를 낸다", () => {
    expect(resolveOfficeWorkDecisions({ kind: "rest", objectId: "cafe" }, TEAM)).toEqual([
      { kind: "status", userStatus: "break" },
      { kind: "emote", emoteId: "coffee" },
    ]);
    expect(resolveOfficeWorkDecisions({ kind: "stop-rest" }, TEAM)).toEqual([
      { kind: "status", userStatus: "available" },
    ]);
  });

  it("커피를 가져가면 이모트 후 휴식 상태가 된다", () => {
    expect(resolveOfficeWorkDecisions({ kind: "take-coffee", objectId: "coffee" }, TEAM)).toEqual([
      { kind: "emote", emoteId: "coffee" },
      { kind: "status", userStatus: "break" },
    ]);
  });

  it("추출 중·문·조명은 알림만이다", () => {
    expect(kinds({ kind: "brew-coffee", objectId: "coffee" })).toEqual(["notice"]);
    expect(kinds({ kind: "toggle-door", objectId: "door", open: true })).toEqual(["notice"]);
    expect(kinds({ kind: "toggle-light", objectId: "light", on: false })).toEqual(["notice"]);
  });
});
