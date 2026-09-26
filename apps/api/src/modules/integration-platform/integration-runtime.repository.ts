import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Inject, Injectable } from "@nestjs/common";

import { db, productionIntegrationReceipts } from "../../platform/database";
import {
  INTEGRATION_RUNTIME_PROVIDER_IDS,
  type IntegrationRuntimeProviderId,
  type IntegrationRuntimeReceiptState,
  type IntegrationRuntimeReceiptSummary,
} from "./integration-runtime.contract";

export const INTEGRATION_RUNTIME_DAILY_LIMIT = Symbol(
  "INTEGRATION_RUNTIME_DAILY_LIMIT",
);
export const DEFAULT_INTEGRATION_RUNTIME_DAILY_LIMIT = 100;
const MAXIMUM_INTEGRATION_RUNTIME_DAILY_LIMIT = 1_000;

type EnvLike = Record<string, string | undefined>;

export class IntegrationRuntimeQuotaConfigurationError extends Error {
  constructor() {
    super("integration_runtime_daily_limit_invalid");
    this.name = "IntegrationRuntimeQuotaConfigurationError";
  }
}
export function resolveIntegrationRuntimeDailyLimit(
  env: EnvLike = process.env,
): number {
  const raw = env.INTEGRATION_RUNTIME_DAILY_EXECUTIONS_PER_ACTOR?.trim();
  if (!raw) return DEFAULT_INTEGRATION_RUNTIME_DAILY_LIMIT;
  if (!/^\d+$/u.test(raw)) throw new IntegrationRuntimeQuotaConfigurationError();
  const parsed = Number(raw);
  if (
    !Number.isSafeInteger(parsed)
    || parsed < 1
    || parsed > MAXIMUM_INTEGRATION_RUNTIME_DAILY_LIMIT
  ) {
    throw new IntegrationRuntimeQuotaConfigurationError();
  }
  return parsed;
}

export function integrationRuntimeUtcWindow(now = new Date()) {
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  return {
    start,
    resetAt: new Date(start.getTime() + 86_400_000),
    key: start.toISOString().slice(0, 10),
  } as const;
}
export class IntegrationRuntimeDailyQuotaError extends Error {
  constructor(
    readonly limit: number,
    readonly resetAt: Date,
  ) {
    super("integration_runtime_daily_quota_exceeded");
    this.name = "IntegrationRuntimeDailyQuotaError";
  }
}

export class IntegrationRuntimeMutationConflictError extends Error {
  constructor() {
    super("integration_runtime_mutation_conflict");
    this.name = "IntegrationRuntimeMutationConflictError";
  }
}

export class IntegrationRuntimeMutationInFlightError extends Error {
  constructor(
    readonly state: "pending" | "uncertain",
    readonly externalId: string | null,
  ) {
    super(`integration_runtime_mutation_${state}`);
    this.name = "IntegrationRuntimeMutationInFlightError";
  }
}

interface ExistingRuntimeReceipt {
  readonly requestDigest: string;
  readonly state: string;
  readonly externalId: string | null;
  readonly response: Record<string, unknown> | null;
}

function resolveExistingReceipt(
  receipt: ExistingRuntimeReceipt,
  requestDigest: string,
): { readonly replay: Record<string, unknown> | null; readonly retry: boolean } {
  if (receipt.requestDigest !== requestDigest) {
    throw new IntegrationRuntimeMutationConflictError();
  }
  if (receipt.state === "succeeded") {
    if (!receipt.response) {
      throw new Error("integration runtime success receipt has no response");
    }
    return { replay: receipt.response, retry: false };
  }
  if (receipt.state === "pending" || receipt.state === "uncertain") {
    throw new IntegrationRuntimeMutationInFlightError(
      receipt.state,
      receipt.externalId,
    );
  }
  return { replay: null, retry: true };
}

@Injectable()
export class IntegrationRuntimeRepository {
  constructor(
    @Inject(INTEGRATION_RUNTIME_DAILY_LIMIT)
    private readonly dailyExecutionLimit: number,
  ) {}

