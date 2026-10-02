import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  addSpaceBooking,
  addSpaceWaitlistEntry,
  cancelSpaceBooking,
  checkSpaceBookingAt,
  createSpaceBooking,
  expandSpaceRecurringBooking,
  kstWallToEpochMs,
  parseSpaceBookerRoster,
  promoteSpaceWaitlist,
  spaceBookingsForDay,
  STUDIO_SPACE_BOOKING_MAX_RECURRENCE,
  type StudioSpaceBooking,
  type StudioSpaceBookingInput,
  type StudioSpaceBookingRejection,
  type StudioSpaceWaitlistEntry,
  type StudioVirtualSpace,
} from "./studio-virtual-space-space-booking";

export interface StudioVirtualSpaceSpaceBookingPanelProps {
  readonly spaces: readonly StudioVirtualSpace[];
  readonly nowMs?: number;
  /** 제어 모드: 예약 목록을 바깥(페이지)에서 들고 있을 때만 넘긴다. */
  readonly bookings?: readonly StudioSpaceBooking[];
  readonly waitlist?: readonly StudioSpaceWaitlistEntry[];
  readonly onBookingsChange?: (bookings: readonly StudioSpaceBooking[]) => void;
  readonly onWaitlistChange?: (waitlist: readonly StudioSpaceWaitlistEntry[]) => void;
}

function todayText(nowMs: number): string {
  const date = new Date(nowMs + 9 * 3_600_000);
  return date.toISOString().slice(0, 10);
}

