/**
 * 녹음부스 입장 게이트 (트랙 B 고도화).
 *
 * 부스 구역을 두 가지 기존 시스템과 조합한다.
 * - 조용한 구역(silent zone): 부스 zone을 `StudioSilentZone`으로 변환해
 *   `useStudioVirtualSpaceSilentZone`의 `tileZones`에 그대로 넣을 수 있다.
 *   부스 안에서는 스페이셜 음성 채팅 마이크가 자동으로 음소되고, 녹음은
 *   부스 전용 드라이버가 별도 스트림으로 캡처하므로 서로 방해하지 않는다.
 * - 스페이스 예약: `exclusive` 부스는 `checkSpaceBookingAt`로 현재 시각에
 *   유효한 예약이 있을 때만 녹음을 허용한다. 예약 판정은 부스의 `roomId`를
 *   예약의 `spaceId`로 매핑한다(예약 패널에서 녹음부스를 스페이스로 등록).
 *
 * 이 모듈은 순수 판정만 제공한다. 실제 마이크 장치 제어와 녹음 시작은
 * 호출자(훅·패널)가 `canRecord`/`effectiveMuted`를 읽어 수행한다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  studioRecordingBoothContains,
  type StudioRecordingBoothConfig,
} from "./studio-virtual-space-recording-booth";
import {
  createSilentZone,
  type StudioSilentZone,
} from "./studio-virtual-space-silent-zone";
import {
  checkSpaceBookingAt,
  type StudioSpaceBooking,
} from "./studio-virtual-space-space-booking";

/** 부스 구역을 조용한 구역으로 변환한다. silent-zone 훅의 tileZones 입력용. */
export function recordingBoothSilentZone(config: StudioRecordingBoothConfig): StudioSilentZone {
  const zone = createSilentZone({
    id: `booth:${config.boothId}`,
    name: "녹음부스",
    rect: { x: config.zone.x, y: config.zone.y, width: config.zone.width, height: config.zone.height },
  });
  // boothId·zone이 설정 검증을 통과하지 못한 경우에도 게이트 판정은 계속되도록
  // 살균 없이 같은 모양으로 만든다(contains 판정은 좌표만 본다).
  return zone ?? Object.freeze({
    id: `booth:${config.boothId}`,
    name: "녹음부스",
    rect: Object.freeze({ ...config.zone }),
  });
}

export type StudioRecordingBoothAccessState =
  /** 부스 구역 밖. */
  | "outside"
  /** 부스 안, 독점이 꺼져 있어 자유롭게 녹음 가능. */
  | "open"
  /** 부스 안, 현재 시각에 유효한 예약이 있고 녹음 가능. */
  | "booked"
  /** 부스 안이지만 현재 시각에 예약이 없어 녹음 불가. */
  | "booking-required"
  /** 부스 안이지만 다른 예약자의 시간이라 녹음 불가. */
  | "booked-by-other";

export interface StudioRecordingBoothAccess {
  readonly inside: boolean;
  readonly state: StudioRecordingBoothAccessState;
  /** 지금 녹음을 시작할 수 있는지. */
  readonly canRecord: boolean;
  /** 현재 시각에 유효한 예약. 없으면 null. */
  readonly activeBooking: StudioSpaceBooking | null;
}

export interface StudioRecordingBoothAccessInput {
  readonly config: StudioRecordingBoothConfig;
  readonly bookings: readonly StudioSpaceBooking[];
  readonly position: StudioVirtualSpacePoint | null;
  readonly atMs: number;
  /**
   * 현재 사용자 표시 이름. 예약자 명단(bookerNames)과 정확히 일치하면
   * 본인 예약으로 본다. 생략하면 신원을 확인할 수 없어 예약 존재만으로
   * 허용한다 — 독점을 강제하려면 호출자가 반드시 이름을 넘겨야 한다.
   */
  readonly userName?: string | null;
}

/** 예약자 명단에 현재 사용자가 있는지. 이름은 앞뒤 공백을 무시하고 비교한다. */
function bookingIncludesUser(booking: StudioSpaceBooking, userName: string): boolean {
  const target = userName.trim();
  if (!target) return false;
  return booking.bookerNames.some((name) => name.trim() === target);
}

/**
 * 부스 입장·녹음 가능 판정.
 *
 * - 구역 밖: outside.
 * - 독점 꺼짐: open (예약 무관).
 * - 독점 켜짐: 현재 예약이 없으면 booking-required, 예약이 있는데 명단에
 *   현재 사용자가 없으면 booked-by-other, 명단에 있거나 신원 미제공이면 booked.
 */
export function resolveStudioRecordingBoothAccess(
  input: StudioRecordingBoothAccessInput,
): StudioRecordingBoothAccess {
  const { config, bookings, position, atMs, userName } = input;
  const inside = position ? studioRecordingBoothContains(config, position) : false;
  if (!inside) {
    return Object.freeze({ inside: false, state: "outside", canRecord: false, activeBooking: null });
  }
  if (!config.exclusive) {
    return Object.freeze({ inside: true, state: "open", canRecord: true, activeBooking: null });
  }
  const activeBooking = checkSpaceBookingAt(bookings, config.roomId, atMs);
  if (!activeBooking) {
    return Object.freeze({ inside: true, state: "booking-required", canRecord: false, activeBooking: null });
  }
  if (userName != null && userName.trim() !== "" && !bookingIncludesUser(activeBooking, userName)) {
    return Object.freeze({ inside: true, state: "booked-by-other", canRecord: false, activeBooking });
  }
  return Object.freeze({ inside: true, state: "booked", canRecord: true, activeBooking });
}
