/**
 * 조용한 구역 React 바인딩 (T2).
 *
 * 두 종류의 조용한 구역을 묶는다.
 * - 오피스 존의 `silent` 플래그 (studio-virtual-space-office-zones.ts).
 * - D-1 타일 이펙트의 `silent` 태그 구역 (StudioSilentZone 형태).
 *
 * position이 바뀌면 구역 전이를 판정해 `reduceSilentMuteState`로 음소 상태를
 * 갱신한다. 실제 마이크 장치 제어는 `effectiveMuted` 값을 읽은 호출자가 수행한다.
 * "조용한 구역" 뱃지는 `zone`을 StudioVirtualSpaceSilentZoneBadge에 넘기면 된다.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  officeZoneBounds,
  type StudioOfficeZone,
} from "./studio-virtual-space-office-zones";
import {
  findSilentZone,
  INITIAL_STUDIO_SILENT_MUTE_STATE,
  reduceSilentMuteState,
  resolveSilentMicMuted,
  resolveSilentZoneTransition,
  type StudioSilentZone,
  type StudioSilentZoneTransition,
} from "./studio-virtual-space-silent-zone";

export interface UseStudioVirtualSpaceSilentZoneInput {
  readonly officeZones: readonly StudioOfficeZone[];
  /** D-1 타일 이펙트 조용한 구역. */
  readonly tileZones?: readonly StudioSilentZone[];
  readonly position: StudioVirtualSpacePoint | null;
  /** 호출자가 알고 있는 사용자 마이크 음소 상태. */
  readonly micMutedByUser: boolean;
}

export interface StudioVirtualSpaceSilentZoneBinding {
  /** 현재 속한 조용한 구역. 없으면 null (뱃지 숨김). */
  readonly zone: StudioSilentZone | null;
  /** 구역 때문에 음소된 상태인지. */
  readonly mutedByZone: boolean;
  /** 실제 마이크에 적용할 음소 값. */
  readonly effectiveMuted: boolean;
  /** 마지막 전이 (디버깅·로깅용). */
  readonly lastTransition: StudioSilentZoneTransition;
}

function officeZoneToSilentZone(zone: StudioOfficeZone): StudioSilentZone {
  const bounds = officeZoneBounds(zone);
  return Object.freeze({
    id: zone.id,
    name: zone.labelKo,
    rect: Object.freeze({ ...bounds }),
  });
}

export function useStudioVirtualSpaceSilentZone(
  input: UseStudioVirtualSpaceSilentZoneInput,
): StudioVirtualSpaceSilentZoneBinding {
  const { officeZones, tileZones = [], position, micMutedByUser } = input;

  const silentZones = useMemo<readonly StudioSilentZone[]>(() => {
    const fromOffice = officeZones
      .filter((zone) => zone.silent === true)
      .map(officeZoneToSilentZone);
    return Object.freeze([...fromOffice, ...tileZones]);
  }, [officeZones, tileZones]);

  const [muteState, setMuteState] = useState(INITIAL_STUDIO_SILENT_MUTE_STATE);
  const [lastTransition, setLastTransition] = useState<StudioSilentZoneTransition>("stay-outside");
  const previousZoneId = useRef<string | null>(null);
  const micMutedByUserRef = useRef(micMutedByUser);
  micMutedByUserRef.current = micMutedByUser;

  useEffect(() => {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    const zone = findSilentZone(silentZones, position.x, position.y);
    const zoneId = zone?.id ?? null;
    // 구역이 바뀌지 않았으면 전이가 아니다. silentZones 배열 재생성으로
    // effect가 재실행돼도 lastTransition을 덮어쓰지 않는다.
    if (zoneId === previousZoneId.current) return;
    const transition = resolveSilentZoneTransition(previousZoneId.current, zoneId);
    previousZoneId.current = zoneId;
    setLastTransition(transition);
    setMuteState((previous) =>
      reduceSilentMuteState(previous, transition, zoneId, micMutedByUserRef.current),
    );
  }, [silentZones, position]);

  const zone = muteState.zoneId
    ? (silentZones.find((candidate) => candidate.id === muteState.zoneId) ?? null)
    : null;

  return {
    zone,
    mutedByZone: muteState.mutedByZone,
    effectiveMuted: resolveSilentMicMuted(muteState, micMutedByUser),
    lastTransition,
  };
}
