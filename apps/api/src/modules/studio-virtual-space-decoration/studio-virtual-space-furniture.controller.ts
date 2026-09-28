import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
} from "@nestjs/common";

import { StudioVirtualSpaceFurnitureService } from "./studio-virtual-space-furniture.service";

@Controller("studio/space/furniture")
export class StudioVirtualSpaceFurnitureController {
  constructor(
    @Inject(StudioVirtualSpaceFurnitureService)
    private readonly service: StudioVirtualSpaceFurnitureService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store, max-age=0")
  async list(@Headers("x-user-id") userId: string | undefined) {
    return this.service.list(userId);
  }

  @Post()
  @Header("Cache-Control", "no-store, max-age=0")
  async upload(@Headers("x-user-id") userId: string | undefined, @Body() body: unknown) {
    return this.service.upload(userId, body);
  }

  /**
   * 렌더에 쓰는 서명 URL. 남의 가구는 소유권 검사에서 걸러지므로 404가 된다.
   * URL을 캐시하지 않게 지시해 발급된 서명이 다른 기기로 새지 않게 한다.
   */
  @Get(":furnitureId/read-url")
  @Header("Cache-Control", "no-store, max-age=0")
  async readUrl(
    @Headers("x-user-id") userId: string | undefined,
    @Param("furnitureId") furnitureId: string,
  ) {
    return this.service.createReadUrl(userId, furnitureId);
  }
}
