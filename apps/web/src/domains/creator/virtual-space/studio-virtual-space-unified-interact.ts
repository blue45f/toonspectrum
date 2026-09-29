/**
 * X키 통합 인터랙션 디스패처 (Gather Town X키 대응)
 *
 * 여러 인터랙션 레지스트리(오피스 오브젝트·조명 기구·문) 중에서
 * 플레이어에게 가장 가까운 하나를 골라 단일 명령으로 변환한다.
 *
 * - 기존 office-interactables / interactable-objects와 중복하지 않음
 * - 새로 추가된 조명·문 상태 머신을 X키 흐름에 연결하는 어댑터 역할
 *
 * 순수 로직 모듈.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  findNearestOfficeObject,
  officeActionText,
  type StudioOfficeObject,
} from "./studio-virtual-space-office-interactables";
import {
  studioDoorActionLabel,
  studioDoorIsOpen,
  type StudioDoor,
} from "./studio-virtual-space-door-state";
import type { StudioLightFixture } from "./studio-virtual-space-lighting";

export type StudioUnifiedInteractKind =
  | "office"   // 기존 오피스 오브젝트 (앉기·화이트보드·게시판 등)
  | "light"    // 조명 기구 토글
  | "door";    // 문 열기/닫기

export interface StudioUnifiedInteractTarget {
  readonly kind: StudioUnifiedInteractKind;
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly actionKo: string;
  readonly actionEn: string;
  readonly distance: number;
}

export type StudioUnifiedInteractCommand =
  | { readonly target: StudioUnifiedInteractTarget; readonly command: "activate-office" }
  | { readonly target: StudioUnifiedInteractTarget; readonly command: "toggle-light" }
  | { readonly target: StudioUnifiedInteractTarget; readonly command: "toggle-door" };

/** X키 프롬프트 표시 반경. */
export const STUDIO_UNIFIED_PROMPT_RADIUS = 90;

function distance(a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface StudioUnifiedInteractRegistries {
  readonly officeObjects: readonly StudioOfficeObject[];
  readonly lightFixtures: readonly (StudioLightFixture & { readonly labelKo?: string; readonly labelEn?: string })[];
  readonly doors: readonly (StudioDoor & { readonly position: StudioVirtualSpacePoint })[];
}

/**
 * 플레이어 위치에서 가장 가까운 인터랙션 대상을 찾는다.
 * 동점(거리 차이 1px 미만)이면 office > door > light 우선순위.
 */
export function findNearestUnifiedInteractTarget(
  registries: StudioUnifiedInteractRegistries,
  player: StudioVirtualSpacePoint,
  radius: number = STUDIO_UNIFIED_PROMPT_RADIUS,
): StudioUnifiedInteractTarget | null {
  const candidates: StudioUnifiedInteractTarget[] = [];

  const office = findNearestOfficeObject(registries.officeObjects, player, radius);
  if (office) {
    const action = officeActionText(office.kind);
    candidates.push({
      kind: "office",
      id: office.id,
      labelKo: office.labelKo,
      labelEn: office.labelEn,
      actionKo: action.ko,
      actionEn: action.en,
      distance: distance(player, office.position),
    });
  }

  for (const fixture of registries.lightFixtures) {
    const d = distance(player, fixture.position);
    if (d <= radius) {
      candidates.push({
        kind: "light",
        id: fixture.id,
        labelKo: fixture.labelKo ?? "조명",
        labelEn: fixture.labelEn ?? "Light",
        actionKo: fixture.on ? "끄기" : "켜기",
        actionEn: fixture.on ? "Turn off" : "Turn on",
        distance: d,
      });
    }
  }

  for (const door of registries.doors) {
    const d = distance(player, door.position);
    if (d <= radius) {
      const action = studioDoorActionLabel(door);
      candidates.push({
        kind: "door",
        id: door.id,
        labelKo: door.labelKo,
        labelEn: door.labelEn,
        actionKo: action.ko,
        actionEn: action.en,
        distance: d,
      });
    }
  }

  if (candidates.length === 0) return null;
  const priority: Record<StudioUnifiedInteractKind, number> = { office: 0, door: 1, light: 2 };
  candidates.sort((a, b) => {
    const diff = a.distance - b.distance;
    if (Math.abs(diff) >= 1) return diff;
    return priority[a.kind] - priority[b.kind];
  });
  return candidates[0];
}

/**
 * X키 입력을 통합 명령으로 변환한다.
 * 대상이 없으면 null (무시).
 */
export function handleUnifiedInteractKey(
  target: StudioUnifiedInteractTarget | null,
): StudioUnifiedInteractCommand | null {
  if (!target) return null;
  switch (target.kind) {
    case "office": return { target, command: "activate-office" };
    case "light": return { target, command: "toggle-light" };
    case "door": return { target, command: "toggle-door" };
  }
}

/** X키 프롬프트 텍스트 (예: "X — 문 열기"). */
export function unifiedInteractPromptText(target: StudioUnifiedInteractTarget): { ko: string; en: string } {
  return {
    ko: `X — ${target.actionKo}: ${target.labelKo}`,
    en: `X — ${target.actionEn}: ${target.labelEn}`,
  };
}

/** 문 상태에 따른 음향 구역 정책 힌트 (호출 측에서 acoustic 연동 시 사용). */
export function studioDoorAcousticHint(door: StudioDoor): "private" | "open" {
  return studioDoorIsOpen(door) ? "open" : "private";
}
