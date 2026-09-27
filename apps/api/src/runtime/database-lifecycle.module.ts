import { Global, Module } from "@nestjs/common";

import { DATABASE_POOL_LIFECYCLE_PROVIDER } from "./database-lifecycle.provider";

/** Nest는 전역 모듈을 마지막에 종료한다. Core API에서만 이 모듈을 등록한다. */
@Global()
@Module({ providers: [DATABASE_POOL_LIFECYCLE_PROVIDER] })
export class DatabaseLifecycleModule {}
