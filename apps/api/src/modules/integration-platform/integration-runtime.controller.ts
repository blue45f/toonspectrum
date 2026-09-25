import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import {
  IntegrationRuntimeExecuteSchema,
  IntegrationRuntimeReceiptQuerySchema,
  type IntegrationRuntimeExecuteDto,
  type IntegrationRuntimeReceiptQueryDto,
} from "./integration-runtime.dto";
import { IntegrationRuntimeService } from "./integration-runtime.service";

function authenticatedUserId(userId: string | undefined): string {
  if (!userId) throw new UnauthorizedException("로그인이 필요해요.");
  return userId;
}

@Controller("integrations/runtime-connectors")
export class IntegrationRuntimeController {
  constructor(
    @Inject(IntegrationRuntimeService)
    private readonly service: IntegrationRuntimeService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  connectors(@Headers("x-user-id") userId?: string) {
    authenticatedUserId(userId);
    return this.service.connectors();
  }

  @Get("receipts")
  @Header("Cache-Control", "private, no-store, max-age=0")
  receipts(
    @Headers("x-user-id") userId: string | undefined,
    @Query(new ZodValidationPipe(IntegrationRuntimeReceiptQuerySchema))
    query: IntegrationRuntimeReceiptQueryDto,
  ) {
    return this.service.listReceipts(authenticatedUserId(userId), query);
  }

  @Post("execute")
  @Header("Cache-Control", "private, no-store, max-age=0")
  execute(
    @Headers("x-user-id") userId: string | undefined,
    @Body(new ZodValidationPipe(IntegrationRuntimeExecuteSchema))
    body: IntegrationRuntimeExecuteDto,
  ) {
    return this.service.execute(authenticatedUserId(userId), body);
  }
}
