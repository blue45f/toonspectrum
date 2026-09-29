import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  buildDaySchedule,
  formatKstDate,
  formatKstTime,
  kstDayStartMs,
  kstWallToEpochMs,
  kstWeekdayIndex,
  type StudioBoothBooking,
  type StudioVirtualBooth,
} from "./studio-virtual-space-booking";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface StudioVirtualSpaceScheduleTabProps {
  readonly booths: readonly StudioVirtualBooth[];
  readonly bookings: readonly StudioBoothBooking[];
  /** 선택 날짜가 속한 임의의 epoch ms. 미지정 시 오늘(KST). */
  readonly initialDayMs?: number;
  /** 테스트용 현재 시각 주입. 미지정 시 Date.now(). */
  readonly nowMs?: number;
}

const tabStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 };
const boothSectionStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const blockListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" };

function blockBorder(status: "upcoming" | "live" | "past"): string {
  if (status === "live") return "2px solid #16a34a";
  if (status === "past") return "1px solid #e5e7eb";
  return "1px solid #93c5fd";
}

/** 하루 스케줄 조감 탭. 날짜 선택 → 시간대별 예약 블록 렌더, 현재 진행 중 표시. */
export function StudioVirtualSpaceScheduleTab({
  booths,
  bookings,
  initialDayMs,
  nowMs: injectedNow,
}: StudioVirtualSpaceScheduleTabProps) {
  const bt = useBilingual("StudioVirtualSpaceScheduleTab");
  const [selectedDayStart, setSelectedDayStart] = useState<number>(() =>
    kstDayStartMs(initialDayMs ?? Date.now()),
  );

  const [now] = useState<number>(() => injectedNow ?? Date.now());
  const blocks = useMemo(
    () => buildDaySchedule(bookings, booths, selectedDayStart, now),
    [bookings, booths, selectedDayStart, now],
  );
  const weekdayIndex = kstWeekdayIndex(selectedDayStart);
  const weekday = bt(WEEKDAY_KO[weekdayIndex] ?? "", WEEKDAY_EN[weekdayIndex] ?? "");

  const handleDateChange = (value: string): void => {
    const dayStart = kstWallToEpochMs(value, "00:00");
    if (dayStart !== null) setSelectedDayStart(dayStart);
  };

  const statusLabel = (status: "upcoming" | "live" | "past"): string => {
    if (status === "live") return bt("진행 중", "Live now");
    if (status === "past") return bt("종료", "Ended");
    return bt("예정", "Upcoming");
  };

  return (
    <section aria-label={bt("하루 스케줄", "Day schedule")} style={tabStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {bt("하루 스케줄", "Day schedule")} · {formatKstDate(selectedDayStart)}({weekday})
        </h2>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          {bt("날짜 선택", "Select date")}
          <input
            type="date"
            value={formatKstDate(selectedDayStart)}
            onChange={(event) => handleDateChange(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => setSelectedDayStart(kstDayStartMs(Date.now()))}>
          {bt("오늘", "Today")}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        {bt("모든 시간은 KST(한국 표준시) 기준입니다.", "All times are shown in KST (Korea Standard Time).")}
      </p>

      {booths.length === 0 ? (
        <p role="status" style={{ fontSize: 13 }}>{bt("표시할 부스가 없어요.", "No booths to display.")}</p>
      ) : (
        booths.map((booth) => {
          const boothBlocks = blocks.filter((block) => block.boothId === booth.id);
          return (
            <div key={booth.id} style={boothSectionStyle} data-testid="schedule-booth" data-booth-id={booth.id}>
              <h3 style={{ margin: 0, fontSize: 14 }}>
                {booth.name} · {bt("최대", "up to")} {booth.capacity}{bt("명", " people")}
              </h3>
              {boothBlocks.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>{bt("예약 없음", "No bookings")}</p>
              ) : (
                <ul style={blockListStyle}>
                  {boothBlocks.map((block) => (
                    <li
                      key={block.bookingId}
                      data-testid="schedule-block"
                      data-status={block.status}
                      data-booth-id={block.boothId}
                      style={{
                        border: blockBorder(block.status),
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        backgroundColor: block.status === "past" ? "#f9fafb" : "#ffffff",
                      }}
                    >
                      <span>
                        <strong>{formatKstTime(block.startsAt)}–{formatKstTime(block.endsAt)}</strong>
                        {" · "}{block.bookerName}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: block.status === "live" ? 700 : 400,
                          color: block.status === "live" ? "#166534" : block.status === "past" ? "#9ca3af" : "#1d4ed8",
                        }}
                      >
                        {statusLabel(block.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
