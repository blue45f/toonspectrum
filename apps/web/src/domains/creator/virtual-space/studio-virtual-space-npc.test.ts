import { describe, expect, it } from "vitest";
import {
  activateNpcService,
  advanceAmbientNpcs,
  ambientNpcTimeHint,
  createAmbientNpcStates,
  isNpcServing,
  npcGreetingText,
  npcMentorTip,
  npcRoleLabel,
  npcServiceText,
  STUDIO_AMBIENT_NPC_DEFINITIONS,
  STUDIO_NPC_GREET_COOLDOWN_MS,
  type StudioAmbientNpcInput,
} from "./studio-virtual-space-npc";

function baseInput(overrides: Partial<StudioAmbientNpcInput> = {}): StudioAmbientNpcInput {
  return {
    selfPoint: { x: 640, y: 500 },
    obstacles: [],
    others: [],
    deltaSeconds: 1 / 60,
    nowMs: 1000,
    elapsedMs: 0,
    ...overrides,
  };
}

describe("createAmbientNpcStates", () => {
  it("기본 NPC 4종을 생성한다", () => {
    const states = createAmbientNpcStates();
    expect(states).toHaveLength(4);
    expect(states.map((s) => s.definition.role).sort()).toEqual(["barista", "guide", "mentor", "receptionist"]);
  });

  it("정의된 스킨 키를 사용한다", () => {
    const byRole = new Map(createAmbientNpcStates().map((s) => [s.definition.role, s.definition.skinKey]));
    expect(byRole.get("guide")).toBe("npc-concierge");
    expect(byRole.get("barista")).toBe("npc-cafe");
    expect(byRole.get("mentor")).toBe("npc-artist");
    expect(byRole.get("receptionist")).toBe("npc-producer");
  });
});

describe("advanceAmbientNpcs", () => {
  it("NPC가 웨이포인트를 향해 이동한다", () => {
    let states = createAmbientNpcStates();
    const start = states[0]!.wander.physics.position;
    for (let ms = 1000; ms < 20000; ms += 16) {
      states = advanceAmbientNpcs(states, baseInput({ nowMs: ms })).states;
    }
    const moved = states.some((s) =>
      Math.hypot(s.wander.physics.position.x - start.x, s.wander.physics.position.y - start.y) > 5);
    expect(moved).toBe(true);
  });

  it("플레이어가 다가가면 인사 이벤트가 발생한다", () => {
    const states = createAmbientNpcStates();
    // 가이드 NPC 홈(640,140) 근처에 플레이어 배치
    const input = baseInput({ selfPoint: { x: 640, y: 180 }, nowMs: 1000 });
    const { events } = advanceAmbientNpcs(states, input);
    const greeted = events.filter((e) => e.kind === "npc-greeted");
    expect(greeted.length).toBeGreaterThan(0);
    expect(greeted[0]).toMatchObject({ npcId: "npc-guide-moa", role: "guide" });
  });

  it("인사 쿨다운 동안은 다시 인사하지 않는다", () => {
    const states = createAmbientNpcStates();
    const input = baseInput({ selfPoint: { x: 640, y: 180 }, nowMs: 1000 });
    const first = advanceAmbientNpcs(states, input);
    const second = advanceAmbientNpcs(first.states, baseInput({
      selfPoint: { x: 640, y: 180 },
      nowMs: 1000 + STUDIO_NPC_GREET_COOLDOWN_MS - 1,
    }));
    expect(second.events.filter((e) => e.kind === "npc-greeted")).toHaveLength(0);
  });

  it("쿨다운이 지나면 다시 인사한다", () => {
    const states = createAmbientNpcStates();
    const input = baseInput({ selfPoint: { x: 640, y: 180 }, nowMs: 1000 });
    const first = advanceAmbientNpcs(states, input);
    const second = advanceAmbientNpcs(first.states, baseInput({
      selfPoint: { x: 640, y: 180 },
      nowMs: 1000 + STUDIO_NPC_GREET_COOLDOWN_MS + 1,
    }));
    expect(second.events.filter((e) => e.kind === "npc-greeted").length).toBeGreaterThan(0);
  });

  it("인사할 때 플레이어를 바라본다", () => {
    const states = createAmbientNpcStates();
    // 바리스타 홈(1060,720) 왼쪽에서 접근 → 오른쪽을 바라봐야 함
    const { states: next } = advanceAmbientNpcs(states, baseInput({
      selfPoint: { x: 980, y: 720 },
      nowMs: 1000,
    }));
    const barista = next.find((s) => s.definition.role === "barista")!;
    expect(barista.wander.facing).toBe("left");
  });
});

