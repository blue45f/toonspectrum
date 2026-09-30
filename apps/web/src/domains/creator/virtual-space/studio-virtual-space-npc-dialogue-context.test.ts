import { describe, expect, it } from "vitest";
import {
  studioNpcDefaultDialogue,
  studioNpcDialogueFor,
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
