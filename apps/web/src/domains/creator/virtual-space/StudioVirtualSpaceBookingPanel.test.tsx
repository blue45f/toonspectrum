// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceBookingPanel } from "./StudioVirtualSpaceBookingPanel";
import { createBoothBooking, type StudioBoothBooking, type StudioVirtualBooth } from "./studio-virtual-space-booking";

const booths: readonly StudioVirtualBooth[] = [
  { id: "story-room-1", name: "콘티룸 1", capacity: 4 },
  { id: "record-booth-1", name: "녹음부스 1", capacity: 2 },
];

// 2026-09-30 10:00 KST
const NOW = Date.UTC(2026, 8, 30, 1, 0, 0);

afterEach(cleanup);

function renderPanel(props: { initialBookings?: readonly StudioBoothBooking[] } = {}) {
  const onBookingsChange = vi.fn();
  const onWaitlistChange = vi.fn();
  render(
    <StudioVirtualSpaceBookingPanel
      booths={booths}
      initialBookings={props.initialBookings}
      nowMs={NOW}
      onBookingsChange={onBookingsChange}
      onWaitlistChange={onWaitlistChange}
    />,
  );
  return { onBookingsChange, onWaitlistChange };
}

function fillBookingForm(booker: string, start = "11:00", end = "12:00") {
  fireEvent.change(screen.getByLabelText("날짜"), { target: { value: "2026-09-30" } });
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("종료"), { target: { value: end } });
  fireEvent.change(screen.getByLabelText("예약자"), { target: { value: booker } });
}

describe("StudioVirtualSpaceBookingPanel", () => {
  it("폼 입력으로 예약을 만들고 KST 기준 목록에 표시한다", () => {
    const { onBookingsChange } = renderPanel();
    fillBookingForm("김툰");
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getByText("예약이 확정되었어요.")).not.toBeNull();
    const items = screen.getAllByTestId("booking-item");
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain("콘티룸 1");
    expect(items[0]?.textContent).toContain("11:00–12:00");
    expect(items[0]?.textContent).toContain("김툰");
    expect(onBookingsChange).toHaveBeenCalledOnce();
  });

  it("과거 시간 예약을 거부한다", () => {
    renderPanel();
    fillBookingForm("김툰", "08:00", "09:00");
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getByText("과거 시간에는 예약할 수 없어요.")).not.toBeNull();
    expect(screen.queryAllByTestId("booking-item")).toHaveLength(0);
  });

  it("충돌 시 대기열 등록을 제안하고 FIFO 순서로 쌓는다", () => {
    const { onWaitlistChange } = renderPanel();
    fillBookingForm("김툰");
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    fillBookingForm("이툰");
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getByText("선택한 시간대에 이미 예약이 있어요. 대기열에 등록할 수 있어요.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /대기열에 등록하기/ }));
    expect(screen.getByText("대기열에 등록했어요. 빈자리가 생기면 요청 순서대로 확정돼요.")).not.toBeNull();
    const waitlistItems = screen.getAllByTestId("waitlist-item");
    expect(waitlistItems).toHaveLength(1);
    expect(waitlistItems[0]?.textContent).toContain("이툰");
    expect(onWaitlistChange).toHaveBeenCalledOnce();
  });

  it("취소 시 대기열 1순위를 자동 승격한다", () => {
    renderPanel();
    fillBookingForm("김툰");
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    fillBookingForm("이툰");
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    fireEvent.click(screen.getByRole("button", { name: /대기열에 등록하기/ }));
    // 김툰 예약을 취소한다
    const cancelButtons = screen.getAllByRole("button", { name: "취소하기" });
    expect(cancelButtons).toHaveLength(1);
    fireEvent.click(cancelButtons[0]!);
    expect(screen.getByText(/대기 1순위 이툰님의 예약이 확정되었어요/)).not.toBeNull();
    expect(screen.queryAllByTestId("waitlist-item")).toHaveLength(0);
    const items = screen.getAllByTestId("booking-item");
    expect(items.some((item) => item.textContent?.includes("이툰") && item.getAttribute("data-status") === "confirmed")).toBe(true);
  });

  it("취소된 예약은 목록에 취소 상태로 남는다", () => {
    renderPanel();
    fillBookingForm("김툰");
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    fireEvent.click(screen.getByRole("button", { name: "취소하기" }));
    const items = screen.getAllByTestId("booking-item");
    expect(items).toHaveLength(1);
    expect(items[0]?.getAttribute("data-status")).toBe("cancelled");
    expect(items[0]?.textContent).toContain("취소됨");
  });

  it("진행 중인 예약을 '진행 중'으로 표시한다", () => {
    // 진행 중인 예약은 필연적으로 startsAt < now 이므로 fixture 생성 시점(fixtureNow)은
    // 예약 시작보다 이전이어야 past-start 검증에 걸리지 않는다.
    const fixtureNow = Date.UTC(2026, 8, 30, 0, 0, 0); // 09:00 KST
    const created = createBoothBooking(
      {
        boothId: "story-room-1",
        boothName: "콘티룸 1",
        capacity: 4,
        startsAt: Date.UTC(2026, 8, 30, 0, 30, 0), // 09:30 KST
        endsAt: Date.UTC(2026, 8, 30, 2, 30, 0), // 11:30 KST
        bookerName: "박툰",
      },
      fixtureNow,
      "live-1",
    );
    if (!created.ok) throw new Error("fixture failed");
    renderPanel({ initialBookings: [created.booking] });
    expect(screen.getByText("진행 중")).not.toBeNull();
  });

  it("반복 예약을 전개하고 충돌 회차는 대기열로 보낼 수 있다", () => {
    renderPanel();
    fillBookingForm("김툰");
    fireEvent.change(screen.getByLabelText("반복"), { target: { value: "daily" } });
    fireEvent.change(screen.getByLabelText("횟수"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getAllByTestId("booking-item")).toHaveLength(2);
    // 둘째 날 같은 시간대를 다른 예약자가 한 번만 선점 시도 → 충돌
    fillBookingForm("이툰");
    fireEvent.change(screen.getByLabelText("반복"), { target: { value: "once" } });
    fireEvent.change(screen.getByLabelText("날짜"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getByText("선택한 시간대에 이미 예약이 있어요. 대기열에 등록할 수 있어요.")).not.toBeNull();
  });

  it("반복 전개에서 과거로 떨어진 회차는 건너뛰고 안내한다", () => {
    renderPanel();
    // NOW=10:00 KST 기준, 첫 회차(09:00–10:00)는 과거라 건너뛰고 둘째 날 회차만 확정된다
    fillBookingForm("김툰", "09:00", "10:00");
    fireEvent.change(screen.getByLabelText("반복"), { target: { value: "daily" } });
    fireEvent.change(screen.getByLabelText("횟수"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getAllByTestId("booking-item")).toHaveLength(1);
    expect(screen.getByText(/1건 예약 확정/)).not.toBeNull();
    expect(screen.getByText(/1건 과거 시간으로 건너뜀/)).not.toBeNull();
  });
});
