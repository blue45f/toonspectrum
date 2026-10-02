/**
 * 녹음부스 입장 게이트 테스트 (트랙 B)
 */
import { describe, expect, it } from "vitest";

import type { StudioRecordingBoothConfig } from "./studio-virtual-space-recording-booth";
import {
  recordingBoothSilentZone,
  resolveStudioRecordingBoothAccess,
} from "./studio-virtual-space-recording-booth-entry";
import type { StudioSpaceBooking } from "./studio-virtual-space-space-booking";

function config(overrides: Partial<StudioRecordingBoothConfig> = {}): StudioRecordingBoothConfig {
  return {
    boothId: "booth-a",
    roomId: "recording-booth",
    zone: { x: 100, y: 100, width: 200, height: 160 },
    reverb: "room",
    maxDurationSec: 300,
    exclusive: true,
    ...overrides,
  };
}

function booking(overrides: Partial<StudioSpaceBooking> = {}): StudioSpaceBooking {
  return {
    id: "booking-1",
    spaceId: "recording-booth",
    spaceName: "녹음부스",
    capacity: 2,
    equipmentTags: ["마이크"],
    startsAt: 1_000,
    endsAt: 2_000,
    bookerNames: ["김작가"],
    note: "",
    status: "confirmed",
    ...overrides,
  };
}

const INSIDE = { x: 150, y: 150 };
const OUTSIDE = { x: 20, y: 20 };

describe("부스 조용한 구역 변환", () => {
  it("부스 zone을 silent zone rect로 옮긴다", () => {
    const zone = recordingBoothSilentZone(config());
    expect(zone.id).toBe("booth:booth-a");
    expect(zone.rect).toEqual({ x: 100, y: 100, width: 200, height: 160 });
  });
});

describe("입장 게이트", () => {
  it("구역 밖이면 outside이고 녹음할 수 없다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [booking()], position: OUTSIDE, atMs: 1_500, userName: "김작가",
    });
    expect(access).toMatchObject({ inside: false, state: "outside", canRecord: false, activeBooking: null });
  });

  it("위치가 없으면 outside로 본다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [], position: null, atMs: 1_500,
    });
    expect(access.state).toBe("outside");
  });

  it("독점이 꺼져 있으면 예약 없이도 녹음할 수 있다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config({ exclusive: false }), bookings: [], position: INSIDE, atMs: 1_500, userName: "김작가",
    });
    expect(access).toMatchObject({ inside: true, state: "open", canRecord: true });
  });

  it("독점 부스는 예약 시간이 아니면 녹음할 수 없다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [booking()], position: INSIDE, atMs: 500, userName: "김작가",
    });
    expect(access).toMatchObject({ state: "booking-required", canRecord: false, activeBooking: null });
    const after = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [booking()], position: INSIDE, atMs: 2_500, userName: "김작가",
    });
    expect(after.state).toBe("booking-required");
  });

  it("내 예약 시간에는 녹음할 수 있다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [booking()], position: INSIDE, atMs: 1_500, userName: "김작가",
    });
    expect(access.state).toBe("booked");
    expect(access.canRecord).toBe(true);
    expect(access.activeBooking?.id).toBe("booking-1");
  });

  it("다른 사람 예약 시간에는 녹음할 수 없다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [booking()], position: INSIDE, atMs: 1_500, userName: "이작가",
    });
    expect(access).toMatchObject({
      state: "booked-by-other",
      canRecord: false,
      activeBooking: { id: "booking-1" },
    });
  });

  it("신원을 모르면 예약 존재만으로 허용한다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [booking()], position: INSIDE, atMs: 1_500,
    });
    expect(access).toMatchObject({ state: "booked", canRecord: true });
  });

  it("다른 스페이스의 예약은 부스 게이트에 영향을 주지 않는다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config(),
      bookings: [booking({ spaceId: "conti-room" })],
      position: INSIDE, atMs: 1_500, userName: "김작가",
    });
    expect(access.state).toBe("booking-required");
  });

  it("취소된 예약은 유효하지 않다", () => {
    const access = resolveStudioRecordingBoothAccess({
      config: config(),
      bookings: [booking({ status: "cancelled" })],
      position: INSIDE, atMs: 1_500, userName: "김작가",
    });
    expect(access.state).toBe("booking-required");
  });

  it("예약 경계(시작 포함·종료 제외)를 따른다", () => {
    const atStart = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [booking()], position: INSIDE, atMs: 1_000, userName: "김작가",
    });
    expect(atStart.state).toBe("booked");
    const atEnd = resolveStudioRecordingBoothAccess({
      config: config(), bookings: [booking()], position: INSIDE, atMs: 2_000, userName: "김작가",
    });
    expect(atEnd.state).toBe("booking-required");
  });
});
