import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { promoteDueCreatorPublications } from "../../server/creator/publication";

export const CREATOR_PUBLICATION_SWEEP_INTERVAL_MS = 30_000;

/**
 * Process-local accelerator for scheduled releases. Request-path promotion in the creator server
 * remains the serverless/cold-start safety net, so correctness never depends on this timer living
 * forever. Revision-fenced updates make overlapping replicas idempotent.
 */
@Injectable()
export class CreatorPublicationSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CreatorPublicationSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  onModuleInit(): void {
    void this.sweep();
    this.timer = globalThis.setInterval(() => {
      void this.sweep();
    }, CREATOR_PUBLICATION_SWEEP_INTERVAL_MS);
    const timer = this.timer as unknown;
    if (
      typeof timer === "object" &&
      timer !== null &&
      "unref" in timer &&
      typeof (timer as { unref?: unknown }).unref === "function"
    ) {
      (timer as { unref(): void }).unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer !== null) globalThis.clearInterval(this.timer);
    this.timer = null;
  }

  private async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await promoteDueCreatorPublications({ limit: 50 });
      if (result.promoted > 0) {
        this.logger.log(`예약 작품 ${result.promoted}건을 공개 상태로 전환했습니다.`);
      }
    } catch {
      this.logger.warn("예약 게시 스윕을 완료하지 못했습니다. 다음 주기에 다시 시도합니다.");
    } finally {
      this.running = false;
    }
  }
}
