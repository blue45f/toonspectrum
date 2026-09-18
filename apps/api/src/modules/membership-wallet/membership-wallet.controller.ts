import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { MembershipWalletService } from "./membership-wallet.service";

type ActivityClaimBody = {
  activity?: unknown;
  sourceRef?: unknown;
  metadata?: Record<string, unknown>;
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

  @Get("membership/entitlements")
  @Header("Cache-Control", "no-store, max-age=0")
  getEntitlements(@Headers("x-user-id") userId: string | undefined) {
    return this.service.getEffectiveEntitlements(userId);
  }

  @Post("membership/activity/claim")
  @Header("Cache-Control", "no-store, max-age=0")
  claimActivityPoints(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: ActivityClaimBody,
  ) {
    return this.service.claimClientActivityPoints({
      userId,
      activity: body?.activity,
      sourceRef: body?.sourceRef,
      metadata: body?.metadata,
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
      delta: body.delta ?? body.units,
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
