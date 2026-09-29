import { describe, expect, it } from "vitest";
import {
  STUDIO_DOOR_TRANSITION_MS,
  createStudioDoor,
  stepStudioDoor,
  studioDoorActionLabel,
  studioDoorIsClosed,
  studioDoorIsOpen,
  studioDoorOpenRatio,
  toggleStudioDoor,
} from "./studio-virtual-space-door-state";

const door = () => createStudioDoor({ id: "d1", labelKo: "회의실 문", labelEn: "Meeting room door" });

describe("문 생성", () => {
  it("기본은 닫힘 상태다", () => {
    const created = door();
    expect(created.state).toBe("closed");
    expect(studioDoorIsClosed(created)).toBe(true);
    expect(studioDoorIsOpen(created)).toBe(false);
    expect(studioDoorOpenRatio(created)).toBe(0);
  });

  it("open 옵션으로 열린 상태 생성", () => {
    const created = createStudioDoor({ id: "d1", labelKo: "문", labelEn: "Door", open: true });
    expect(created.state).toBe("open");
    expect(studioDoorOpenRatio(created)).toBe(1);
  });
});

describe("문 토글", () => {
  it("닫힘 → 열기 중 → 열림으로 전이한다", () => {
    const opening = toggleStudioDoor(door(), { time: 1_000, reducedMotion: false });
    expect(opening.state).toBe("opening");
    const stepped = stepStudioDoor(opening, 1_000 + STUDIO_DOOR_TRANSITION_MS);
    expect(stepped.state).toBe("open");
    expect(studioDoorIsOpen(stepped)).toBe(true);
  });

  it("열림 → 닫기 중 → 닫힘으로 전이한다", () => {
    const opened = createStudioDoor({ id: "d1", labelKo: "문", labelEn: "Door", open: true });
    const closing = toggleStudioDoor(opened, { time: 2_000, reducedMotion: false });
    expect(closing.state).toBe("closing");
    const stepped = stepStudioDoor(closing, 2_000 + STUDIO_DOOR_TRANSITION_MS);
    expect(stepped.state).toBe("closed");
  });

  it("전이 중 토글하면 반대 방향으로 전환한다", () => {
    const opening = toggleStudioDoor(door(), { time: 1_000, reducedMotion: false });
    const reversed = toggleStudioDoor(opening, { time: 1_200, reducedMotion: false });
    expect(reversed.state).toBe("closing");
  });

  it("reduced-motion에서는 즉시 전이한다", () => {
    const opened = toggleStudioDoor(door(), { time: 1_000, reducedMotion: true });
    expect(opened.state).toBe("open");
    const closed = toggleStudioDoor(opened, { time: 2_000, reducedMotion: true });
    expect(closed.state).toBe("closed");
  });
});

describe("열림 비율", () => {
  it("전이 중간은 0~1 사이 값을 가진다", () => {
    const opening = toggleStudioDoor(door(), { time: 1_000, reducedMotion: false });
    const mid = stepStudioDoor(opening, 1_000 + STUDIO_DOOR_TRANSITION_MS / 2);
    const ratio = studioDoorOpenRatio(mid);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeCloseTo(0.5, 1);
  });
});

describe("액션 라벨", () => {
  it("상태에 따라 열기/닫기가 바뀐다", () => {
    expect(studioDoorActionLabel(door())).toEqual({ ko: "문 열기", en: "Open door" });
    const opened = createStudioDoor({ id: "d1", labelKo: "문", labelEn: "Door", open: true });
    expect(studioDoorActionLabel(opened)).toEqual({ ko: "문 닫기", en: "Close door" });
  });
});
