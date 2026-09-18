import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { MembershipWalletService } from "./membership-wallet.service";

type RedeemBody = {
  offerId?: unknown;
  idempotencyKey?: unknown;
};

@Controller()
export class MembershipWalletController {
  constructor(private readonly service: MembershipWalletService) {}

  @Get("membership/catalog")
  @Header("Cache-Control", "no-store, max-age=0")
  getCatalog() {
    return this.service.getPolicyCatalog();
  }
  @Get("membership/overview")
  @Header("Cache-Control", "no-store, max-age=0")
  getOverview(@Headers("x-user-id") userId: string | undefined) {
    return this.service.getOverview(userId);
  }

  @Get("membership/credits/estimate")
  @Header("Cache-Control", "no-store, max-age=0")
  estimateCredits(
    @Query("feature") feature: string | undefined,
    @Query("units") units: string | undefined,
  ) {
    return this.service.estimateCredits(feature, units ?? 1);
  }

  @Post("membership/rewards/redeem")
  @Header("Cache-Control", "no-store, max-age=0")
  redeemRewardPoints(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: RedeemBody,
  ) {
    return this.service.redeemRewardPoints({
      userId,
      offerId: body?.offerId,
      idempotencyKey: body?.idempotencyKey,
    });
  }
  @Get("admin/membership/policy")
  @Header("Cache-Control", "no-store, max-age=0")
  adminGetPolicy(@Headers("x-user-id") adminId: string | undefined) {
    return this.service.adminGetPolicyState(adminId);
  }

  @Post("admin/membership/policy/:key")
  @UseGuards(AdminMutationGuard)
  @Header("Cache-Control", "no-store, max-age=0")
  adminSetPolicy(
    @Headers("x-user-id") adminId: string | undefined,
    @Param("key") key: string,
    @Body() body: { value?: unknown; active?: unknown },
  ) {
    return this.service.adminSetPolicyOverride({
      adminId,
      key,
      value: body?.value,
      active: body?.active,
    });
  }

  @Get("admin/membership/users/:userId")
  @Header("Cache-Control", "no-store, max-age=0")
  adminGetUser(
    @Headers("x-user-id") adminId: string | undefined,
    @Param("userId") userId: string,
  ) {
    return this.service.adminGetUser(adminId, userId);
  }
  @Post("admin/membership/users/:userId/wallet-adjustments")
  @UseGuards(AdminMutationGuard)
  @Header("Cache-Control", "no-store, max-age=0")
  adminAdjustWallet(
    @Headers("x-user-id") adminId: string | undefined,
    @Param("userId") targetUserId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.adminApplyBenefit({
      adminId,
      targetUserId,
      asset: body.asset,
      units: body.units,
      requestKey: body.requestKey,
      reason: body.reason,
    });
  }
  @Post("admin/membership/users/:userId/memberships")
  @UseGuards(AdminMutationGuard)
  @Header("Cache-Control", "no-store, max-age=0")
  adminApplyMembership(
    @Headers("x-user-id") adminId: string | undefined,
    @Param("userId") targetUserId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.adminApplyMembership({
      adminId,
      targetUserId,
      planId: body.planId,
      durationDays: body.durationDays,
      requestKey: body.requestKey,
      reason: body.reason,
    });
  }
  @Post("admin/membership/users/:userId/memberships/:membershipId/revoke")
  @UseGuards(AdminMutationGuard)
  @Header("Cache-Control", "no-store, max-age=0")
  adminRevokeMembership(
    @Headers("x-user-id") adminId: string | undefined,
    @Param("userId") targetUserId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.adminRevokeMembership({
      adminId,
      targetUserId,
      membershipId,
      reason: body.reason,
    });
  }
  @Post("admin/membership/users/:userId/levels")
  @UseGuards(AdminMutationGuard)
  @Header("Cache-Control", "no-store, max-age=0")
  adminUpdateLevels(
    @Headers("x-user-id") adminId: string | undefined,
    @Param("userId") targetUserId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.adminUpdateLevels({
      adminId,
      targetUserId,
      creatorLevel: body.creatorLevel,
      trustLevel: body.trustLevel,
      sellerLevel: body.sellerLevel,
      trustScore: body.trustScore,
    });
  }
}
