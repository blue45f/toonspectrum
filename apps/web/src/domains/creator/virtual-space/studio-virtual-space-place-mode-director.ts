/**
 * 장소-모드 디렉터 (Track 6).
 *
 * 아바타 위치를 받아 "걷다가 자연스럽게 일이 이어지는" 장소 기반 업무 플로우를
 * 상태머신으로 굴린다. 순수 로직 + 클로저 상태만 두며 DOM·렌더링에는 닿지 않는다.
 *
 *   const director = createPlaceModeDirector({ zones });
 *   director.update({ x, y });                 // 매 프레임(또는 이동 시) 위치 공급
 *   const events = director.consumeEvents();   // UI에 보여줄 이벤트 수거
 *   director.confirmJoin();                    // "참여하기" 확인 (회의실·스테이지)
 *
 * 상태: idle → entering(디바운스) → prompt(확인 대기) / engaged(세션 중)
 *        → exiting(디바운스) → idle. 모드 전환(switch)은 exit→enter로 처리한다.
 *
 * - 진입 디바운스(600ms): 존 경계를 스치듯 지날 때 모드가 깜빡이지 않는다.
 * - 이탈 디바운스(1200ms): 문 앞에서 왔다갔다해도 세션이 끊기지 않는다.
 * - 회의실·스테이지는 "참여하기" 확인을 거친다 (너무 자동이면 당황스럽다는 사용자 요청).
 * - 책상·휴게실은 흐름을 끊지 않도록 자동 진입한다.
 * - engaged 진입 시 이전 presence 상태를 저장했다가, session-ended 이벤트에 실어
 *   호출 측이 복원하도록 한다.
 *
 * 트랙2 확장점: options.ports.whiteboard / ports.privateBubble 을 주입하면
 * 회의 세션 engaged 시점에 화이트보드 제안 이벤트를 낸다. 트랙2가 포트를 구현한다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  PLACE_MODE_ENTER_STABLE_MS,
  PLACE_MODE_EXIT_STABLE_MS,
  parsePlaceWorkMode,
  placeModeAutoStatus,
  placeModeEntryCopy,
  placeModeExitCopy,
  placeModeNeedsJoinConfirm,
  placeModeWhiteboardCopy,
  type PlaceWorkMode,
} from "./studio-virtual-space-place-modes";
import {
  zoneAtPoint,
  type StudioOfficeZone,
} from "./studio-virtual-space-office-zones";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import { placeWorkModeForZoneType } from "./studio-virtual-space-place-modes";

/** 트랙2가 구현할 협업 포트 (화이트보드·프라이빗 버블). */
export interface PlaceCollaborationPorts {
  readonly whiteboard?: {
    /** 이 월드에서 화이트보드를 열 수 있으면 true. */
    readonly isAvailable: () => boolean;
    /** 존 id의 화이트보드를 연다. */
    readonly open: (zoneId: string) => void;
  };
  readonly privateBubble?: {
    readonly isAvailable: () => boolean;
    /** 1:1 프라이빗 버블을 연다. */
    readonly open: (peerSessionId: string) => void;
  };
}

export type PlaceModeEventKind =
  | "mode-entered"         // 진입 배너 (모드 시작 알림)
  | "join-prompt"          // "참여하기" 확인 다이얼로그 요청 (conference/stage)
  | "session-started"      // 세션 시작: presence 자동 상태 + 미디어 참여 시점
  | "whiteboard-suggestion"// 회의 중 화이트보드 제안 (포트 있을 때만)
  | "session-ended"        // 세션 종료: presence 상태 복원 + 미디어 정리 시점
  | "mode-exited";         // 이탈 토스트

export interface PlaceModeEvent {
  readonly kind: PlaceModeEventKind;
  readonly mode: PlaceWorkMode;
  readonly zoneId: string;
  readonly zoneLabelKo: string;
  readonly zoneLabelEn: string;
  /** presence에 자동 반영할 상태 (session-started). */
  readonly autoStatus: StudioUserStatus | null;
  /** session-ended에서 복원할 이전 상태. 없으면 null (복원 생략). */
  readonly restoreStatus: StudioUserStatus | null;
  readonly textKo: string;
  readonly textEn: string;
  readonly at: number;
}

export type PlaceModeStage = "idle" | "prompt" | "engaged";

export interface PlaceModeSessionSnapshot {
  readonly mode: PlaceWorkMode;
  readonly zoneId: string;
  readonly zoneLabelKo: string;
  readonly zoneLabelEn: string;
  readonly stage: PlaceModeStage;
  readonly engagedAt: number | null;
}

export interface PlaceModeDirectorOptions {
  /** 오피스 존 목록. workMode가 없으면 존 종류 폴백 매핑을 쓴다. */
  readonly zones: readonly StudioOfficeZone[];
  readonly now?: () => number;
  readonly enterStableMs?: number;
  readonly exitStableMs?: number;
  readonly ports?: PlaceCollaborationPorts;
  /** 현재 presence userStatus 조회. 세션 종료 시 복원용으로 저장한다. */
  readonly readCurrentStatus?: () => StudioUserStatus | null;
  readonly locale?: "ko" | "en";
}

