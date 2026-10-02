import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceBookingController } from "./studio-virtual-space-booking.controller";
import type { StudioVirtualSpaceBookingService } from "./studio-virtual-space-booking.service";

describe("StudioVirtualSpaceBookingController", () => {
  it("x-user-id와 경로 값을 서비스로 그대로 위임한다", async () => {
    const service = {
      getSnapshot: vi.fn(async () => ({ scopeKey: "s", bookings: [], waitlist: [] })),
      createBooking: vi.fn(async () => ({ scopeKey: "s", bookings: [], waitlist: [] })),
      cancelBooking: vi.fn(async () => ({ scopeKey: "s", bookings: [], waitlist: [] })),
      joinWaitlist: vi.fn(async () => ({ scopeKey: "s", bookings: [], waitlist: [] })),
      leaveWaitlist: vi.fn(async () => ({ scopeKey: "s", bookings: [], waitlist: [] })),
      getGalleryLikes: vi.fn(async () => ({ scopeKey: "s", frames: {} })),
      toggleGalleryLike: vi.fn(async () => ({ frameId: "f", likes: 1, likedBy: ["u"] })),
    };
    const controller = new StudioVirtualSpaceBookingController(
      service as unknown as StudioVirtualSpaceBookingService,
    );

    await controller.getBookings("user-1", "scope-1");
    expect(service.getSnapshot).toHaveBeenCalledWith("user-1", "scope-1");

    const body = { id: "b1" };
    await controller.createBooking("user-1", "scope-1", body);
    expect(service.createBooking).toHaveBeenCalledWith("user-1", "scope-1", body);

    await controller.cancelBooking("user-1", "scope-1", "b1");
    expect(service.cancelBooking).toHaveBeenCalledWith("user-1", "scope-1", "b1");

    await controller.joinWaitlist("user-1", "scope-1", body);
    expect(service.joinWaitlist).toHaveBeenCalledWith("user-1", "scope-1", body);

    await controller.leaveWaitlist("user-1", "scope-1", "w1");
    expect(service.leaveWaitlist).toHaveBeenCalledWith("user-1", "scope-1", "w1");

    await controller.getGalleryLikes("user-1", "scope-1");
    expect(service.getGalleryLikes).toHaveBeenCalledWith("user-1", "scope-1");

    await controller.toggleGalleryLike("user-1", "scope-1", { frameId: "f" });
    expect(service.toggleGalleryLike).toHaveBeenCalledWith("user-1", "scope-1", { frameId: "f" });
  });
});
