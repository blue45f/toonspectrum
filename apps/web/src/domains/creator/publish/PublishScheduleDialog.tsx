/**
 * 예약 생성/수정 다이얼로그.
 *
 * 회차 선택 → 날짜·시각·타임존 입력 → 발행 전 체크리스트(썸네일·메타데이터)
 * 확인 → 저장 흐름을 제공한다. 시간 규칙 위반과 예약 충돌은 저장 전에
 * 안내하며, 충돌 시에는 사용자가 명시적으로 "그래도 예약"을 눌러야 한다.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useT } from "@/shared/lib/i18n";

import { publishScheduleStore } from "./publish-schedule-store";
import {
  detectScheduleConflicts,
  evaluatePublishScheduleChecklist,
  formatUtcInTimeZone,
  validateReservationTime,
  PUBLISH_SCHEDULE_MAX_HORIZON_DAYS,
  PUBLISH_SCHEDULE_MIN_GAP_MINUTES,
  PUBLISH_SCHEDULE_MIN_LEAD_MINUTES,
  type PublishScheduleTimeErrorCode,
  type StudioPublishReservation,
} from "./studio-publish-schedule-model";
import "./publish-schedule.css";
import "./publish-schedule-i18n";

export interface PublishScheduleEpisodeOption {
  readonly id: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly synopsis: string | null;
  readonly pageCount: number;
  readonly ready: boolean;
  readonly hasThumbnail: boolean;
}

export interface PublishScheduleDialogProps {
  readonly open: boolean;
  readonly seriesId: string;
  readonly episodes: readonly PublishScheduleEpisodeOption[];
  readonly timeZone: string;
  readonly reservation?: StudioPublishReservation | null;
  readonly existingReservations: readonly StudioPublishReservation[];
  readonly defaultDate?: string | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

const COMMON_TIME_ZONES = [
  "Asia/Seoul",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
  "UTC",
] as const;

const CHECKLIST_LABELS: Record<string, { key: string; fallback: string }> = {
  thumbnail: {
    key: "studio.publish.schedule.checkThumbnail",
    fallback: "회차 썸네일",
  },
  metadata: {
    key: "studio.publish.schedule.checkMetadata",
    fallback: "제목·시놉시스",
  },
  pages: { key: "studio.publish.schedule.checkPages", fallback: "회차 페이지" },
  "episode-status": {
    key: "studio.publish.schedule.checkEpisodeStatus",
    fallback: "회차 준비 상태",
  },
};

function todayLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function PublishScheduleDialog({
  open,
  seriesId,
  episodes,
  timeZone,
  reservation = null,
  existingReservations,
  defaultDate = null,
  onClose,
  onSaved,
}: PublishScheduleDialogProps) {
  const t = useT();
  const lt = (fallback: string, key: string, values?: Record<string, string | number>) => {
    const translated = t(key, values ?? {}, fallback);
    return translated === key ? fallback : translated;
  };

  const editing = reservation != null;
  const [episodeId, setEpisodeId] = useState(reservation?.episodeId ?? "");
  const [date, setDate] = useState(() => {
    if (reservation) return reservation.scheduledAtUtc.slice(0, 10);
    return defaultDate ?? todayLocalDateKey();
  });
  const [time, setTime] = useState(() => {
    if (reservation) return reservation.scheduledAtUtc.slice(11, 16);
    return "18:00";
  });
  const [zone, setZone] = useState(reservation?.timeZone ?? timeZone);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    title: string;
    time: string;
    gap: number;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setEpisodeId(reservation?.episodeId ?? "");
    setDate(
      reservation
        ? (formatUtcInTimeZone(reservation.scheduledAtUtc, reservation.timeZone)?.slice(0, 10) ??
          todayLocalDateKey())
        : (defaultDate ?? todayLocalDateKey()),
    );
    setTime(
      reservation
        ? (formatUtcInTimeZone(reservation.scheduledAtUtc, reservation.timeZone)?.slice(11, 16) ??
          "18:00")
        : "18:00",
    );
    setZone(reservation?.timeZone ?? timeZone);
    setError(null);
    setConflict(null);
    const firstField = dialogRef.current?.querySelector("select, input");
    if (firstField instanceof HTMLElement) firstField.focus();
  }, [open, reservation, defaultDate, timeZone]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const selectedEpisode = useMemo(
    () => episodes.find((episode) => episode.id === episodeId) ?? null,
    [episodes, episodeId],
  );

  const checklist = useMemo(
    () =>
      selectedEpisode
        ? evaluatePublishScheduleChecklist({
            episodeTitle: selectedEpisode.title,
            episodeSynopsis: selectedEpisode.synopsis,
            hasThumbnail: selectedEpisode.hasThumbnail,
            pageCount: selectedEpisode.pageCount,
            episodeReady: selectedEpisode.ready,
          })
        : null,
    [selectedEpisode],
  );

  if (!open) return null;

  const errorForCode = (code: PublishScheduleTimeErrorCode): string => {
    switch (code) {
      case "INVALID_TIMEZONE":
        return lt("타임존을 확인해 주세요.", "studio.publish.schedule.errorInvalidTimezone");
      case "INVALID_DATETIME":
        return lt(
          "날짜·시각 형식을 확인해 주세요. (YYYY-MM-DD HH:mm)",
          "studio.publish.schedule.errorInvalidDatetime",
        );
      case "PAST_TIME":
        return lt("이미 지난 시각에는 예약할 수 없어요.", "studio.publish.schedule.errorPastTime");
      case "TOO_SOON":
        return lt(
          `발행 ${PUBLISH_SCHEDULE_MIN_LEAD_MINUTES}분 전까지만 예약할 수 있어요.`,
          "studio.publish.schedule.errorTooSoon",
          { minutes: PUBLISH_SCHEDULE_MIN_LEAD_MINUTES },
        );
      case "TOO_FAR":
        return lt(
          `발행 ${PUBLISH_SCHEDULE_MAX_HORIZON_DAYS}일 이내의 날짜만 예약할 수 있어요.`,
          "studio.publish.schedule.errorTooFar",
          { days: PUBLISH_SCHEDULE_MAX_HORIZON_DAYS },
        );
    }
  };

  const handleSave = (forceConflict: boolean) => {
    setError(null);
    setConflict(null);
    if (!selectedEpisode) {
      setError(lt("회차를 선택하세요", "studio.publish.schedule.episodePlaceholder"));
      return;
    }
    if (checklist && !checklist.canSchedule) {
      setError(
        lt(
          "체크리스트를 먼저 해결해 주세요.",
          "studio.publish.schedule.checklistTitle",
        ),
      );
      return;
    }
    const validated = validateReservationTime(date, time, zone);
    if (!validated.ok) {
      setError(errorForCode(validated.code));
      return;
    }
    if (!forceConflict) {
      const conflicts = detectScheduleConflicts(
        existingReservations,
        {
          seriesId,
          scheduledAtUtc: validated.scheduledAtUtc,
          excludeId: reservation?.id,
        },
        PUBLISH_SCHEDULE_MIN_GAP_MINUTES,
      );
      const first = conflicts[0];
      if (first) {
        setConflict({
          title: first.episodeTitle,
          time:
            formatUtcInTimeZone(first.scheduledAtUtc, zone) ??
            first.scheduledAtUtc,
          gap: Math.round(first.gapMinutes),
        });
        return;
      }
    }
    if (editing && !reservation) {
      setError(
        lt(
          "예약 정보를 찾을 수 없어요.",
          "studio.publish.schedule.notFound",
        ),
      );
      return;
    }
    const result = editing
      ? publishScheduleStore.updateReservation(reservation.id, {
          date,
          time,
          timeZone: zone,
          allowConflict: forceConflict,
        })
      : publishScheduleStore.createReservation({
          seriesId,
          episodeId: selectedEpisode.id,
          episodeTitle: `${selectedEpisode.episodeNumber}화 ${selectedEpisode.title}`,
          date,
          time,
          timeZone: zone,
          allowConflict: forceConflict,
        });
    if (!result.ok) {
      if (result.code === "CONFLICT") {
        setError(
          lt(
            "같은 시간대 예약이 있어요",
            "studio.publish.schedule.conflictTitle",
          ) + (result.conflictWith ? `: ${result.conflictWith}` : ""),
        );
      } else {
        setError(errorForCode(result.code));
      }
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div
      className="psched__overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="psched__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={lt(
          editing ? "예약 수정" : "새 예약",
          editing
            ? "studio.publish.schedule.editReservation"
            : "studio.publish.schedule.newReservation",
        )}
      >
        <h2 className="psched__dialog-title">
          {lt(
            editing ? "예약 수정" : "새 예약",
            editing
              ? "studio.publish.schedule.editReservation"
              : "studio.publish.schedule.newReservation",
          )}
        </h2>

        <div className="psched__field">
          <label className="psched__label" htmlFor="psched-episode">
            {lt("회차", "studio.publish.schedule.episode")}
          </label>
          <select
            id="psched-episode"
            className="psched__select"
            value={episodeId}
            disabled={editing}
            onChange={(event) => setEpisodeId(event.target.value)}
          >
            <option value="">
              {lt("회차를 선택하세요", "studio.publish.schedule.episodePlaceholder")}
            </option>
            {episodes.map((episode) => (
              <option key={episode.id} value={episode.id}>
                {episode.episodeNumber}화 {episode.title}
              </option>
            ))}
          </select>
        </div>

        <div className="psched__row">
          <div className="psched__field">
            <label className="psched__label" htmlFor="psched-date">
              {lt("발행 날짜", "studio.publish.schedule.date")}
            </label>
            <input
              id="psched-date"
              type="date"
              className="psched__input"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="psched__field">
            <label className="psched__label" htmlFor="psched-time">
              {lt("발행 시각", "studio.publish.schedule.time")}
            </label>
            <input
              id="psched-time"
              type="time"
              className="psched__input"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>

        <div className="psched__field">
          <label className="psched__label" htmlFor="psched-tz">
            {lt("타임존", "studio.publish.schedule.timeZone")}
          </label>
          <select
            id="psched-tz"
            className="psched__select"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
          >
            {COMMON_TIME_ZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {checklist && (
          <div className="psched__checklist">
            <h3 className="psched__checklist-title">
              {lt("발행 전 체크리스트", "studio.publish.schedule.checklistTitle")}
            </h3>
            {checklist.items.map((item) => {
              const label = CHECKLIST_LABELS[item.id] ?? {
                key: item.id,
                fallback: item.id,
              };
              return (
                <div key={item.id} className="psched__checklist-item">
                  <span
                    className={`psched__check-icon psched__check-icon--${item.status}`}
                    aria-hidden="true"
                  >
                    {item.status === "pass" ? "✓" : item.status === "warning" ? "!" : "✕"}
                  </span>
                  <span>
                    {lt(label.fallback, label.key)}
                    {item.detail && (
                      <span className="psched__checklist-detail">
                        {" "}
                        — {item.detail}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {conflict && (
          <div className="psched__error" role="alert">
            {lt("같은 시간대 예약이 있어요", "studio.publish.schedule.conflictTitle")}:{" "}
            {lt(
              `${conflict.title}(${conflict.time})와 ${conflict.gap}분 간격이에요. 그래도 예약할까요?`,
              "studio.publish.schedule.conflictBody",
              { title: conflict.title, time: conflict.time, gap: conflict.gap },
            )}
          </div>
        )}

        {error && (
          <div className="psched__error" role="alert">
            {error}
          </div>
        )}

        <div className="psched__dialog-actions">
          <button type="button" className="psched__btn" onClick={onClose}>
            {lt("닫기", "studio.publish.schedule.close")}
          </button>
          {conflict && (
            <button
              type="button"
              className="psched__btn psched__btn--danger"
              onClick={() => handleSave(true)}
            >
              {lt("그래도 예약", "studio.publish.schedule.scheduleAnyway")}
            </button>
          )}
          <button
            type="button"
            className="psched__btn psched__btn--primary"
            onClick={() => handleSave(false)}
          >
            {lt("예약 저장", "studio.publish.schedule.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