interface TrackedMode {
  readonly mode: PlaceWorkMode;
  readonly zoneId: string;
  readonly zoneLabelKo: string;
  readonly zoneLabelEn: string;
}

function resolveMode(zone: StudioOfficeZone | null): PlaceWorkMode {
  if (!zone) return "none";
  const explicit = parsePlaceWorkMode(zone.workMode);
  return explicit ?? placeWorkModeForZoneType(zone.type);
}

function trackedOf(zone: StudioOfficeZone, mode: PlaceWorkMode): TrackedMode {
  return { mode, zoneId: zone.id, zoneLabelKo: zone.labelKo, zoneLabelEn: zone.labelEn };
}

/**
 * 장소-모드 디렉터를 생성한다.
 */
export function createPlaceModeDirector(options: PlaceModeDirectorOptions): {
  update(point: StudioVirtualSpacePoint): void;
  confirmJoin(): void;
  declineJoin(): void;
  leaveSession(): void;
  snapshot(): PlaceModeSessionSnapshot | null;
  consumeEvents(): readonly PlaceModeEvent[];
} {
  const {
    zones,
    ports,
    locale = "ko",
    enterStableMs = PLACE_MODE_ENTER_STABLE_MS,
    exitStableMs = PLACE_MODE_EXIT_STABLE_MS,
  } = options;
  const now = options.now ?? (() => Date.now());

  const events: PlaceModeEvent[] = [];
  /** 확정된 현재 모드 (디바운스 통과). */
  let current: TrackedMode | null = null;
  /** 디바운스 후보. null이 "밖" 후보인 경우와 구분되도록 래퍼를 쓴다. */
  let candidate: { readonly value: TrackedMode | null; readonly since: number } | null = null;
  /** 세션 단계. */
  let stage: PlaceModeStage = "idle";
  let engagedAt: number | null = null;
  /** engaged 진입 시 저장한 이전 상태. */
  let savedStatus: StudioUserStatus | null = null;
  /** "참여하기"를 거절/수동 이탈한 존 방문 (같은 존에 머무는 동안 재진입 방지). */
  let dismissedZoneId: string | null = null;

  const emit = (event: PlaceModeEvent): void => {
    events.push(event);
  };

  const copyLabels = (tracked: TrackedMode): { readonly ko: string; readonly en: string } =>
    ({ ko: tracked.zoneLabelKo, en: tracked.zoneLabelEn });

  function startSession(tracked: TrackedMode, at: number): void {
    const autoStatus = placeModeAutoStatus(tracked.mode);
    savedStatus = options.readCurrentStatus?.() ?? null;
    // 자동 상태와 이미 같으면 복원할 게 없다.
    if (savedStatus === autoStatus) savedStatus = null;
    stage = "engaged";
    engagedAt = at;
    const entry = placeModeEntryCopy(tracked.mode, copyLabels(tracked), locale);
    emit({
      kind: "session-started", mode: tracked.mode, zoneId: tracked.zoneId,
      zoneLabelKo: tracked.zoneLabelKo, zoneLabelEn: tracked.zoneLabelEn,
      autoStatus, restoreStatus: null, textKo: entry.title, textEn: entry.title, at,
    });
    if (tracked.mode === "conference" && ports?.whiteboard?.isAvailable()) {
      const wb = placeModeWhiteboardCopy(locale);
      emit({
        kind: "whiteboard-suggestion", mode: tracked.mode, zoneId: tracked.zoneId,
        zoneLabelKo: tracked.zoneLabelKo, zoneLabelEn: tracked.zoneLabelEn,
        autoStatus: null, restoreStatus: null,
        textKo: `${wb.title} ${wb.body}`, textEn: `${wb.title} ${wb.body}`, at,
      });
    }
  }

  function endSession(tracked: TrackedMode, at: number, reason: "exit" | "manual"): void {
    if (stage === "engaged") {
      const exit = placeModeExitCopy(tracked.mode, copyLabels(tracked), locale);
      emit({
        kind: "session-ended", mode: tracked.mode, zoneId: tracked.zoneId,
        zoneLabelKo: tracked.zoneLabelKo, zoneLabelEn: tracked.zoneLabelEn,
        autoStatus: null, restoreStatus: savedStatus,
        textKo: exit.title, textEn: exit.title, at,
      });
    }
    if (reason === "manual" || stage === "engaged" || stage === "prompt") {
      const exit = placeModeExitCopy(tracked.mode, copyLabels(tracked), locale);
      // prompt 단계에서 나간 경우엔 이탈 토스트 대신 조용히 정리한다.
      if (stage !== "prompt") {
        emit({
          kind: "mode-exited", mode: tracked.mode, zoneId: tracked.zoneId,
          zoneLabelKo: tracked.zoneLabelKo, zoneLabelEn: tracked.zoneLabelEn,
          autoStatus: null, restoreStatus: null,
          textKo: `${exit.title}${exit.body ? ` — ${exit.body}` : ""}`,
          textEn: `${exit.title}${exit.body ? ` — ${exit.body}` : ""}`,
          at,
        });
      }
    }
    stage = "idle";
    engagedAt = null;
    savedStatus = null;
  }

  function commitEnter(tracked: TrackedMode, at: number): void {
    current = tracked;
    candidate = null;
    if (dismissedZoneId === tracked.zoneId) {
      // 같은 존 방문에서 거절/수동 이탈한 뒤 — 모드는 추적하되 세션은 열지 않는다.
      return;
    }
    const entry = placeModeEntryCopy(tracked.mode, copyLabels(tracked), locale);
    emit({
      kind: "mode-entered", mode: tracked.mode, zoneId: tracked.zoneId,
      zoneLabelKo: tracked.zoneLabelKo, zoneLabelEn: tracked.zoneLabelEn,
      autoStatus: null, restoreStatus: null,
      textKo: entry.title, textEn: entry.title, at,
    });
    if (placeModeNeedsJoinConfirm(tracked.mode)) {
      stage = "prompt";
      emit({
        kind: "join-prompt", mode: tracked.mode, zoneId: tracked.zoneId,
        zoneLabelKo: tracked.zoneLabelKo, zoneLabelEn: tracked.zoneLabelEn,
        autoStatus: null, restoreStatus: null,
        textKo: `${entry.title} — ${entry.body}`, textEn: `${entry.title} — ${entry.body}`, at,
      });
    } else {
      startSession(tracked, at);
    }
  }

  function commitExit(at: number): void {
    if (current) endSession(current, at, "exit");
    current = null;
    candidate = null;
    // 존을 완전히 나가면 방문이 끝난 것으로 보고 거절/수동 이탈 기록을 리셋한다.
    dismissedZoneId = null;
  }

  const update = (point: StudioVirtualSpacePoint): void => {
    const at = now();
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const zone = zoneAtPoint(zones, point);
    const mode = resolveMode(zone);
    const next: TrackedMode | null = mode === "none" || !zone ? null : trackedOf(zone, mode);

    const sameAs = (a: TrackedMode | null, b: TrackedMode | null): boolean =>
      a?.mode === b?.mode && a?.zoneId === b?.zoneId;

    // 존이 바뀌면 거절/수동 이탈 기록을 리셋한다.
    if (next && dismissedZoneId && next.zoneId !== dismissedZoneId) dismissedZoneId = null;

    if (sameAs(next, current)) {
      // 같은 존에 그대로: 후보 리셋.
      if (candidate && !sameAs(candidate.value, current)) candidate = null;
      // prompt 대기 중인데 거절한 존이면 무시 — commitEnter에서 이미 처리.
      return;
    }

    // 후보 추적.
    if (!candidate || !sameAs(candidate.value, next)) {
      candidate = { value: next, since: at };
      return;
    }
    const stableMs = next === null ? exitStableMs : enterStableMs;
    // 모드 전환(switch)은 이탈 디바운스를 따른다 — 회의 중 문 앞 스침에 세션이 끊기지 않게.
    const effectiveStableMs = current !== null && next !== null && current.mode !== next.mode
      ? exitStableMs
      : stableMs;
    if (at - candidate.since < effectiveStableMs) return;

    if (next === null) {
      commitExit(at);
    } else if (current === null) {
      commitEnter(next, at);
    } else {
      // switch: exit → enter
      const previous = current;
      endSession(previous, at, "exit");
      current = null;
      commitEnter(next, at);
    }
  };

  /** "참여하기" 확인 — prompt → engaged. */
  const confirmJoin = (): void => {
    if (stage !== "prompt" || !current) return;
    startSession(current, now());
  };

  /** "나중에" — prompt를 닫고 같은 존 방문 동안은 다시 묻지 않는다. */
  const declineJoin = (): void => {
    if (stage !== "prompt" || !current) return;
    dismissedZoneId = current.zoneId;
    stage = "idle";
  };

  /** 세션 수동 이탈 — 같은 존에 머물러도 다시 세션을 열지 않는다. */
  const leaveSession = (): void => {
    if (!current || stage === "idle") return;
    dismissedZoneId = current.zoneId;
    endSession(current, now(), "manual");
  };

  const snapshot = (): PlaceModeSessionSnapshot | null => {
    if (!current) return null;
    return Object.freeze({
      mode: current.mode,
      zoneId: current.zoneId,
      zoneLabelKo: current.zoneLabelKo,
      zoneLabelEn: current.zoneLabelEn,
      stage,
      engagedAt,
    });
  };

  const consumeEvents = (): readonly PlaceModeEvent[] => {
    const drained = Object.freeze(events.slice()) as readonly PlaceModeEvent[];
    events.length = 0;
    return drained;
  };

  return { update, confirmJoin, declineJoin, leaveSession, snapshot, consumeEvents };
}

/** 디렉터 입력용 존 어댑터: 스키마 존 그대로 넘기면 된다 (workMode 미지정 시 폴백 매핑). */
export type PlaceModeDirectorZoneInput = StudioOfficeZone;