describe("activateNpcService", () => {
  it("바리스타는 커피를 제공한다", () => {
    const states = createAmbientNpcStates();
    const { states: next, event } = activateNpcService("npc-barista-lin", states, 5000);
    expect(event).toMatchObject({ kind: "npc-service", role: "barista", service: "coffee" });
    const barista = next.find((s) => s.definition.id === "npc-barista-lin")!;
    expect(isNpcServing(barista, 5000)).toBe(true);
    expect(isNpcServing(barista, 5000 + 5000)).toBe(false);
  });

  it("멘토는 드로잉 팁을 제공한다", () => {
    const states = createAmbientNpcStates();
    const { event } = activateNpcService("npc-mentor-haru", states, 5000);
    expect(event).toMatchObject({ kind: "npc-service", role: "mentor", service: "tip" });
  });

  it("없는 NPC id면 이벤트 없이 그대로 반환한다", () => {
    const states = createAmbientNpcStates();
    const { states: next, event } = activateNpcService("npc-unknown", states, 5000);
    expect(event).toBeNull();
    expect(next).toBe(states);
  });
});

describe("ambientNpcTimeHint", () => {
  it("역할별 시간대 힌트를 반환한다", () => {
    expect(ambientNpcTimeHint("guide", "arrival")).toBe("welcome");
    expect(ambientNpcTimeHint("barista", "break")).toBe("serve");
    expect(ambientNpcTimeHint("mentor", "work")).toBe("station");
    expect(ambientNpcTimeHint("receptionist", "meeting")).toBe("station");
    expect(ambientNpcTimeHint("guide", "work")).toBe("patrol");
  });

  it("serve 힌트 시간에는 바리스타가 홈에 머문다", () => {
    // break period: elapsedMs를 주기의 0.6 지점으로 (0.55~0.66 = break)
    const breakElapsed = Math.floor(12 * 60 * 1000 * 0.6);
    let states = createAmbientNpcStates();
    for (let i = 0; i < 600; i++) {
      states = advanceAmbientNpcs(states, baseInput({ nowMs: 1000 + i * 16, elapsedMs: breakElapsed })).states;
    }
    const barista = states.find((s) => s.definition.role === "barista")!;
    const home = barista.definition.home;
    const dist = Math.hypot(
      barista.wander.physics.position.x - home.x,
      barista.wander.physics.position.y - home.y,
    );
    expect(dist).toBeLessThan(60);
  });
});

describe("문구", () => {
  it("역할 라벨이 있다", () => {
    expect(npcRoleLabel("barista")).toEqual({ ko: "바리스타", en: "Barista" });
  });

  it("인사 문구가 있다", () => {
    const text = npcGreetingText("guide");
    expect(text.ko).toContain("어서 오세요");
    expect(text.en.length).toBeGreaterThan(0);
  });

  it("멘토 팁이 순환한다", () => {
    expect(npcMentorTip(0).length).toBeGreaterThan(0);
    expect(npcMentorTip(100)).toBe(npcMentorTip(100 % 6));
  });

  it("서비스 문구가 있다", () => {
    const coffee = npcServiceText("barista", "coffee");
    expect(coffee.ko).toContain("커피");
    const tip = npcServiceText("mentor", "tip", 0);
    expect(tip.ko).toContain("💡");
  });

  it("기본 NPC 정의가 유효하다", () => {
    for (const def of STUDIO_AMBIENT_NPC_DEFINITIONS) {
      expect(def.waypoints.length).toBeGreaterThan(0);
      expect(def.home.x).toBeGreaterThanOrEqual(0);
      expect(def.home.x).toBeLessThanOrEqual(1280);
      expect(def.home.y).toBeLessThanOrEqual(960);
    }
  });
});
