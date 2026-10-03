import { useState, type FormEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  addBoothBooking,
  addBoothWaitlistEntry,
  cancelBoothBooking,
  createBoothBooking,
  expandRecurringBooking,
  formatKstDate,
  formatKstTime,
  kstWallToEpochMs,
  kstWeekdayIndex,
  promoteBoothWaitlist,
  type StudioBoothBooking,
  type StudioBoothBookingInput,
  type StudioBoothBookingRejectionCode,
  type StudioBoothWaitlistEntry,
  type StudioBookingRecurrence,
  type StudioVirtualBooth,
} from "./studio-virtual-space-booking";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function newBookingId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") return cryptoRef.randomUUID();
  return `booking-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000_000).toString(36)}`;
}

export interface StudioVirtualSpaceBookingPanelProps {
  readonly booths: readonly StudioVirtualBooth[];
  readonly initialBookings?: readonly StudioBoothBooking[];
  readonly initialWaitlist?: readonly StudioBoothWaitlistEntry[];
  /** 테스트용 현재 시각 주입. 미지정 시 Date.now(). */
  readonly nowMs?: number;
  readonly onBookingsChange?: (bookings: readonly StudioBoothBooking[]) => void;
  readonly onWaitlistChange?: (waitlist: readonly StudioBoothWaitlistEntry[]) => void;
}

type Notice = { readonly kind: "error" | "success" | "info"; readonly text: string } | null;

const panelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 };
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };
const rowStyle: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" };
const cardStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, fontSize: 13, display: "flex", flexDirection: "column", gap: 4 };

