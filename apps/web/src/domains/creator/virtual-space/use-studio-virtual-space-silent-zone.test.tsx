// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createOfficeZone } from "./studio-virtual-space-office-zones";
import { useStudioVirtualSpaceSilentZone } from "./use-studio-virtual-space-silent-zone";

const SILENT_OFFICE = createOfficeZone({
  id: "zone-quiet",
  type: "focus-zone",
  labelKo: "조용한 집중존",
  labelEn: "Quiet Focus Zone",
  shape: { kind: "rect", x: 0, y: 0, width: 200, height: 200 },
  rules: [],
  silent: true,
})!;
const NORMAL_OFFICE = createOfficeZone({
  id: "zone-open",
  type: "lounge",
  labelKo: "오픈 라운지",
  labelEn: "Open Lounge",
  shape: { kind: "rect", x: 500, y: 500, width: 200, height: 200 },
  rules: [],
})!;

const IN_SILENT = { x: 50, y: 50 };
const IN_NORMAL = { x: 550, y: 550 };
const OUTSIDE = { x: 900, y: 900 };

function setup(initialPoint: { x: number; y: number } = OUTSIDE, micMutedByUser = false) {
  const { result, rerender } = renderHook(
    ({ point, muted }) => useStudioVirtualSpaceSilentZone({
      officeZones: [SILENT_OFFICE, NORMAL_OFFICE],
      position: point,
      micMutedByUser: muted,
    }),
    { initialProps: { point: initialPoint, muted: micMutedByUser } },
  );
  return {
    result,
    moveTo: (point: { x: number; y: number }, muted = micMutedByUser) => {
      act(() => { rerender({ point: { ...point }, muted }); });
    },
  };
}

describe("useStudioVirtualSpaceSilentZone", () => {
  it("밖에서는 음소되지 않는다", () => {
    const { result } = setup(OUTSIDE);
    expect(result.current.zone).toBeNull();
    expect(result.current.mutedByZone).toBe(false);
    expect(result.current.effectiveMuted).toBe(false);
  });

  it("silent 존 진입 시 자동 음소 + 뱃지용 존 반환", () => {
    const { result, moveTo } = setup(OUTSIDE);
    moveTo(IN_SILENT);
    expect(result.current.zone?.id).toBe("zone-quiet");
    expect(result.current.mutedByZone).toBe(true);
    expect(result.current.effectiveMuted).toBe(true);
    expect(result.current.lastTransition).toBe("enter");
  });

  it("퇴장 시 진입 전 마이크 상태로 복원된다", () => {
    const { result, moveTo } = setup(OUTSIDE);
    moveTo(IN_SILENT);
    expect(result.current.effectiveMuted).toBe(true);
    moveTo(OUTSIDE);
    expect(result.current.zone).toBeNull();
    expect(result.current.mutedByZone).toBe(false);
    // 진입 전 micMutedByUser=false였으므로 복원된다.
    expect(result.current.effectiveMuted).toBe(false);
  });

  it("진입 전부터 음소였던 사용자는 퇴장 후에도 음소 유지", () => {
    const { result, moveTo } = setup(OUTSIDE, true);
    moveTo(IN_SILENT, true);
    expect(result.current.effectiveMuted).toBe(true);
    moveTo(OUTSIDE, true);
    expect(result.current.mutedByZone).toBe(false);
    expect(result.current.effectiveMuted).toBe(true);
  });

  it("silent 플래그가 없는 존에서는 음소되지 않는다", () => {
    const { result, moveTo } = setup(OUTSIDE);
    moveTo(IN_NORMAL);
    expect(result.current.zone).toBeNull();
    expect(result.current.mutedByZone).toBe(false);
  });

  it("D-1 타일 태그 구역도 함께 본다", () => {
    const tileZone = { id: "tile-quiet", name: "타일 조용 구역", rect: { x: 800, y: 0, width: 100, height: 100 } };
    const { result } = renderHook(() => useStudioVirtualSpaceSilentZone({
      officeZones: [SILENT_OFFICE],
      tileZones: [tileZone],
      position: { x: 850, y: 50 },
      micMutedByUser: false,
    }));
    expect(result.current.zone?.id).toBe("tile-quiet");
    expect(result.current.mutedByZone).toBe(true);
  });
});
