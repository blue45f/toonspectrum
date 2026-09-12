import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { AllExceptionsFilter } from "../common/all-exceptions.filter";
import { SAFE_HTTP_LOG_REDACT_PATHS, SAFE_HTTP_LOG_SERIALIZERS } from "../logging/http-log-serializers";

/** Shared logging and exception policy; contains no product or catalog modules. */
@Module({
  imports: [LoggerModule.forRoot({
    pinoHttp: {
      transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
      wrapSerializers: false,
      serializers: SAFE_HTTP_LOG_SERIALIZERS,
      redact: [...SAFE_HTTP_LOG_REDACT_PATHS],
    },
  })],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class ApiHttpInfrastructureModule {}
