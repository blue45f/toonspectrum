import {
  Controller,
  Inject,
  Get,
  Header,
  Headers,
  Param,
  Patch,
  Query,
} from "@nestjs/common";

import { MembershipOperationsService } from "./membership-operations.service";

@Controller()
export class MembershipOperationsController {
  constructor(@Inject(MembershipOperationsService) private readonly service: MembershipOperationsService) {}

  @Get("membership/operations/overview")
  @Header("Cache-Control", "private, no-store, max-age=0")
  overview(@Headers("x-user-id") userId: string | undefined) {
    return this.service.overview(userId);
  }

  @Patch("membership/operations/notices/:noticeId/seen")
  @Header("Cache-Control", "private, no-store, max-age=0")
  markNoticeSeen(
    @Headers("x-user-id") userId: string | undefined,
    @Param("noticeId") noticeId: string,
  ) {
    return this.service.markNoticeSeen(userId, noticeId);
  }

  @Get("admin/membership/operations/policy-history")
  @Header("Cache-Control", "private, no-store, max-age=0")
  policyHistory(
    @Headers("x-user-id") adminId: string | undefined,
    @Query("limit") limit?: string,
  ) {
    return this.service.policyHistory(adminId, limit);
  }

  @Get("admin/membership/operations/pending-recoveries")
  @Header("Cache-Control", "private, no-store, max-age=0")
  pendingRecoveries(
    @Headers("x-user-id") adminId: string | undefined,
    @Query("limit") limit?: string,
  ) {
    return this.service.pendingRewardRecoveries(adminId, limit);
  }
}
