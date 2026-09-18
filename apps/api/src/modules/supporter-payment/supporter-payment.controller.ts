import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import { SupporterPaymentService } from "./supporter-payment.service";

@Controller()
export class SupporterPaymentController {
  constructor(private readonly service: SupporterPaymentService) {}

  @Get("supporter-payments/config")
  @Header("Cache-Control", "no-store, max-age=0")
  getConfig() {
    return this.service.getPublicConfig();
  }

  @Get("supporter-payments/funding")
  @Header("Cache-Control", "no-store, max-age=0")
  async getFundingSummary() {
    return this.service.getPublicFundingSummary();
  }

  @Get("supporter-payments/supporters")
  @Header("Cache-Control", "no-store, max-age=0")
  async listPublicSupporters(@Query("limit") limit?: string) {
    return this.service.listPublicSupporters(limit);
  }
  @Get("supporter-payments/orders/:orderId")
  @Header("Cache-Control", "no-store, max-age=0")
  async getOrderStatus(@Param("orderId") orderId: string) {
    return this.service.getOrderStatus(orderId);
  }

  @Post("supporter-payments/orders")
  @Header("Cache-Control", "no-store, max-age=0")
  async createOrder(@Body() body: unknown) {
    return this.service.createOrder(body);
  }

  @Post("supporter-payments/confirm")
  @Header("Cache-Control", "no-store, max-age=0")
  async confirm(@Body() body: unknown) {
    return this.service.confirm(body);
  }

  @Post("supporter-payments/webhooks/toss")
  @Header("Cache-Control", "no-store, max-age=0")
  async receiveTossWebhook(@Body() body: unknown) {
    return this.service.receiveTossWebhook(body);
  }

  @Get("admin/supporter-payments")
  @Header("Cache-Control", "no-store, max-age=0")
  async listForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Query("status") status?: string,
    @Query("mode") mode?: string,
    @Query("q") query?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listForAdmin(userId ?? "", status, mode, query, limit);
  }

  @Get("admin/supporter-payments/settings")
  @Header("Cache-Control", "no-store, max-age=0")
  async getSettingsForAdmin(@Headers("x-user-id") userId: string | undefined) {
    return this.service.getSettingsForAdmin(userId ?? "");
  }

  @Post("admin/supporter-payments/settings")
  @Header("Cache-Control", "no-store, max-age=0")
  async updateSettingsForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.updateSettingsForAdmin(userId ?? "", body);
  }

  @Post("admin/supporter-payments/:id/public-visibility")
  @Header("Cache-Control", "no-store, max-age=0")
  async setPublicVisibilityForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { hidden?: unknown },
  ) {
    return this.service.setPublicVisibilityForAdmin(
      userId ?? "",
      id,
      body?.hidden,
    );
  }

  @Post("admin/supporter-payments/:id/resync")
  @Header("Cache-Control", "no-store, max-age=0")
  async resyncForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
  ) {
    return this.service.resyncForAdmin(userId ?? "", id);
  }

  @Post("admin/supporter-payments/:id/cancel")
  @Header("Cache-Control", "no-store, max-age=0")
  async cancelForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { reason?: unknown },
  ) {
    return this.service.cancelForAdmin(userId ?? "", id, body?.reason);
  }
}
