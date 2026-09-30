/**
 * 예약 발행 클라이언트 스토어.
 *
 * 예약 생성/수정/취소와 작품별 주간 발행 패턴(케이던스)을 브라우저에
 * 보관한다. 서버 연동 전까지 localStorage에 영속화하며, 모든 시간 규칙은
 * `studio-publish-schedule-model`의 순수 함수를 재사용한다.
 */
import { useSyncExternalStore } from "react";

import {
  detectScheduleConflicts,
  isReservationDue,
  normalizePublishScheduleCadence,
  transitionReservation,
  validateReservationTime,
  PUBLISH_SCHEDULE_MIN_GAP_MINUTES,
  STUDIO_PUBLISH_SCHEDULE_SCHEMA_VERSION,
  type NormalizedPublishScheduleCadence,
  type PublishScheduleCadence,
  type PublishScheduleTimeErrorCode,
  type StudioPublishReservation,
} from "./studio-publish-schedule-model";

const STORAGE_KEY = "toonstudio.publish-schedule.v1";

export interface CreateReservationInput {
  readonly seriesId: string;
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
  /**
   * true이면 같은 작품의 시간대 충돌 검사를 건너뛴다.
   * 다이얼로그에서 충돌 경고를 확인한 뒤 사용자가 명시적으로 선택할 때만 사용.
   */
  readonly allowConflict?: boolean;
}

export interface UpdateReservationInput {
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
  readonly allowConflict?: boolean;
}

export type CreateReservationResult =
  | { readonly ok: true; readonly reservation: StudioPublishReservation }
  | {
      readonly ok: false;
      readonly code: PublishScheduleTimeErrorCode | "CONFLICT";
      readonly conflictWith?: string;
    };

export interface PublishScheduleStoreState {
  readonly reservations: readonly StudioPublishReservation[];
  readonly cadences: Readonly<Record<string, NormalizedPublishScheduleCadence>>;
}

interface PersistedState {
  reservations?: readonly StudioPublishReservation[];
  cadences?: Record<string, NormalizedPublishScheduleCadence>;
}

let idCounter = 0;
function createReservationId(): string {
  try {
    const cryptoRef =
      typeof globalThis !== "undefined"
        ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
        : undefined;
    if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  } catch {
    // crypto 미지원 환경에서는 아래 폴백을 사용한다.
  }
  idCounter += 1;
  return `local-res-${Date.now().toString(36)}-${idCounter}`;
}

function readPersistedState(): PublishScheduleStoreState {
  const empty: PublishScheduleStoreState = { reservations: [], cadences: {} };
  try {
    if (typeof window === "undefined" || !window.localStorage) return empty;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
      cadences:
        parsed.cadences && typeof parsed.cadences === "object"
          ? parsed.cadences
          : {},
    };
  } catch {
    return empty;
  }
}

function persistState(state: PublishScheduleStoreState): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        reservations: state.reservations,
        cadences: state.cadences,
      } satisfies PersistedState),
    );
  } catch {
    // 저장 실패(용량 초과 등)는 조용히 무시하고 메모리 상태를 유지한다.
  }
}

type Listener = () => void;

class PublishScheduleStore {
  private state: PublishScheduleStoreState = readPersistedState();
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PublishScheduleStoreState => this.state;

  private setState(next: PublishScheduleStoreState): void {
    this.state = next;
    persistState(next);
    for (const listener of this.listeners) listener();
  }

