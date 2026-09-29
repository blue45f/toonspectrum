/**
 * 연재 예약 발행 스케줄러 패널.
 *
 * 주간 발행 패턴(케이던스) 편집, 월간 캘린더, 다가오는 예약 목록,
 * 예약 생성/수정 다이얼로그를 한 화면에 묶는다. 발행 커맨드센터 등
 * 기존 발행 워크플로 화면에 임베드하거나 단독 라우트로 사용할 수 있다.
 */
import { useEffect, useMemo, useState } from "react";

import { useT } from "@/shared/lib/i18n";

import { PublishScheduleCalendar } from "./PublishScheduleCalendar";
import {
  PublishScheduleDialog,
  type PublishScheduleEpisodeOption,
} from "./PublishScheduleDialog";
import {
  publishScheduleStore,
  usePublishScheduleStore,
} from "./publish-schedule-store";
import {
  computeCadenceOccurrences,
  formatUtcInTimeZone,
  PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS,
  type StudioPublishReservation,
} from "./studio-publish-schedule-model";
import "./publish-schedule.css";
import "./publish-schedule-i18n";

export interface PublishSchedulePanelProps {
  readonly seriesId: string;
  readonly seriesTitle?: string;
  readonly episodes: readonly PublishScheduleEpisodeOption[];
  readonly timeZone?: string;
}

const WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"] as const;

const STATUS_FALLBACK: Record<StudioPublishReservation["status"], string> = {
  scheduled: "예약됨",
  publishing: "발행 중",
  published: "발행됨",
  failed: "실패",
  canceled: "취소됨",
};

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

