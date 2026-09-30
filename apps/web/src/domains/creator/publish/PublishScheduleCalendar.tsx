/**
 * 예약 발행 캘린더 뷰.
 *
 * 월 단위 그리드에 예약 상태를 점으로 표시하고, 날짜를 선택하면 해당 일의
 * 예약 목록을 보여준다. 각 예약은 자신의 타임존 기준 날짜 셀에 배치된다.
 */
import { useMemo, useState } from "react";

import { useT } from "@/shared/lib/i18n";

import {
  buildCalendarCells,
  formatUtcInTimeZone,
  getLocalDateKey,
  type StudioPublishReservation,
} from "./studio-publish-schedule-model";
import "./publish-schedule.css";
import "./publish-schedule-i18n";

export interface PublishScheduleCalendarProps {
  readonly reservations: readonly StudioPublishReservation[];
  /** 예약을 배치할 때 기준이 되는 타임존 (기본 Asia/Seoul). */
  readonly timeZone?: string;
  readonly selectedDate: string | null;
  readonly onSelectDate: (dateKey: string | null) => void;
  readonly onSelectReservation?: (reservation: StudioPublishReservation) => void;
  readonly initialYear?: number;
  readonly initialMonth?: number;
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

function statusDotClass(status: StudioPublishReservation["status"]): string {
  switch (status) {
    case "failed":
      return "psched__dot psched__dot--failed";
    case "published":
      return "psched__dot psched__dot--published";
    case "canceled":
      return "psched__dot psched__dot--canceled";
    default:
      return "psched__dot";
  }
}

function statusLabelKey(status: StudioPublishReservation["status"]): string {
  switch (status) {
    case "scheduled":
      return "studio.publish.schedule.statusScheduled";
    case "publishing":
      return "studio.publish.schedule.statusPublishing";
    case "published":
      return "studio.publish.schedule.statusPublished";
    case "failed":
      return "studio.publish.schedule.statusFailed";
    case "canceled":
      return "studio.publish.schedule.statusCanceled";
  }
}

const STATUS_FALLBACK: Record<StudioPublishReservation["status"], string> = {
  scheduled: "예약됨",
  publishing: "발행 중",
  published: "발행됨",
  failed: "실패",
  canceled: "취소됨",
};

export function PublishScheduleCalendar({
  reservations,
  timeZone = "Asia/Seoul",
  selectedDate,
  onSelectDate,
  onSelectReservation,
  initialYear,
  initialMonth,
}: PublishScheduleCalendarProps) {
  const t = useT();
  const lt = (fallback: string, key: string) => {
    const translated = t(key, fallback);
    return translated === key ? fallback : translated;
  };

  const now = new Date();
  const [year, setYear] = useState(
    initialYear ?? now.getFullYear(),
  );
  const [month, setMonth] = useState(initialMonth ?? now.getMonth() + 1);
  // 렌더마다 다시 계산해도 되는 저렴한 Intl 포맷이라 메모이제이션하지 않는다.
  const todayKey = getLocalDateKey(now.toISOString(), timeZone) ?? "";

  const cells = useMemo(() => buildCalendarCells(year, month), [year, month]);

  const byDate = useMemo(() => {
    const map = new Map<string, StudioPublishReservation[]>();
    for (const reservation of reservations) {
      const key = getLocalDateKey(reservation.scheduledAtUtc, timeZone);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(reservation);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.scheduledAtUtc < b.scheduledAtUtc ? -1 : a.scheduledAtUtc > b.scheduledAtUtc ? 1 : 0,
      );
    }
    return map;
  }, [reservations, timeZone]);

  const selectedReservations = selectedDate
    ? (byDate.get(selectedDate) ?? [])
    : [];

  const moveMonth = (delta: number) => {
    let nextYear = year;
    let nextMonth = month + delta;
    while (nextMonth < 1) {
      nextMonth += 12;
      nextYear -= 1;
    }
    while (nextMonth > 12) {
      nextMonth -= 12;
      nextYear += 1;
    }
    setYear(nextYear);
    setMonth(nextMonth);
  };

  const goToday = () => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    onSelectDate(getLocalDateKey(today.toISOString(), timeZone));
  };

  return (
    <section className="psched" aria-label={lt("발행 캘린더", "studio.publish.schedule.calendarTitle")}>
      <div className="psched__header">
        <div className="psched__month-nav" role="group" aria-label={lt("월 이동", "studio.publish.schedule.calendarAria")}>
          <button
            type="button"
            className="psched__icon-btn"
            onClick={() => moveMonth(-1)}
            aria-label={lt("이전 달", "studio.publish.schedule.prevMonth")}
          >
            ‹
          </button>
          <span className="psched__month-label" aria-live="polite">
            {year}년 {month}월
          </span>
          <button
            type="button"
            className="psched__icon-btn"
            onClick={() => moveMonth(1)}
            aria-label={lt("다음 달", "studio.publish.schedule.nextMonth")}
          >
            ›
          </button>
          <button
            type="button"
            className="psched__btn"
            onClick={goToday}
          >
            {lt("오늘", "studio.publish.schedule.today")}
          </button>
        </div>
      </div>

      <div
        className="psched__grid"
        role="grid"
        aria-label={lt("월간 발행 예약 캘린더", "studio.publish.schedule.calendarAria")}
      >
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="psched__weekday" role="columnheader">
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const dayReservations = byDate.get(cell.dateKey) ?? [];
          const dayNumber = Number(cell.dateKey.slice(8, 10));
          const isSelected = selectedDate === cell.dateKey;
          const className = [
            "psched__cell",
            cell.inMonth ? "" : "psched__cell--outside",
            cell.dateKey === todayKey ? "psched__cell--today" : "",
            isSelected ? "psched__cell--selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={cell.dateKey}
              type="button"
              role="gridcell"
              className={className}
              aria-selected={isSelected}
              aria-label={`${cell.dateKey}, 예약 ${dayReservations.length}건`}
              onClick={() => onSelectDate(isSelected ? null : cell.dateKey)}
            >
              <span className="psched__cell-date">{dayNumber}</span>
              {dayReservations.length > 0 && (
                <span className="psched__dots" aria-hidden="true">
                  {dayReservations.slice(0, 4).map((r) => (
                    <span key={r.id} className={statusDotClass(r.status)} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="psched__day-list">
          <h3 className="psched__day-title">{selectedDate}</h3>
          {selectedReservations.length === 0 ? (
            <p className="psched__empty">
              {lt("이 날의 예약이 없어요.", "studio.publish.schedule.emptyDay")}
            </p>
          ) : (
            selectedReservations.map((reservation) => (
              <button
                key={reservation.id}
                type="button"
                className="psched__reservation"
                onClick={() => onSelectReservation?.(reservation)}
                aria-label={`${reservation.episodeTitle} 예약 상세`}
              >
                <span className="psched__reservation-info">
                  <span className="psched__reservation-title">
                    {reservation.episodeTitle}
                  </span>
                  <span className="psched__reservation-meta">
                    {formatUtcInTimeZone(
                      reservation.scheduledAtUtc,
                      reservation.timeZone,
                    ) ?? reservation.scheduledAtUtc}
                  </span>
                </span>
                <span
                  className={`psched__status psched__status--${reservation.status}`}
                >
                  {lt(
                    STATUS_FALLBACK[reservation.status],
                    statusLabelKey(reservation.status),
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