/** 콘티룸·녹음부스 시간제 예약 패널. 서버 없이 로컬 상태로 동작한다. */
export function StudioVirtualSpaceBookingPanel({
  booths,
  initialBookings = [],
  initialWaitlist = [],
  nowMs: injectedNow,
  onBookingsChange,
  onWaitlistChange,
}: StudioVirtualSpaceBookingPanelProps) {
  const bt = useBilingual("StudioVirtualSpaceBookingPanel");
  const [bookings, setBookings] = useState<readonly StudioBoothBooking[]>(initialBookings);
  const [waitlist, setWaitlist] = useState<readonly StudioBoothWaitlistEntry[]>(initialWaitlist);
  const [boothId, setBoothId] = useState<string>(booths[0]?.id ?? "");
  const [dateText, setDateText] = useState<string>(() => formatKstDate(Date.now()));
  const [startText, setStartText] = useState("10:00");
  const [endText, setEndText] = useState("11:00");
  const [bookerName, setBookerName] = useState("");
  const [note, setNote] = useState("");
  const [frequency, setFrequency] = useState<"once" | StudioBookingRecurrence>("once");
  const [occurrences, setOccurrences] = useState(1);
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingConflicts, setPendingConflicts] = useState<readonly StudioBoothBookingInput[] | null>(null);

  // 렌더 중 Date.now() 직접 호출 금지(react-hooks/purity): "현재" 표시는 마운트 시 한 번 고정한다.
  const [renderNowMs] = useState<number>(() => injectedNow ?? Date.now());
  const selectedBooth = booths.find((booth) => booth.id === boothId);
  const weekdayLabel = (epochMs: number): string =>
    bt(WEEKDAY_KO[kstWeekdayIndex(epochMs)] ?? "", WEEKDAY_EN[kstWeekdayIndex(epochMs)] ?? "");

  const reasonText = (code: StudioBoothBookingRejectionCode): string => {
    switch (code) {
      case "missing-booth": return bt("부스를 선택해 주세요.", "Please choose a booth.");
      case "missing-booker": return bt("예약자 이름을 입력해 주세요.", "Please enter the booker's name.");
      case "invalid-capacity": return bt("수용 인원을 확인해 주세요.", "Please check the capacity.");
      case "past-start": return bt("과거 시간에는 예약할 수 없어요.", "You can't book a time in the past.");
      case "invalid-range": return bt("종료 시각은 시작 시각보다 뒤여야 해요.", "The end time must be after the start time.");
      case "duplicate-id": return bt("이미 처리된 예약이에요.", "This booking was already processed.");
      case "not-found": return bt("예약을 찾을 수 없어요.", "The booking was not found.");
      case "already-cancelled": return bt("이미 취소된 예약이에요.", "This booking is already cancelled.");
      case "conflict": return bt("선택한 시간대에 이미 예약이 있어요.", "That time slot is already booked.");
      case "missing-id": return bt("예약 정보를 다시 확인해 주세요.", "Please check the booking details again.");
    }
  };

  const updateBookings = (next: readonly StudioBoothBooking[]): void => {
    setBookings(next);
    onBookingsChange?.(next);
  };
  const updateWaitlist = (next: readonly StudioBoothWaitlistEntry[]): void => {
    setWaitlist(next);
    onWaitlistChange?.(next);
  };

  const baseInput = (): StudioBoothBookingInput | null => {
    if (!selectedBooth) return null;
    const startsAt = kstWallToEpochMs(dateText, startText);
    const endsAt = kstWallToEpochMs(dateText, endText);
    if (startsAt === null || endsAt === null) return null;
    return {
      boothId: selectedBooth.id,
      boothName: selectedBooth.name,
      capacity: selectedBooth.capacity,
      startsAt,
      endsAt,
      bookerName,
      note,
    };
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setPendingConflicts(null);
    const input = baseInput();
    if (!input) {
      setNotice({ kind: "error", text: !selectedBooth ? reasonText("missing-booth") : bt("날짜와 시간을 확인해 주세요.", "Please check the date and time.") });
      return;
    }
    const current = injectedNow ?? Date.now();
    if (frequency === "once") {
      const created = createBoothBooking(input, current, newBookingId());
      if (!created.ok) {
        setNotice({ kind: "error", text: reasonText(created.reason.code) });
        return;
      }
      const added = addBoothBooking(bookings, created.booking);
      if (!added.ok) {
        if (added.reason.code === "conflict") {
          setPendingConflicts([input]);
          setNotice({ kind: "error", text: bt("선택한 시간대에 이미 예약이 있어요. 대기열에 등록할 수 있어요.", "That time slot is already booked. You can join the waitlist instead.") });
        } else {
          setNotice({ kind: "error", text: reasonText(added.reason.code) });
        }
        return;
      }
      updateBookings(added.bookings);
      setNotice({ kind: "success", text: bt("예약이 확정되었어요.", "Your booking is confirmed.") });
      return;
    }
    const safeOccurrences = Number.isFinite(occurrences) ? Math.max(1, Math.floor(occurrences)) : 1;
    const expanded = expandRecurringBooking(input, { frequency, occurrences: safeOccurrences }, { nowMs: current, newId: (index) => `${newBookingId()}-${index}` });
    let next = bookings;
    const conflicts: StudioBoothBookingInput[] = [];
    let confirmedCount = 0;
    for (const booking of expanded.bookings) {
      const added = addBoothBooking(next, booking);
      if (added.ok) {
        next = added.bookings;
        confirmedCount += 1;
      } else {
        conflicts.push({
          boothId: booking.boothId,
          boothName: booking.boothName,
          capacity: booking.capacity,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          bookerName: booking.bookerName,
          note: booking.note,
        });
      }
    }
    updateBookings(next);
    const parts: string[] = [];
    const partsEn: string[] = [];
    if (confirmedCount > 0) {
      parts.push(`${confirmedCount}건 예약 확정`);
      partsEn.push(`${confirmedCount} booking(s) confirmed`);
    }
    if (conflicts.length > 0) {
      parts.push(`${conflicts.length}건 시간대 겹침`);
      partsEn.push(`${conflicts.length} slot(s) overlapped`);
      setPendingConflicts(conflicts);
    }
    if (expanded.truncated) {
      parts.push(bt("반복 횟수 상한 적용", "recurrence cap applied"));
      partsEn.push("recurrence cap applied");
    }
    if (expanded.skipped.length > 0) {
      parts.push(bt(`${expanded.skipped.length}건 과거 시간으로 건너뜀`, `${expanded.skipped.length} occurrence(s) skipped (in the past)`));
      partsEn.push(`${expanded.skipped.length} occurrence(s) skipped (in the past)`);
    }
    setNotice({
      kind: conflicts.length > 0 ? "error" : "success",
      text: bt(parts.join(" · ") || "예약이 확정되었어요.", partsEn.filter(Boolean).join(" · ") || "Your bookings are confirmed."),
    });
  };

  const handleJoinWaitlist = (): void => {
    if (!pendingConflicts || pendingConflicts.length === 0) return;
    const current = injectedNow ?? Date.now();
    let next = waitlist;
    for (const candidate of pendingConflicts) {
      const added = addBoothWaitlistEntry(next, candidate, { nowMs: current, id: newBookingId() });
      if (!added.ok) {
        setNotice({ kind: "error", text: reasonText(added.reason.code) });
        return;
      }
      next = added.waitlist;
    }
    updateWaitlist(next);
    setPendingConflicts(null);
    setNotice({ kind: "success", text: bt("대기열에 등록했어요. 빈자리가 생기면 요청 순서대로 확정돼요.", "You're on the waitlist. Open slots are confirmed in request order.") });
  };

  const handleCancel = (bookingId: string): void => {
    const cancelled = cancelBoothBooking(bookings, bookingId);
    if (!cancelled.ok) {
      setNotice({ kind: "error", text: reasonText(cancelled.reason.code) });
      return;
    }
    const target = bookings.find((entry) => entry.id === bookingId);
    const promotedResult = target ? promoteBoothWaitlist(waitlist, cancelled.bookings, target.boothId) : { promoted: null, waitlist };
    let nextBookings = cancelled.bookings;
    let nextWaitlist = promotedResult.waitlist;
    if (promotedResult.promoted) {
      const added = addBoothBooking(nextBookings, promotedResult.promoted);
      if (added.ok) {
        nextBookings = added.bookings;
      } else {
        // 승격 슬롯에 다시 충돌이 생긴 드문 경우: 대기열로 되돌린다.
        // requestedAt은 렌더 시점 고정값(renderNowMs)을 재사용한다(react-hooks/purity).
        nextWaitlist = [
          ...promotedResult.waitlist,
          {
            id: promotedResult.promoted.id,
            boothId: promotedResult.promoted.boothId,
            boothName: promotedResult.promoted.boothName,
            capacity: promotedResult.promoted.capacity,
            startsAt: promotedResult.promoted.startsAt,
            endsAt: promotedResult.promoted.endsAt,
            bookerName: promotedResult.promoted.bookerName,
            note: promotedResult.promoted.note,
            requestedAt: renderNowMs,
          },
        ];
      }
    }
    updateBookings(nextBookings);
    updateWaitlist(nextWaitlist);
    setNotice({
      kind: "success",
      text: promotedResult.promoted
        ? bt(`예약을 취소했어요. 대기 1순위 ${promotedResult.promoted.bookerName}님의 예약이 확정되었어요.`, `Booking cancelled. ${promotedResult.promoted.bookerName}, first on the waitlist, is now confirmed.`)
        : bt("예약을 취소했어요.", "The booking is cancelled."),
    });
  };

  const sortedBookings = [...bookings].sort((a, b) => a.startsAt - b.startsAt);
  const liveAt = renderNowMs;

  return (
    <section aria-label={bt("부스 예약", "Booth booking")} style={panelStyle}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>{bt("콘티룸 · 녹음부스 예약", "Storyboard room · recording booth booking")}</h2>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{bt("모든 시간은 KST 기준이에요.", "All times are shown in KST (Korea Standard Time).")}</p>
      </div>

      {booths.length === 0 ? (
        <p role="status">{bt("예약 가능한 부스가 없어요.", "No booths are available for booking.")}</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={rowStyle}>
            <label style={fieldStyle}>
              {bt("부스", "Booth")}
              <select value={boothId} onChange={(event) => setBoothId(event.target.value)}>
                {booths.map((booth) => (
                  <option key={booth.id} value={booth.id}>{booth.name} · {bt("최대", "up to")} {booth.capacity}{bt("명", " people")}</option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              {bt("날짜", "Date")}
              <input type="date" value={dateText} onChange={(event) => setDateText(event.target.value)} required />
            </label>
            <label style={fieldStyle}>
              {bt("시작", "Start")}
              <input type="time" value={startText} onChange={(event) => setStartText(event.target.value)} required />
            </label>
            <label style={fieldStyle}>
              {bt("종료", "End")}
              <input type="time" value={endText} onChange={(event) => setEndText(event.target.value)} required />
            </label>
          </div>
          <div style={rowStyle}>
            <label style={fieldStyle}>
              {bt("예약자", "Booker")}
              <input type="text" value={bookerName} onChange={(event) => setBookerName(event.target.value)} placeholder={bt("이름 입력", "Your name")} required />
            </label>
            <label style={fieldStyle}>
              {bt("메모", "Note")}
              <input type="text" value={note} onChange={(event) => setNote(event.target.value)} placeholder={bt("선택 사항", "Optional")} />
            </label>
            <label style={fieldStyle}>
              {bt("반복", "Repeat")}
              <select value={frequency} onChange={(event) => setFrequency(event.target.value as "once" | StudioBookingRecurrence)}>
                <option value="once">{bt("한 번만", "One time")}</option>
                <option value="daily">{bt("매일", "Daily")}</option>
                <option value="weekly">{bt("매주", "Weekly")}</option>
              </select>
            </label>
            {frequency !== "once" ? (
              <label style={fieldStyle}>
                {bt("횟수", "Times")}
                <input type="number" min={1} max={60} value={occurrences} onChange={(event) => setOccurrences(Number(event.target.value))} />
              </label>
            ) : null}
          </div>
          <div>
            <button type="submit">{bt("예약하기", "Book")}</button>
          </div>
        </form>
      )}

      {notice ? <p role="status" style={{ margin: 0, fontSize: 13, color: notice.kind === "error" ? "#b91c1c" : "#166534" }}>{notice.text}</p> : null}
      {pendingConflicts && pendingConflicts.length > 0 ? (
        <div>
          <button type="button" onClick={handleJoinWaitlist}>
            {bt("대기열에 등록하기", "Join the waitlist")} ({pendingConflicts.length})
          </button>
        </div>
      ) : null}

      <div>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{bt("예약 목록", "Bookings")}</h3>
        {sortedBookings.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{bt("아직 예약이 없어요.", "No bookings yet.")}</p>
        ) : (
          <ul style={listStyle}>
            {sortedBookings.map((booking) => {
              const isLive = liveAt >= booking.startsAt && liveAt < booking.endsAt;
              const isCancelled = booking.status === "cancelled";
              return (
                <li key={booking.id} style={cardStyle} data-testid="booking-item" data-status={booking.status}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong>{booking.boothName}</strong>
                    <span style={{ fontSize: 12, color: isCancelled ? "#9ca3af" : isLive ? "#166534" : "#6b7280" }}>
                      {isCancelled ? bt("취소됨", "Cancelled") : isLive ? bt("진행 중", "Live now") : bt("확정", "Confirmed")}
                    </span>
                  </div>
                  <span>{formatKstDate(booking.startsAt)}({weekdayLabel(booking.startsAt)}) {formatKstTime(booking.startsAt)}–{formatKstTime(booking.endsAt)} · {booking.bookerName}</span>
                  {booking.note ? <span style={{ color: "#6b7280" }}>{booking.note}</span> : null}
                  {!isCancelled ? (
                    <div>
                      <button type="button" onClick={() => handleCancel(booking.id)}>{bt("취소하기", "Cancel")}</button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {waitlist.length > 0 ? (
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{bt("대기열", "Waitlist")}</h3>
          <ul style={listStyle}>
            {waitlist.map((entry, index) => (
              <li key={entry.id} style={cardStyle} data-testid="waitlist-item">
                <span><strong>#{index + 1}</strong> {entry.boothName} · {formatKstDate(entry.startsAt)} {formatKstTime(entry.startsAt)}–{formatKstTime(entry.endsAt)} · {entry.bookerName}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