  async beginMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly provider: IntegrationRuntimeProviderId;
    readonly operation: string;
    readonly requestDigest: string;
  }): Promise<{ readonly replay: Record<string, unknown> | null }> {
    return db.transaction(async (transaction) => {
      const window = integrationRuntimeUtcWindow();
      await transaction.execute(sql`
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            ${`integration-runtime:${input.actorUserId}:${window.key}`},
            0
          )
        )
      `);

      const existingRows = await transaction
        .select({
          requestDigest: productionIntegrationReceipts.requestDigest,
          state: productionIntegrationReceipts.state,
          externalId: productionIntegrationReceipts.externalId,
          response: productionIntegrationReceipts.response,
        })
        .from(productionIntegrationReceipts)
        .where(and(
          eq(productionIntegrationReceipts.projectId, input.projectId),
          eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
          eq(productionIntegrationReceipts.mutationId, input.mutationId),
        ))
        .limit(1)
        .for("update");
      const existing = existingRows[0];
      if (existing) {
        const resolution = resolveExistingReceipt(
          existing,
          input.requestDigest,
        );
        if (resolution.replay) return { replay: resolution.replay };
        if (resolution.retry) {
          await transaction
            .update(productionIntegrationReceipts)
            .set({
              state: "pending",
              externalId: null,
              response: null,
              errorCode: null,
              updatedAt: new Date(),
            })
            .where(and(
              eq(productionIntegrationReceipts.projectId, input.projectId),
              eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
              eq(productionIntegrationReceipts.mutationId, input.mutationId),
            ));
          return { replay: null };
        }
      }

      const usageRows = await transaction
        .select({ value: count() })
        .from(productionIntegrationReceipts)
        .where(and(
          eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
          inArray(
            productionIntegrationReceipts.provider,
            [...INTEGRATION_RUNTIME_PROVIDER_IDS],
          ),
          gte(productionIntegrationReceipts.createdAt, window.start),
        ));
      const usage = usageRows[0]?.value ?? 0;
      if (usage >= this.dailyExecutionLimit) {
        throw new IntegrationRuntimeDailyQuotaError(
          this.dailyExecutionLimit,
          window.resetAt,
        );
      }

      const inserted = await transaction
        .insert(productionIntegrationReceipts)
        .values({
          ...input,
          state: "pending",
          response: null,
          errorCode: null,
        })
        .onConflictDoNothing()
        .returning({ mutationId: productionIntegrationReceipts.mutationId });
      if (inserted.length !== 1) {
        throw new IntegrationRuntimeMutationConflictError();
      }
      return { replay: null };
    });
  }

  async completeMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly externalId: string | null;
    readonly response: Record<string, unknown>;
  }): Promise<void> {
    const rows = await db
      .update(productionIntegrationReceipts)
      .set({
        state: "succeeded",
        externalId: input.externalId,
        response: input.response,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(productionIntegrationReceipts.projectId, input.projectId),
        eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
        eq(productionIntegrationReceipts.mutationId, input.mutationId),
        eq(productionIntegrationReceipts.state, "pending"),
      ))
      .returning({ mutationId: productionIntegrationReceipts.mutationId });
    if (rows.length !== 1) {
      throw new Error(
        "integration runtime receipt completion lost its pending fence",
      );
    }
  }

  async failMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly state: Exclude<
      IntegrationRuntimeReceiptState,
      "pending" | "succeeded"
    >;
    readonly errorCode: string;
    readonly externalId?: string | null;
  }): Promise<void> {
    await db
      .update(productionIntegrationReceipts)
      .set({
        state: input.state,
        externalId: input.externalId ?? null,
        response: null,
        errorCode: input.errorCode.slice(0, 160),
        updatedAt: new Date(),
      })
      .where(and(
        eq(productionIntegrationReceipts.projectId, input.projectId),
        eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
        eq(productionIntegrationReceipts.mutationId, input.mutationId),
        eq(productionIntegrationReceipts.state, "pending"),
      ));
  }

  async listReceipts(
    projectId: string,
    actorUserId: string,
    limit: number,
  ): Promise<readonly IntegrationRuntimeReceiptSummary[]> {
    const rows = await db
      .select({
        projectId: productionIntegrationReceipts.projectId,
        mutationId: productionIntegrationReceipts.mutationId,
        provider: productionIntegrationReceipts.provider,
        operation: productionIntegrationReceipts.operation,
        state: productionIntegrationReceipts.state,
        externalId: productionIntegrationReceipts.externalId,
        errorCode: productionIntegrationReceipts.errorCode,
        response: productionIntegrationReceipts.response,
        createdAt: productionIntegrationReceipts.createdAt,
        updatedAt: productionIntegrationReceipts.updatedAt,
      })
      .from(productionIntegrationReceipts)
      .where(and(
        eq(productionIntegrationReceipts.projectId, projectId),
        eq(productionIntegrationReceipts.actorUserId, actorUserId),
        inArray(productionIntegrationReceipts.provider, [
          ...INTEGRATION_RUNTIME_PROVIDER_IDS,
        ]),
      ))
      .orderBy(desc(productionIntegrationReceipts.updatedAt))
      .limit(limit);

    return rows.map((row) => ({
      projectId: row.projectId,
      mutationId: row.mutationId,
      provider: row.provider,
      operation: row.operation,
      state: row.state as IntegrationRuntimeReceiptState,
      externalId: row.externalId,
      errorCode: row.errorCode,
      response: row.response,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
