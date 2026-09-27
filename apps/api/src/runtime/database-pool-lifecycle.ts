import type { OnApplicationShutdown } from "@nestjs/common";

export interface DrainableDatabasePool {
  end(): Promise<void>;
}

export class DatabasePoolShutdownTimeoutError extends Error {
  constructor() {
    super("DB 풀 종료 제한 시간을 초과했습니다. 연결 누수와 진행 중인 트랜잭션을 확인하세요.");
    this.name = "DatabasePoolShutdownTimeoutError";
  }
}

/** HTTP와 소켓 종료 이후 주 DB 풀을 비우며, 중복 종료는 같은 결과를 공유한다. */
export class DatabasePoolLifecycle implements OnApplicationShutdown {
  private shutdown: Promise<void> | undefined;

  constructor(private readonly pool: DrainableDatabasePool, private readonly timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("DB 풀 종료 제한 시간은 양수여야 합니다.");
    }
  }

  onApplicationShutdown(): Promise<void> {
    this.shutdown ??= this.drain();
    return this.shutdown;
  }

  private async drain(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => this.pool.end()),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new DatabasePoolShutdownTimeoutError()), this.timeoutMs);
        }),
      ]);
    } catch (error) {
      throw sanitizeDatabasePoolShutdownFailure(error);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

/** DB 경계 밖으로는 분류 가능한 오류만 전파하며 원본 DSN과 cause는 보존하지 않는다. */
function sanitizeDatabasePoolShutdownFailure(error: unknown): Error {
  if (error instanceof DatabasePoolShutdownTimeoutError) return error;
  const failure = new Error("DB 풀 종료에 실패했습니다. 연결 상태와 종료 절차를 확인하세요.");
  failure.name = "DatabasePoolShutdownFailureError";
  return failure;
}