export function PublishSchedulePanel({
  seriesId,
  seriesTitle,
  episodes,
  timeZone = "Asia/Seoul",
}: PublishSchedulePanelProps) {
  const t = useT();
  const lt = (
    fallback: string,
    key: string,
    values?: Record<string, string | number>,
  ) => {
    const translated = values ? t(key, values, fallback) : t(key, fallback);
    return translated === key ? fallback : translated;
  };

  const { reservations, cadences } = usePublishScheduleStore();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StudioPublishReservation | null>(null);
  const [weekdays, setWeekdays] = useState<readonly number[]>([]);
  const [cadenceTime, setCadenceTime] = useState("18:00");
  const [cadenceSaved, setCadenceSaved] = useState(false);

  const seriesReservations = useMemo(
    () =>
      reservations
        .filter((r) => r.seriesId === seriesId)
        .slice()
        .sort((a, b) =>
          a.scheduledAtUtc < b.scheduledAtUtc
            ? -1
            : a.scheduledAtUtc > b.scheduledAtUtc
              ? 1
              : 0,
        ),
    [reservations, seriesId],
  );

  const upcoming = useMemo(
    () =>
      seriesReservations.filter(
        (r) => r.status === "scheduled" || r.status === "failed",
      ),
    [seriesReservations],
  );

  const savedCadence = cadences[seriesId] ?? null;

  // 다음 예정일은 벽시계(wall-clock)에 의존하므로 렌더 중이 아닌 이펙트에서 계산한다.
  const [nextOccurrences, setNextOccurrences] = useState<string[]>([]);
  useEffect(() => {
    if (!savedCadence) {
      setNextOccurrences([]);
      return;
    }
    setNextOccurrences(
      computeCadenceOccurrences(savedCadence, Date.now(), 4).map(
        (utc) => formatUtcInTimeZone(utc, savedCadence.timeZone) ?? utc,
      ),
    );
  }, [savedCadence]);

  const toggleWeekday = (day: number) => {
    setCadenceSaved(false);
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const saveCadence = () => {
    const ok = publishScheduleStore.setCadence(seriesId, {
      timesPerWeek: weekdays.length,
      weekdays,
      timeOfDay: cadenceTime,
      timeZone,
    });
    setCadenceSaved(ok);
  };

  const openNewDialog = (dateKey: string | null = selectedDate) => {
    setEditing(null);
    setDialogOpen(true);
    if (dateKey) setSelectedDate(dateKey);
  };

  const openEditDialog = (reservation: StudioPublishReservation) => {
    setEditing(reservation);
    setDialogOpen(true);
  };

  const handleCancel = (reservation: StudioPublishReservation) => {
    const confirmed = window.confirm(
      lt(
        "이 예약을 취소할까요? 취소한 예약은 다시 발행 대기열에 들어가지 않아요.",
        "studio.publish.schedule.confirmCancel",
      ),
    );
    if (confirmed) publishScheduleStore.cancelReservation(reservation.id);
  };

  return (
    <div className="psched">
      <div className="psched__header">
        <div>
          <h2 className="psched__title">
            {lt("예약 발행", "studio.publish.schedule.title")}
            {seriesTitle ? ` · ${seriesTitle}` : ""}
          </h2>
          <p className="psched__subtitle">
            {lt(
              "회차별 예약 일시를 정하고 주간 발행 패턴을 관리합니다.",
              "studio.publish.schedule.description",
            )}
          </p>
        </div>
        <button
          type="button"
          className="psched__btn psched__btn--primary"
          onClick={() => openNewDialog()}
        >
          {lt("새 예약", "studio.publish.schedule.newReservation")}
        </button>
      </div>

      <div className="psched__cadence">
        <h3 className="psched__cadence-title">
          {lt("주간 발행 패턴", "studio.publish.schedule.cadenceTitle")}
        </h3>
        <p className="psched__cadence-desc">
          {lt(
            "요일과 시각을 정하면 다음 발행 예정일을 자동으로 계산해요.",
            "studio.publish.schedule.cadenceDescription",
          )}
        </p>
        <div
          className="psched__weekday-row"
          role="group"
          aria-label={lt("주간 발행 패턴", "studio.publish.schedule.cadenceTitle")}
        >
          {WEEKDAY_SHORT.map((label, day) => (
            <button
              key={day}
              type="button"
              className="psched__weekday-chip"
              aria-pressed={weekdays.includes(day)}
              onClick={() => toggleWeekday(day)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="psched__row">
          <div className="psched__field">
            <label className="psched__label" htmlFor="psched-cadence-time">
              {lt("발행 시각", "studio.publish.schedule.cadenceTime")}
            </label>
            <input
              id="psched-cadence-time"
              type="time"
              className="psched__input"
              value={cadenceTime}
              onChange={(event) => {
                setCadenceTime(event.target.value);
                setCadenceSaved(false);
              }}
            />
          </div>
          <div className="psched__field" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="psched__btn"
              onClick={saveCadence}
              disabled={weekdays.length === 0}
            >
              {lt("예약 저장", "studio.publish.schedule.save")}
            </button>
          </div>
        </div>
        {cadenceSaved && nextOccurrences.length > 0 && (
          <div>
            <p className="psched__cadence-desc">
              {lt("다음 예정일", "studio.publish.schedule.cadenceNext")}
            </p>
            <ul className="psched__next-list">
              {nextOccurrences.map((occurrence) => (
                <li key={occurrence}>{occurrence}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <PublishScheduleCalendar
        reservations={seriesReservations}
        timeZone={timeZone}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onSelectReservation={openEditDialog}
      />

      <div className="psched__day-list">
        <h3 className="psched__day-title">
          {lt("다가오는 예약", "studio.publish.schedule.upcomingTitle")}
        </h3>
        {upcoming.length === 0 ? (
          <p className="psched__empty">
            {lt("예약된 발행이 없어요.", "studio.publish.schedule.emptyUpcoming")}
          </p>
        ) : (
          upcoming.map((reservation) => (
            <div key={reservation.id} className="psched__reservation">
              <span className="psched__reservation-info">
                <span className="psched__reservation-title">
                  {reservation.episodeTitle}
                </span>
                <span className="psched__reservation-meta">
                  {formatUtcInTimeZone(reservation.scheduledAtUtc, reservation.timeZone) ??
                    reservation.scheduledAtUtc}
                  {reservation.status === "failed" &&
                    ` · ${PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS - reservation.attemptCount > 0
                      ? lt(
                          `${reservation.attemptCount}회 시도`,
                          "studio.publish.schedule.attemptCount",
                          { count: reservation.attemptCount },
                        )
                      : lt("실패", "studio.publish.schedule.statusFailed")}`}
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
              {reservation.status === "failed" &&
                reservation.nextRetryAtUtc != null && (
                  <button
                    type="button"
                    className="psched__btn"
                    onClick={() => publishScheduleStore.retryReservation(reservation.id)}
                  >
                    {lt("지금 재시도", "studio.publish.schedule.retryNow")}
                  </button>
                )}
              <button
                type="button"
                className="psched__btn"
                onClick={() => openEditDialog(reservation)}
              >
                {lt("예약 수정", "studio.publish.schedule.editReservation")}
              </button>
              <button
                type="button"
                className="psched__btn psched__btn--danger"
                onClick={() => handleCancel(reservation)}
              >
                {lt("예약 취소", "studio.publish.schedule.cancelReservation")}
              </button>
            </div>
          ))
        )}
      </div>

      <PublishScheduleDialog
        open={dialogOpen}
        seriesId={seriesId}
        episodes={episodes}
        timeZone={timeZone}
        reservation={editing}
        existingReservations={seriesReservations}
        defaultDate={selectedDate}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={() => undefined}
      />
    </div>
  );
}