  createReservation(input: CreateReservationInput): CreateReservationResult {
    const validated = validateReservationTime(input.date, input.time, input.timeZone);
    if (!validated.ok) return { ok: false, code: validated.code };
    if (!input.allowConflict) {
      const conflicts = detectScheduleConflicts(
        this.state.reservations,
        { seriesId: input.seriesId, scheduledAtUtc: validated.scheduledAtUtc },
        PUBLISH_SCHEDULE_MIN_GAP_MINUTES,
      );
      const firstConflict = conflicts[0];
      if (firstConflict) {
        return {
          ok: false,
          code: "CONFLICT",
          conflictWith: firstConflict.episodeTitle,
        };
      }
    }
    const nowIso = new Date().toISOString();
    const reservation: StudioPublishReservation = {
      schemaVersion: STUDIO_PUBLISH_SCHEDULE_SCHEMA_VERSION,
      id: createReservationId(),
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      episodeTitle: input.episodeTitle,
      scheduledAtUtc: validated.scheduledAtUtc,
      timeZone: input.timeZone,
      status: "scheduled",
      attemptCount: 0,
      nextRetryAtUtc: null,
      lastError: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.setState({
      ...this.state,
      reservations: [...this.state.reservations, reservation],
    });
    return { ok: true, reservation };
  }

  updateReservation(
    id: string,
    input: UpdateReservationInput,
  ): CreateReservationResult {
    const target = this.state.reservations.find((r) => r.id === id);
    if (!target || (target.status !== "scheduled" && target.status !== "failed")) {
      return { ok: false, code: "INVALID_DATETIME" };
    }
    const validated = validateReservationTime(input.date, input.time, input.timeZone);
    if (!validated.ok) return { ok: false, code: validated.code };
    if (!input.allowConflict) {
      const conflicts = detectScheduleConflicts(
        this.state.reservations,
        {
          seriesId: target.seriesId,
          scheduledAtUtc: validated.scheduledAtUtc,
          excludeId: id,
        },
        PUBLISH_SCHEDULE_MIN_GAP_MINUTES,
      );
      const firstConflict = conflicts[0];
      if (firstConflict) {
        return {
          ok: false,
          code: "CONFLICT",
          conflictWith: firstConflict.episodeTitle,
        };
      }
    }
    const nowIso = new Date().toISOString();
    const updated: StudioPublishReservation = {
      ...target,
      scheduledAtUtc: validated.scheduledAtUtc,
      timeZone: input.timeZone,
      status: "scheduled",
      nextRetryAtUtc: null,
      lastError: null,
      updatedAt: nowIso,
    };
    this.setState({
      ...this.state,
      reservations: this.state.reservations.map((r) =>
        r.id === id ? updated : r,
      ),
    });
    return { ok: true, reservation: updated };
  }

  cancelReservation(id: string): boolean {
    const target = this.state.reservations.find((r) => r.id === id);
    if (!target) return false;
    const canceled = transitionReservation(target, "cancel");
    if (canceled === target) return false;
    this.setState({
      ...this.state,
      reservations: this.state.reservations.map((r) =>
        r.id === id ? canceled : r,
      ),
    });
    return true;
  }

  retryReservation(id: string): boolean {
    const target = this.state.reservations.find((r) => r.id === id);
    if (!target) return false;
    const retried = transitionReservation(target, "retry");
    if (retried === target) return false;
    this.setState({
      ...this.state,
      reservations: this.state.reservations.map((r) =>
        r.id === id ? retried : r,
      ),
    });
    return true;
  }

  setCadence(seriesId: string, cadence: PublishScheduleCadence): boolean {
    const normalized = normalizePublishScheduleCadence(cadence);
    if (!normalized) return false;
    this.setState({
      ...this.state,
      cadences: { ...this.state.cadences, [seriesId]: normalized },
    });
    return true;
  }

  removeCadence(seriesId: string): void {
    const cadences = { ...this.state.cadences };
    delete cadences[seriesId];
    this.setState({ ...this.state, cadences });
  }

  /**
   * 발행 시각이 도래한 예약을 publishing으로 전이한다.
   * 실제 발행 실행은 호출자가 onDue 콜백에서 처리한다.
   */
  collectDueReservations(
    now: Date | number = Date.now(),
    onDue?: (reservation: StudioPublishReservation) => void,
  ): StudioPublishReservation[] {
    const due = this.state.reservations.filter((r) => isReservationDue(r, now));
    if (due.length === 0) return [];
    const transitioned = due.map((r) => transitionReservation(r, "due", now));
    const byId = new Map(transitioned.map((r) => [r.id, r]));
    this.setState({
      ...this.state,
      reservations: this.state.reservations.map((r) => byId.get(r.id) ?? r),
    });
    for (const reservation of transitioned) onDue?.(reservation);
    return transitioned;
  }

  /** 테스트용: 스토어를 초기 상태로 되돌린다. */
  resetForTests(): void {
    this.setState({ reservations: [], cadences: {} });
  }
}

export const publishScheduleStore = new PublishScheduleStore();

export function usePublishScheduleStore(): PublishScheduleStoreState {
  return useSyncExternalStore(
    publishScheduleStore.subscribe,
    publishScheduleStore.getSnapshot,
    publishScheduleStore.getSnapshot,
  );
}
