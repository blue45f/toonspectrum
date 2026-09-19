import {
  Body,
  Controller,
  Inject,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";
import { CommerceService } from "./commerce.service";

@Controller()
export class CommerceController {
  constructor(@Inject(CommerceService) private readonly commerceService: CommerceService) {}

  @Get("commerce/config")
  @Header("Cache-Control", "no-store, max-age=0")
  getConfig() {
    return this.commerceService.getPublicConfig();
  }

  @Get("commerce/market/:id/quote")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getMarketQuote(
    @Param("id") id: string,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.commerceService.getMarketplaceQuote(id, userId);
  }

  @Post("commerce/market/:id/orders")
  @HttpCode(HttpStatus.OK)
  createMarketOrder(
    @Param("id") id: string,
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.commerceService.createMarketplaceOrder(userId, id, body);
  }

  @Get("commerce/orders")
  @Header("Cache-Control", "private, no-store, max-age=0")
  listMyOrders(@Headers("x-user-id") userId?: string) {
    return this.commerceService.listMyOrders(userId);
  }

  @Post("commerce/confirm")
  @HttpCode(HttpStatus.OK)
  confirm(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.commerceService.confirm(userId, body);
  }

  @Post("commerce/webhooks/toss")
  @HttpCode(HttpStatus.OK)
  tossWebhook(@Body() body: unknown) {
    return this.commerceService.handleTossWebhook(body);
  }

  @Get("admin/commerce/settings")
  @Header("Cache-Control", "no-store, max-age=0")
  getAdminSettings(@Headers("x-user-id") userId?: string) {
    return this.commerceService.getAdminSettings(userId);
  }

  @Post("admin/commerce/settings")
  @UseGuards(AdminMutationGuard)
  updateAdminSettings(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.commerceService.updateAdminSettings(userId, body);
  }

  @Get("admin/commerce/orders")
  @Header("Cache-Control", "no-store, max-age=0")
  listAdminOrders(@Headers("x-user-id") userId?: string) {
    return this.commerceService.listAdminOrders(userId);
  }

  @Post("admin/commerce/orders/:orderId/cancel")
  @UseGuards(AdminMutationGuard)
  cancelOrder(
    @Headers("x-user-id") userId: string | undefined,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    return this.commerceService.cancelAdminOrder(userId, orderId, body);
  }

  @Post("admin/commerce/market/:id/price")
  @UseGuards(AdminMutationGuard)
  setMarketPrice(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.commerceService.setMarketplacePrice(userId, id, body);
  }
}
