import { Module } from "@nestjs/common";

import { UpstashCoordinationModule } from "../../infrastructure/upstash-coordination/upstash-coordination.module";

import { resolveAuthClientIpPolicy } from "./auth-client-ip";
import {
  resolveAuthRateLimitConfig,
  type AuthRateLimitConfig,
} from "./auth-rate-limit.config";
import { AuthController } from "./auth.controller";
import {
  AUTH_CLIENT_IP_POLICY,
  AUTH_RATE_LIMIT_CONFIG,
} from "./auth.tokens";

const authRateLimitConfig: AuthRateLimitConfig = resolveAuthRateLimitConfig(
  process.env
);
const upstashCoordinationModule = authRateLimitConfig.distributed
  ? UpstashCoordinationModule.fromEnvironment(process.env)
  : null;

@Module({
  imports: upstashCoordinationModule ? [upstashCoordinationModule] : [],
  providers: [
    {
      provide: AUTH_RATE_LIMIT_CONFIG,
      useFactory: () => resolveAuthRateLimitConfig(process.env),
    },
    {
      provide: AUTH_CLIENT_IP_POLICY,
      useFactory: () => resolveAuthClientIpPolicy(process.env),
    },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
