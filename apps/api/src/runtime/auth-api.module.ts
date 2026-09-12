import { Module } from "@nestjs/common";

import { AuthModule } from "../modules/auth/auth.module";

import { ApiHttpInfrastructureModule } from "./api-http-infrastructure.module";

// /me stays in the full API because its review/library read models use the catalog.
@Module({ imports: [ApiHttpInfrastructureModule, AuthModule] })
export class AuthApiModule {}
