import { describe, expect, it } from "vitest";
import {
  advanceStudioNpcDialogue,
  EMPTY_NPC_DIALOGUE_VISIT_STATE,
  recordNpcDialogueVisit,
  STUDIO_NPC_GUIDE_MIRO_DIALOGUE_TREE,
  studioNpcDefaultDialogue,
  studioNpcDialogueFor,
  studioNpcDialogueStartNode,
} from "./studio-virtual-space-npc-dialogue-context";

describe("NPC 상황별 대화", () => {
  it("방 특화 대사가 최우선이다", () => {
    const line = studioNpcDialogueFor({ roomKind: "lounge", hour: 12, weather: null });
    expect(line.tags).toContain("lounge");
    expect(line.ko.length).toBeGreaterThan(0);
    expect(line.en.length).toBeGreaterThan(0);
  });

  it("회의실 대사가 나온다", () => {
    const line = studioNpcDialogueFor({ roomKind: "meeting-room", hour: 9, weather: null });
    expect(line.tags).toContain("meeting-room");
  });

  it("방이 없으면 날씨 대사가 나온다", () => {
    const line = studioNpcDialogueFor({ roomKind: null, hour: 12, weather: "rain" });
    expect(line.tags).toContain("rain");
  });

  it("방·날씨가 없으면 시간대 대사가 나온다", () => {
    const morning = studioNpcDialogueFor({ roomKind: null, hour: 8, weather: "clear" });
    expect(morning.tags).toContain("morning");
    const night = studioNpcDialogueFor({ roomKind: null, hour: 23, weather: "clear" });
    expect(night.tags).toContain("night");
  });

  it("알 수 없는 방은 시간대 대사로 폴백한다", () => {
    const line = studioNpcDialogueFor({ roomKind: "unknown-room", hour: 14, weather: null });
    expect(line.tags).toContain("afternoon");
  });

  it("같은 seed는 같은 대사를 반환한다 (결정적)", () => {
    const context = { roomKind: "rooftop", hour: 20, weather: null, seed: 3 } as const;
    expect(studioNpcDialogueFor(context)).toEqual(studioNpcDialogueFor(context));
  });

  it("다른 seed는 대사를 순환한다", () => {
    const a = studioNpcDialogueFor({ roomKind: "lobby", hour: 10, weather: null, seed: 0 });
    const b = studioNpcDialogueFor({ roomKind: "lobby", hour: 10, weather: null, seed: 1 });
    expect(a.ko).not.toBe(b.ko);
  });

  it("기본 대사를 반환한다", () => {
    const line = studioNpcDefaultDialogue();
    expect(line.tags).toContain("default");
  });
});

describe("분기형 다이얼로그 트리", () => {
  const tree = STUDIO_NPC_GUIDE_MIRO_DIALOGUE_TREE;

  it("첫 방문에는 환영 노드가 시작이다", () => {
    const node = studioNpcDialogueStartNode(tree, EMPTY_NPC_DIALOGUE_VISIT_STATE);
    expect(node.id).toBe("welcome");
    expect(node.choices.length).toBeGreaterThan(0);
  });

  it("재방문(2회 이상)에는 환영 복귀 노드가 시작이다", () => {
    const visited = recordNpcDialogueVisit(
      recordNpcDialogueVisit(EMPTY_NPC_DIALOGUE_VISIT_STATE, tree.npcId),
      tree.npcId,
    );
    const node = studioNpcDialogueStartNode(tree, visited);
    expect(node.id).toBe("welcome-back");
  });

  it("선택지로 다음 노드로 전이한다", () => {
    const next = advanceStudioNpcDialogue(tree, "welcome", "to-lounge");
    expect(next?.id).toBe("lounge-info");
    const farewell = advanceStudioNpcDialogue(tree, "lounge-info", "ok");
    expect(farewell?.id).toBe("farewell");
    expect(farewell?.terminal).toBe(true);
  });

  it("없는 선택지는 null이다", () => {
    expect(advanceStudioNpcDialogue(tree, "welcome", "nope")).toBeNull();
    expect(advanceStudioNpcDialogue(tree, "nope", "ok")).toBeNull();
  });

  it("방문 기록이 누적된다", () => {
    const once = recordNpcDialogueVisit(EMPTY_NPC_DIALOGUE_VISIT_STATE, tree.npcId);
    expect(once.visits[tree.npcId]).toBe(1);
    const twice = recordNpcDialogueVisit(once, tree.npcId);
    expect(twice.visits[tree.npcId]).toBe(2);
  });
});
