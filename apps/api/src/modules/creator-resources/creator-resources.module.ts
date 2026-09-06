import { BadRequestException, Controller, Get, Header, HttpException, Inject, Module, Query, Req } from "@nestjs/common";

import { createResourceEngine, ResourceBusyError, ResourceInputError } from "./resource-engine";

import type { ResourceEngine } from "./resource-engine";
import type { Request } from "express";

const RESOURCE_ENGINE = Symbol("CREATOR_RESOURCE_ENGINE");

@Controller("creator-resources")
export class CreatorResourcesController {
  constructor(@Inject(RESOURCE_ENGINE) private readonly engine: ResourceEngine) {}

  @Get("providers")
  @Header("Cache-Control", "private, no-store")
  providers() { return this.engine.describe(); }

  @Get("search")
  @Header("Cache-Control", "private, no-store")
  async search(@Query() query: Record<string, unknown>, @Req() req: Request) {
    try {
      return await this.engine.search(query, req.ip ?? req.socket.remoteAddress ?? "anonymous");
    } catch (error) {
      if (error instanceof ResourceInputError) throw new BadRequestException(error.message);
      if (error instanceof ResourceBusyError) throw new HttpException(error.message, 429);
      throw error;
    }
  }
}

@Module({
  controllers: [CreatorResourcesController],
  providers: [{ provide: RESOURCE_ENGINE, useFactory: () => createResourceEngine({ fetch: (url, init) => fetch(url, init), env: () => process.env }) }],
})
export class CreatorResourcesModule {}
