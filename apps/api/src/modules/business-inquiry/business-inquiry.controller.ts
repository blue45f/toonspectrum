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

import { BusinessInquiryService } from "./business-inquiry.service";

@Controller()
export class BusinessInquiryController {
  constructor(private readonly service: BusinessInquiryService) {}

  @Post("business/inquiries")
  @Header("Cache-Control", "no-store, max-age=0")
  async createInquiry(@Body() body: unknown) {
    return this.service.create(body);
  }

  @Get("admin/business-inquiries")
  @Header("Cache-Control", "no-store, max-age=0")
  async listInquiries(
    @Headers("x-user-id") userId: string | undefined,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listForAdmin(userId ?? "", status, limit);
  }

  @Post("admin/business-inquiries/:id/status")
  @Header("Cache-Control", "no-store, max-age=0")
  async setInquiryStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { status?: unknown },
  ) {
    return this.service.setStatus(userId ?? "", id, body?.status);
  }
}
