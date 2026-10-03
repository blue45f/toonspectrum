import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
} from "@nestjs/common";

import { StudioVirtualSpaceBookingService } from "./studio-virtual-space-booking.service";

/**
 * 가상 스튜디오 예약·대기열·갤러리 좋아요 API.
 * 인증은 게이트웨이가 주입하는 x-user-id 헤더로 판정한다(decoration과 동일).
 * 변경 응답은 전부 범위 스냅샷이라 클라이언트는 응답 그대로 정본을 교체한다.
 */
@Controller("studio/space")
export class StudioVirtualSpaceBookingController {
  constructor(
    @Inject(StudioVirtualSpaceBookingService)
    private readonly service: StudioVirtualSpaceBookingService,
  ) {}

  @Get("bookings/:scopeKey")
  @Header("Cache-Control", "no-store, max-age=0")
  async getBookings(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
  ) {
    return this.service.getSnapshot(userId, scopeKey);
  }

  @Post("bookings/:scopeKey")
  @Header("Cache-Control", "no-store, max-age=0")
  async createBooking(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
    @Body() body: unknown,
  ) {
    return this.service.createBooking(userId, scopeKey, body);
  }

  @Post("bookings/:scopeKey/:bookingId/cancel")
  @Header("Cache-Control", "no-store, max-age=0")
  async cancelBooking(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
    @Param("bookingId") bookingId: string,
  ) {
    return this.service.cancelBooking(userId, scopeKey, bookingId);
  }

  @Post("waitlist/:scopeKey")
  @Header("Cache-Control", "no-store, max-age=0")
  async joinWaitlist(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
    @Body() body: unknown,
  ) {
    return this.service.joinWaitlist(userId, scopeKey, body);
  }

  @Delete("waitlist/:scopeKey/:entryId")
  @Header("Cache-Control", "no-store, max-age=0")
  async leaveWaitlist(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
    @Param("entryId") entryId: string,
  ) {
    return this.service.leaveWaitlist(userId, scopeKey, entryId);
  }

  @Get("gallery-likes/:scopeKey")
  @Header("Cache-Control", "no-store, max-age=0")
  async getGalleryLikes(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
  ) {
    return this.service.getGalleryLikes(userId, scopeKey);
  }

  @Post("gallery-likes/:scopeKey/toggle")
  @Header("Cache-Control", "no-store, max-age=0")
  async toggleGalleryLike(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
    @Body() body: unknown,
  ) {
    return this.service.toggleGalleryLike(userId, scopeKey, body);
  }
}
