import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";

const RETRY_DELAYS_MS = [50, 250] as const;
const MAX_PENDING_NOTIFICATIONS = 512;
const MAX_PENDING_PER_TARGET = 128;

export type StudioLiveCleanupNotificationRetry = "none" | "bounded";

interface StudioLiveCleanupNotificationBase {
  readonly target: string;
  readonly event: string;
  readonly deliver: () => void;
}

type StudioLiveCleanupNotificationInput = StudioLiveCleanupNotificationBase & (
  | {
      readonly retry: "none";
      readonly isStillRelevant?: never;
    }
  | {
      readonly retry: "bounded";
      readonly isStillRelevant: () => boolean;
    }
);

type PendingStudioLiveCleanupNotification = StudioLiveCleanupNotificationInput & {
  failedAttempts: number;
  nextAttemptAt: number;
};

/**
 * Owns the short-lived, process-local retry boundary for idempotent cleanup tombstones.
 *
 * A target has one FIFO so voice leave remains ahead of presence leave after an adapter failure.
 * Unrelated rooms continue independently, and caller-owned incarnation guards suppress stale
 * retries after a participant rejoins. The queue and retry count are both bounded: durable
 * delivery belongs in an external broker/outbox, not in gateway memory.
 */
@Injectable()
export class StudioLiveCleanupNotificationDispatcher implements OnModuleDestroy {
  private readonly logger = new Logger(StudioLiveCleanupNotificationDispatcher.name);
  private readonly pendingByTarget = new Map<
    string,
    PendingStudioLiveCleanupNotification[]
  >();
  private pendingCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimerDueAt: number | null = null;
  private destroyed = false;

  dispatch(input: StudioLiveCleanupNotificationInput): void {
    if (this.destroyed) return;
    try {
      const pendingForTarget = this.pendingByTarget.get(input.target);
      if (input.retry === "bounded" && pendingForTarget?.length) {
        this.enqueue({ ...input, failedAttempts: 0, nextAttemptAt: 0 });
        return;
      }
      try {
        input.deliver();
      } catch (error) {
        this.warnDeliveryFailure(input, error, 1);
        if (input.retry === "bounded") {
          this.enqueue({
            ...input,
            failedAttempts: 1,
            nextAttemptAt: Date.now() + RETRY_DELAYS_MS[0],
          });
        }
      }
    } catch (error) {
      // Cleanup fan-out can never become part of the authoritative local cleanup transaction.
      this.warnDeliveryFailure(input, error, 0);
    }
  }

  onModuleDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryTimerDueAt = null;
    this.pendingByTarget.clear();
    this.pendingCount = 0;
  }

  private enqueue(notification: PendingStudioLiveCleanupNotification): void {
    const queue = this.pendingByTarget.get(notification.target) ?? [];
    if (
      this.pendingCount >= MAX_PENDING_NOTIFICATIONS ||
      queue.length >= MAX_PENDING_PER_TARGET
    ) {
      this.warnDropped(notification, "capacity");
      return;
    }
    if (queue.length === 0) this.pendingByTarget.set(notification.target, queue);
    queue.push(notification);
    this.pendingCount += 1;
    this.scheduleNextRetry();
  }

  private drainReadyNotifications(): void {
    this.retryTimer = null;
    this.retryTimerDueAt = null;
    const now = Date.now();
    for (const [target, queue] of this.pendingByTarget) {
      while (queue.length > 0) {
        const notification = queue[0];
        if (!notification || notification.nextAttemptAt > now) break;
        if (!this.isStillRelevant(notification)) {
          queue.shift();
          this.pendingCount -= 1;
          continue;
        }
        try {
          notification.deliver();
          queue.shift();
          this.pendingCount -= 1;
        } catch (error) {
          notification.failedAttempts += 1;
          this.warnDeliveryFailure(
            notification,
            error,
            notification.failedAttempts
          );
          const nextDelay = RETRY_DELAYS_MS[notification.failedAttempts - 1];
          if (nextDelay !== undefined) {
            notification.nextAttemptAt = Date.now() + nextDelay;
            break;
          }
          queue.shift();
          this.pendingCount -= 1;
          this.warnDropped(notification, "retries_exhausted");
        }
      }
      if (queue.length === 0) this.pendingByTarget.delete(target);
    }
    this.scheduleNextRetry();
  }

  private scheduleNextRetry(): void {
    if (this.destroyed || this.pendingCount === 0) return;
    let earliest = Number.POSITIVE_INFINITY;
    for (const queue of this.pendingByTarget.values()) {
      const nextAttemptAt = queue[0]?.nextAttemptAt;
      if (nextAttemptAt !== undefined) earliest = Math.min(earliest, nextAttemptAt);
    }
    if (!Number.isFinite(earliest)) return;
    if (this.retryTimer && this.retryTimerDueAt !== null && this.retryTimerDueAt <= earliest) {
      return;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimerDueAt = earliest;
    this.retryTimer = setTimeout(
      () => this.drainReadyNotifications(),
      Math.max(0, earliest - Date.now())
    );
    this.retryTimer.unref?.();
  }

  private isStillRelevant(notification: PendingStudioLiveCleanupNotification): boolean {
    try {
      return notification.isStillRelevant?.() ?? true;
    } catch {
      // A stale notification is safer to drop than to let a policy callback affect cleanup.
      return false;
    }
  }

  private warnDeliveryFailure(
    input: Pick<StudioLiveCleanupNotificationInput, "target" | "event">,
    error: unknown,
    attempt: number
  ): void {
    try {
      this.logger.warn(
        {
          target: input.target,
          event: input.event,
          attempt,
          error: error instanceof Error ? error.message : "unknown",
        },
        "studio live cleanup notification failed"
      );
    } catch {
      // Logging must not make process-local cleanup observable as a failure.
    }
  }

  private warnDropped(
    input: Pick<StudioLiveCleanupNotificationInput, "target" | "event">,
    reason: "capacity" | "retries_exhausted"
  ): void {
    try {
      this.logger.warn(
        { target: input.target, event: input.event, reason },
        "studio live cleanup notification dropped"
      );
    } catch {
      // Logging must not make process-local cleanup observable as a failure.
    }
  }
}
