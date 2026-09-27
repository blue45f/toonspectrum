import { dbPool } from "../platform/database";
import { resolvePgShutdownTimeout } from "../platform/database/pg-connection";

import { DatabasePoolLifecycle } from "./database-pool-lifecycle";

import type { FactoryProvider } from "@nestjs/common";

/** Core API 전역 수명주기 모듈에서 다른 모듈의 종료 이후 풀을 정리한다. */
export const DATABASE_POOL_LIFECYCLE_PROVIDER: FactoryProvider<DatabasePoolLifecycle> = {
  provide: DatabasePoolLifecycle,
  useFactory: () => new DatabasePoolLifecycle(dbPool, resolvePgShutdownTimeout()),
};
