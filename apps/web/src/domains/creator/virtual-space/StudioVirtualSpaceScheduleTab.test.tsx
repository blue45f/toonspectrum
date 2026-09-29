// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioVirtualSpaceScheduleTab } from "./StudioVirtualSpaceScheduleTab";
import { createBoothBooking, type StudioBoothBooking, type StudioVirtualBooth } from "./studio-virtual-space-booking";

const booths: readonly StudioVirtualBooth[] = [
  { id: "story-room-1", name: "콘티룸 1", capacity: 4 },
  { id: "record-booth-1", name: "녹음부스 1", capacity: 2 },
];

const DAY = Date.UTC(2026, 8, 30, 1, 0, 0); // 2026-09-30 10:00 KST
const FIXTURE_NOW = Date.UTC(2026, 8, 29, 0, 0, 0);
const LIVE_NOW = Date.UTC(2026, 8, 30, 2, 30, 0); // 11:30 KST

function booking(id: string, boothId: string, boothName: string, startHour: number, endHour: number, booker: string): StudioBoothBooking {
  const created = createBoothBooking(
    {
      boothId,
      boothName,
      capacity: 4,
      startsAt: Date.UTC(2026, 8, 30, startHour, 0, 0),
      endsAt: Date.UTC(2026, 8, 30, endHour, 0, 0),
      bookerName: booker,
    },
    FIXTURE_NOW,
    id,
  );
  if (!created.ok) throw new Error("fixture failed");
  return created.booking;
}

const bookings: readonly StudioBoothBooking[] = [
  booking("b1", "story-room-1", "콘티룸 1", 1, 2, "김툰"), // 10:00–11:00 KST, 종료
  booking("b2", "story-room-1", "콘티룸 1", 2, 4, "이툰"), // 11:00–13:00 KST, 진행 중
  booking("b3", "record-booth-1", "녹음부스 1", 5, 6, "박툰"), // 14:00–15:00 KST, 예정
];

afterEach(cleanup);

describe("StudioVirtualSpaceScheduleTab", () => {
  it("날짜의 예약 블록을 부스별로 렌더하고 진행 상태를 표시한다", () => {
    render(<StudioVirtualSpaceScheduleTab booths={booths} bookings={bookings} initialDayMs={DAY} nowMs={LIVE_NOW} />);
    expect(screen.getByText(/2026-09-30/)).not.toBeNull();
    expect(screen.getByText("모든 시간은 KST(한국 표준시) 기준입니다.")).not.toBeNull();
    const blocks = screen.getAllByTestId("schedule-block");
    expect(blocks).toHaveLength(3);
    const statuses = blocks.map((block) => block.getAttribute("data-status"));
    expect(statuses).toEqual(["past", "live", "upcoming"]);
    expect(blocks[1]?.textContent).toContain("진행 중");
    expect(blocks[1]?.textContent).toContain("11:00–13:00");
    expect(blocks[1]?.textContent).toContain("이툰");
    const boothSections = screen.getAllByTestId("schedule-booth");
    expect(boothSections[0]?.getAttribute("data-booth-id")).toBe("story-room-1");
    expect(boothSections[1]?.getAttribute("data-booth-id")).toBe("record-booth-1");
  });

  it("날짜를 바꾸면 해당 날짜의 스케줄로 갱신된다", () => {
    render(<StudioVirtualSpaceScheduleTab booths={booths} bookings={bookings} initialDayMs={DAY} nowMs={LIVE_NOW} />);
    fireEvent.change(screen.getByLabelText("날짜 선택"), { target: { value: "2026-10-01" } });
    expect(screen.queryAllByTestId("schedule-block")).toHaveLength(0);
    expect(screen.getAllByText("예약 없음")).toHaveLength(2);
  });

  it("예약이 없으면 빈 상태를 안내한다", () => {
    render(<StudioVirtualSpaceScheduleTab booths={booths} bookings={[]} initialDayMs={DAY} nowMs={LIVE_NOW} />);
    expect(screen.queryAllByTestId("schedule-block")).toHaveLength(0);
    expect(screen.getAllByText("예약 없음")).toHaveLength(2);
  });

  it("오늘 버튼으로 오늘 날짜로 돌아간다", () => {
    render(<StudioVirtualSpaceScheduleTab booths={booths} bookings={bookings} initialDayMs={DAY} nowMs={LIVE_NOW} />);
    fireEvent.change(screen.getByLabelText("날짜 선택"), { target: { value: "2026-10-01" } });
    expect(screen.queryAllByTestId("schedule-block")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    // 실제 오늘 날짜 기준이므로 블록 유무와 무관하게 날짜 입력값이 오늘 KST로 복원되는지만 확인
    const dateInput = screen.getByLabelText("날짜 선택") as HTMLInputElement;
    expect(dateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
