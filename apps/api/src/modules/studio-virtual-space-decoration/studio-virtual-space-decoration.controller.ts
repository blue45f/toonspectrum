import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Put,
} from "@nestjs/common";

import { StudioVirtualSpaceDecorationService } from "./studio-virtual-space-decoration.service";

@Controller("studio/space/decoration")
export class StudioVirtualSpaceDecorationController {
  constructor(
    @Inject(StudioVirtualSpaceDecorationService)
    private readonly service: StudioVirtualSpaceDecorationService,
  ) {}

  @Get(":scopeKey/:districtKey")
  @Header("Cache-Control", "no-store, max-age=0")
  async getState(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
    @Param("districtKey") districtKey: string,
  ) {
    return this.service.getState(userId, scopeKey, districtKey);
  }

  @Put(":scopeKey/:districtKey")
  @Header("Cache-Control", "no-store, max-age=0")
  async save(
    @Headers("x-user-id") userId: string | undefined,
    @Param("scopeKey") scopeKey: string,
    @Param("districtKey") districtKey: string,
    @Body() body: unknown,
  ) {
    return this.service.save(userId, scopeKey, districtKey, body);
  }
}
