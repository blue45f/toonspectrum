// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { createOfficeZone } from "./studio-virtual-space-office-zones";
import { useStudioVirtualSpaceZoneMic } from "./use-studio-virtual-space-zone-mic";

const SILENT_OFFICE = createOfficeZone({
  id: "zone-quiet",
  type: "focus-zone",
  labelKo: "조용한 집중존",
  labelEn: "Quiet Focus Zone",
  shape: { kind: "rect", x: 0, y: 0, width: 200, height: 200 },
  rules: [],
  silent: true,
})!;

const IN_SILENT = { x: 50, y: 50 };
const OUTSIDE = { x: 900, y: 900 };

/**
 * 근접 미디어 + 페이지 의도 추적을 흉내내는 하네스.
 * - actualMuted: 장치 실측 음소값. 중재 토글과 사용자 토글이 모두 뒤집는다.
 * - userMuted: 사용자의 음소 의도. 사용자 토글 때만 actualMuted와 함께 바뀐다.
 * - live=false면 micMuted는 null(연결 전).
 */
function setup({ live = true, point = OUTSIDE }: {
  readonly live?: boolean;
  readonly point?: { x: number; y: number };
} = {}) {
  let arbitrationToggles = 0;
  const harness = renderHook(
    ({ point: p, live: l }) => {
      const [actualMuted, setActualMuted] = useState(false);
      const [userMuted, setUserMuted] = useState(false);
      const binding = useStudioVirtualSpaceZoneMic({
        officeZones: [SILENT_OFFICE],
        position: p,
        userMicMuted: userMuted,
        micMuted: l ? actualMuted : null,
        onToggleMic: () => { arbitrationToggles += 1; setActualMuted((current) => !current); },
      });
      return {
        binding,
        actualMuted,
        /** 사용자의 마이크 버튼: 의도와 장치가 함께 뒤집힌다. */
        userToggleMic: () => { setUserMuted(!actualMuted); setActualMuted(!actualMuted); },
      };
    },
    { initialProps: { point, live } },
  );
  return {
    ...harness,
    arbitrationToggles: () => arbitrationToggles,
    moveTo: (next: { x: number; y: number }, nextLive = live) => {
      act(() => { harness.rerender({ point: { ...next }, live: nextLive }); });
    },
    setLive: (nextLive: boolean) => {
      act(() => { harness.rerender({ point, live: nextLive }); });
    },
    userToggleMic: () => { act(() => { harness.result.current.userToggleMic(); }); },
  };
}

describe("useStudioVirtualSpaceZoneMic", () => {
  it("조용한 구역에 들어가면 마이크가 자동으로 꺼지고 나가면 복원된다", () => {
    const { result, moveTo, arbitrationToggles } = setup();
    moveTo(IN_SILENT);
    expect(result.current.binding.mutedByZone).toBe(true);
    expect(result.current.binding.zone?.id).toBe("zone-quiet");
    expect(result.current.actualMuted).toBe(true);
    moveTo(OUTSIDE);
    expect(result.current.binding.mutedByZone).toBe(false);
    expect(result.current.actualMuted).toBe(false);
    expect(arbitrationToggles()).toBe(2);
  });

  it("원래 음소였던 사용자는 구역을 나가도 음소가 유지된다", () => {
    const { result, moveTo, userToggleMic, arbitrationToggles } = setup();
    userToggleMic();
    expect(result.current.actualMuted).toBe(true);
    moveTo(IN_SILENT);
    expect(result.current.binding.mutedByZone).toBe(true);
    moveTo(OUTSIDE);
    expect(result.current.binding.effectiveMuted).toBe(true);
    expect(result.current.actualMuted).toBe(true);
    // 사용자 토글 외에 중재 토글은 한 번도 일어나지 않는다.
    expect(arbitrationToggles()).toBe(0);
  });

  it("구역 밖에서는 어떤 중재 토글도 일어나지 않는다", () => {
    const { result, moveTo, arbitrationToggles } = setup();
    moveTo({ x: 950, y: 950 });
    expect(result.current.binding.zone).toBeNull();
    expect(result.current.actualMuted).toBe(false);
    expect(arbitrationToggles()).toBe(0);
  });

  it("구역 안에서 근접 미디어가 시작되면 시작 시점에 구역 음소가 적용된다", () => {
    const { result, setLive, arbitrationToggles } = setup({ live: false, point: IN_SILENT });
    expect(result.current.binding.mutedByZone).toBe(true);
    expect(result.current.actualMuted).toBe(false);
    setLive(true);
    expect(result.current.actualMuted).toBe(true);
    expect(arbitrationToggles()).toBe(1);
  });

  it("구역 안에서 사용자가 직접 켠 마이크는 중재가 다시 끄지 않는다", () => {
    const { result, moveTo, userToggleMic, arbitrationToggles } = setup();
    moveTo(IN_SILENT);
    expect(result.current.actualMuted).toBe(true);
    userToggleMic();
    expect(result.current.actualMuted).toBe(false);
    // 구역 안에서 위치가 바뀌어도 effectiveMuted가 그대로라 재적용이 없다.
    moveTo({ x: 60, y: 60 });
    expect(result.current.binding.effectiveMuted).toBe(true);
    expect(result.current.actualMuted).toBe(false);
    expect(arbitrationToggles()).toBe(1);
    // 퇴장해도 이미 켜져 있어 추가 토글이 없다.
    moveTo(OUTSIDE);
    expect(result.current.actualMuted).toBe(false);
    expect(arbitrationToggles()).toBe(1);
  });
});