export function StudioVirtualSpaceSpaceBookingPanel({
  spaces,
  nowMs,
  bookings: controlledBookings,
  waitlist: controlledWaitlist,
  onBookingsChange,
  onWaitlistChange,
}: StudioVirtualSpaceSpaceBookingPanelProps) {
  const bt = useBilingual("StudioVirtualSpaceSpaceBookingPanel");
  const [now] = useState(() => nowMs ?? Date.now());
  const [internalBookings, setInternalBookings] = useState<readonly StudioSpaceBooking[]>([]);
  const [internalWaitlist, setInternalWaitlist] = useState<readonly StudioSpaceWaitlistEntry[]>([]);
  // 제어 모드에서는 바깥 상태를 읽고 변경만 콜백으로 알린다(입장 게이트와 공유).
  const bookings = controlledBookings ?? internalBookings;
  const waitlist = controlledWaitlist ?? internalWaitlist;
  const setBookings = (next: readonly StudioSpaceBooking[]) => {
    onBookingsChange?.(next);
    if (controlledBookings === undefined) setInternalBookings(next);
  };
  const setWaitlist = (next: readonly StudioSpaceWaitlistEntry[]) => {
    onWaitlistChange?.(next);
    if (controlledWaitlist === undefined) setInternalWaitlist(next);
  };
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [date, setDate] = useState(() => todayText(now));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [roster, setRoster] = useState("");
  const [note, setNote] = useState("");
  const [recurring, setRecurring] = useState<"none" | "daily" | "weekly">("none");
  const [occurrences, setOccurrences] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);

  // 거절 코드 원문을 그대로 보여 주지 않고 예약자가 고칠 수 있는 말로 바꾼다.
  const reasonText = (code: StudioSpaceBookingRejection["code"]): string => {
    switch (code) {
      case "missing-booker": return bt("예약자 이름을 한 명 이상 입력해 주세요.", "Enter at least one booker name.");
      case "past-start": return bt("이미 지난 시간에는 예약할 수 없어요.", "That start time has already passed.");
      case "invalid-range": return bt("종료 시간이 시작 시간보다 빠르거나 같아요.", "The end time must be after the start time.");
      case "over-capacity": return bt("예약 인원이 스페이스 정원을 넘어요.", "The party is larger than the space capacity.");
      case "invalid-capacity": return bt("인원 입력이 올바르지 않아요.", "Check the capacity value.");
      case "conflict": return bt("겹치는 예약이 있어요.", "There's a conflicting booking.");
      case "duplicate-id": return bt("같은 예약이 이미 있어요.", "That booking already exists.");
      case "already-cancelled": return bt("이미 취소된 예약이에요.", "That booking is already cancelled.");
      case "not-found": return bt("예약을 찾을 수 없어요.", "That booking could not be found.");
      default: return bt("예약 정보를 확인해 주세요.", "Check the booking details.");
    }
  };

  const space = spaces.find((entry) => entry.id === spaceId) ?? spaces[0] ?? null;
  const idSeed = useMemo(() => Math.floor(now % 1_000_000), [now]);

  const dayStart = useMemo(() => {
    const base = kstWallToEpochMs(date, "00:00") ?? now;
    return base + dayOffset * 24 * 3_600_000;
  }, [date, dayOffset, now]);
  const dayBookings = useMemo(() => spaceBookingsForDay(bookings, dayStart), [bookings, dayStart]);
  const liveNow = space ? checkSpaceBookingAt(bookings, space.id, now) : null;

  const buildInput = (): StudioSpaceBookingInput | null => {
    if (!space) return null;
    const startsAt = kstWallToEpochMs(date, startTime);
    const endsAt = kstWallToEpochMs(date, endTime);
    if (startsAt === null || endsAt === null) return null;
    return {
      spaceId: space.id,
      spaceName: space.name,
      capacity: space.capacity,
      equipmentTags: space.equipmentTags,
      startsAt,
      endsAt,
      bookerNames: parseSpaceBookerRoster(roster),
      note,
    };
  };

  const handleBook = () => {
    setError(null);
    setNotice(null);
    const bookingInput = buildInput();
    if (!bookingInput) {
      setError(bt("날짜·시간 형식을 확인해 주세요.", "Check the date and time format."));
      return;
    }
    if (recurring === "none") {
      const created = createSpaceBooking(bookingInput, now, `sb-${idSeed}-${bookings.length}`);
      if (!created.ok) {
        setError(`${bt("예약을 만들 수 없어요.", "Couldn't create the booking.")} ${reasonText(created.reason.code)}`);
        return;
      }
      const added = addSpaceBooking(bookings, created.booking);
      if (added.ok) {
        setBookings(added.bookings);
        setNotice(bt("예약했어요.", "Booked."));
      } else if (added.reason.code === "conflict") {
        setError(bt("겹치는 예약이 있어요. 대기열에 등록할 수 있어요.", "There's a conflicting booking. You can join the waitlist."));
      } else {
        setError(`${bt("예약을 만들 수 없어요.", "Couldn't create the booking.")} ${reasonText(added.reason.code)}`);
      }
      return;
    }
    const expansion = expandSpaceRecurringBooking(
      bookingInput,
      { frequency: recurring, occurrences: Math.min(occurrences, STUDIO_SPACE_BOOKING_MAX_RECURRENCE) },
      { nowMs: now, newId: (index) => `sb-${idSeed}-r${index}` },
    );
    let next = bookings;
    let addedCount = 0;
    let failedCount = 0;
    for (const booking of expansion.bookings) {
      const added = addSpaceBooking(next, booking);
      if (added.ok) {
        next = added.bookings;
        addedCount += 1;
      } else {
        failedCount += 1;
      }
    }
    setBookings(next);
    if (addedCount > 0) {
      setNotice(bt(`${addedCount}개 회차를 예약했어요.`, `Booked ${addedCount} occurrence(s).`));
    }
    // 확장 단계에서 빠진 회차와 겹쳐서 못 넣은 회차를 합쳐서 알린다.
    const skippedTotal = expansion.skipped.length + failedCount;
    if (skippedTotal > 0) {
      setError(bt(`${skippedTotal}개 회차는 겹침이나 시간 조건 때문에 건너뛰었어요.`, `${skippedTotal} occurrence(s) were skipped because of conflicts or timing.`));
    }
  };

  const handleWaitlist = () => {
    setError(null);
    setNotice(null);
    const bookingInput = buildInput();
    if (!bookingInput) {
      setError(bt("날짜·시간 형식을 확인해 주세요.", "Check the date and time format."));
      return;
    }
    const result = addSpaceWaitlistEntry(waitlist, bookingInput, { nowMs: now, id: `sw-${idSeed}-${waitlist.length}` });
    if (result.ok) {
      setWaitlist(result.waitlist);
      setNotice(bt("대기열에 등록했어요.", "Added to the waitlist."));
    } else {
      setError(`${bt("대기열에 올릴 수 없어요.", "Couldn't join the waitlist.")} ${reasonText(result.reason.code)}`);
    }
  };

  const handleCancel = (bookingId: string) => {
    setError(null);
    setNotice(null);
    const cancelled = cancelSpaceBooking(bookings, bookingId);
    if (!cancelled.ok) return;
    const booking = bookings.find((entry) => entry.id === bookingId);
    const promoted = booking ? promoteSpaceWaitlist(waitlist, cancelled.bookings, booking.spaceId) : null;
    if (promoted?.promoted) {
      const added = addSpaceBooking(cancelled.bookings, promoted.promoted);
      if (added.ok) {
        // 승격된 예약을 실제 예약 목록에 넣어야 대기 1순위가 사라지지 않는다.
        setBookings(added.bookings);
        setWaitlist(promoted.waitlist);
        setNotice(bt("예약을 취소했어요. 대기 중이던 예약이 대신 확정됐어요.", "Booking cancelled. The waitlisted booking took its place."));
        return;
      }
      // 승격 예약이 검증에서 걸리면 대기열을 그대로 둬서 어느 쪽도 잃지 않는다.
    }
    setBookings(cancelled.bookings);
    setNotice(bt("예약을 취소했어요.", "Booking cancelled."));
  };

  return (
    <section aria-label={bt("스페이스 예약", "Space booking")}>
      <h2>{bt("스페이스 예약", "Space booking")}</h2>
      <p><small>{bt("콘티룸·녹음부스 등 스페이스를 시간대로 예약해요. 모든 시간은 한국 시간(KST) 기준이에요.", "Reserve spaces like the conti room or recording booth by time slot. All times are KST.")}</small></p>

      {liveNow ? <p role="status">{bt(`지금 "${liveNow.spaceName}" 예약이 진행 중이에요.`, `A booking for "${liveNow.spaceName}" is live now.`)}</p> : null}

      <fieldset>
        <legend>{bt("새 예약", "New booking")}</legend>
        <label>{bt("스페이스", "Space")}
          <select value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
            {spaces.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({bt("최대", "up to")} {entry.capacity}{bt("명", "")})</option>)}
          </select>
        </label>
        <label>{bt("날짜", "Date")}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>{bt("시작", "Start")}<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
        <label>{bt("종료", "End")}<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        <label>{bt("예약자 (쉼표·줄바꿈 구분)", "Bookers (comma/newline separated)")}
          <textarea value={roster} onChange={(event) => setRoster(event.target.value)} rows={2} />
        </label>
        <label>{bt("메모", "Note")}<input type="text" value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <label>{bt("반복", "Repeat")}
          <select value={recurring} onChange={(event) => setRecurring(event.target.value as "none" | "daily" | "weekly")}>
            <option value="none">{bt("반복 없음", "No repeat")}</option>
            <option value="daily">{bt("매일", "Daily")}</option>
            <option value="weekly">{bt("매주", "Weekly")}</option>
          </select>
        </label>
        {recurring !== "none" ? <label>{bt("횟수", "Occurrences")}
          <input type="number" min={1} max={STUDIO_SPACE_BOOKING_MAX_RECURRENCE} value={occurrences} onChange={(event) => setOccurrences(Number(event.target.value))} />
        </label> : null}
        <div>
          <button type="button" onClick={handleBook}>{bt("예약하기", "Book")}</button>
          <button type="button" onClick={handleWaitlist}>{bt("대기열 등록", "Join waitlist")}</button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
      </fieldset>

      <div>
        <button type="button" onClick={() => setDayOffset((value) => value - 1)}>{bt("이전 날", "Previous day")}</button>
        <button type="button" onClick={() => { setDate(todayText(now)); setDayOffset(0); }}>{bt("오늘", "Today")}</button>
        <button type="button" onClick={() => setDayOffset((value) => value + 1)}>{bt("다음 날", "Next day")}</button>
      </div>
      <h3>{bt("하루 일정", "Day schedule")}</h3>
      {dayBookings.length === 0
        ? <p>{bt("예약이 없어요.", "No bookings.")}</p>
        : <ul>{dayBookings.map((booking) => (
          <li key={booking.id}>
            {booking.spaceName} · {new Date(booking.startsAt).toLocaleTimeString()}–{new Date(booking.endsAt).toLocaleTimeString()} · {booking.bookerNames.join(", ")}
            <button type="button" onClick={() => handleCancel(booking.id)}>{bt("취소", "Cancel")}</button>
          </li>
        ))}</ul>}
      {waitlist.length > 0 ? <>
        <h3>{bt("대기열", "Waitlist")}</h3>
        <ul>{waitlist.map((entry) => <li key={entry.id}>{entry.spaceName} · {entry.bookerNames.join(", ")}</li>)}</ul>
      </> : null}
    </section>
  );
}
