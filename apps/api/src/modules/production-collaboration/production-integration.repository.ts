import { and, count, eq, gt, gte, isNull } from "drizzle-orm";
import { Injectable } from "@nestjs/common";

import {
  db,
  productionIntegrationConnections,
  productionIntegrationOauthStates,
  productionIntegrationReceipts,
  productionPushSubscriptions,
} from "../../platform/database";

export type ProductionIntegrationProvider =
  | "google-calendar"
  | "google-gmail"
  | "google-drive"
  | "documenso"
  | "toss-payments"
  | "generic-webhook"
  | "discord"
  | "ntfy"
  | "web-push";

export type ProductionIntegrationReceiptState =
  | "pending"
  | "succeeded"
  | "failed"
  | "uncertain";

export class ProductionIntegrationMutationConflictError extends Error {
  constructor() {
    super("production_integration_mutation_conflict");
    this.name = "ProductionIntegrationMutationConflictError";
  }
}

export class ProductionIntegrationMutationInFlightError extends Error {
  constructor(
    readonly state: "pending" | "uncertain",
    readonly externalId: string | null,
  ) {
    super(`production_integration_mutation_${state}`);
    this.name = "ProductionIntegrationMutationInFlightError";
  }
}export interface ProductionIntegrationConnectionRecord {
  readonly ciphertext: string;
  readonly externalAccountId: string | null;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
}

export interface ProductionIntegrationOauthStateRecord {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly redirectPath: string;
}

export interface ProductionPushSubscriptionRecord {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly endpointHash: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly expirationTime: number | null;
}

@Injectable()
export class ProductionIntegrationRepository {
  async beginMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly provider: ProductionIntegrationProvider;
    readonly operation: string;
    readonly requestDigest: string;
  }): Promise<{ readonly replay: Record<string, unknown> | null }> {
    return db.transaction(async (transaction) => {
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
      if (inserted.length === 1) return { replay: null };

      const rows = await transaction
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
        .for("update");      const receipt = rows[0];
      if (!receipt || receipt.requestDigest !== input.requestDigest) {
        throw new ProductionIntegrationMutationConflictError();
      }
      if (receipt.state === "succeeded") {
        if (!receipt.response) {
          throw new Error("succeeded integration receipt has no response");
        }
        return { replay: receipt.response };
      }
      if (receipt.state === "pending" || receipt.state === "uncertain") {
        throw new ProductionIntegrationMutationInFlightError(
          receipt.state,
          receipt.externalId,
        );
      }
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
    });
  }

  async completeMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly externalId?: string | null;
    readonly response: Record<string, unknown>;
  }): Promise<void> {
    const rows = await db
      .update(productionIntegrationReceipts)
      .set({
        state: "succeeded",
        externalId: input.externalId ?? null,
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
      throw new Error("integration receipt completion lost its pending fence");
    }
  }
  async failMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly state: "failed" | "uncertain";
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

  async countMutationsSince(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly operation: string;
    readonly since: Date;
  }): Promise<number> {
    const rows = await db
      .select({ value: count() })
      .from(productionIntegrationReceipts)
      .where(and(
        eq(productionIntegrationReceipts.projectId, input.projectId),
        eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
        eq(productionIntegrationReceipts.operation, input.operation),
        gte(productionIntegrationReceipts.createdAt, input.since),
      ));
    return rows[0]?.value ?? 0;
  }

  async getConnection(
    projectId: string,
    actorUserId: string,
  ): Promise<ProductionIntegrationConnectionRecord | null> {
    const rows = await db
      .select({
        ciphertext: productionIntegrationConnections.ciphertext,
        externalAccountId:
          productionIntegrationConnections.externalAccountId,
        scopes: productionIntegrationConnections.scopes,
        expiresAt: productionIntegrationConnections.expiresAt,
      })
      .from(productionIntegrationConnections)
      .where(and(
        eq(productionIntegrationConnections.projectId, projectId),
        eq(productionIntegrationConnections.actorUserId, actorUserId),
        eq(productionIntegrationConnections.provider, "google-workspace"),
      ))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertConnection(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly ciphertext: string;
    readonly externalAccountId: string | null;
    readonly scopes: readonly string[];
    readonly expiresAt: Date | null;
  }): Promise<void> {
    await db
      .insert(productionIntegrationConnections)
      .values({
        ...input,
        scopes: [...input.scopes],
        provider: "google-workspace",
      })
      .onConflictDoUpdate({
        target: [
          productionIntegrationConnections.projectId,
          productionIntegrationConnections.actorUserId,
          productionIntegrationConnections.provider,
        ],
        set: {
          ciphertext: input.ciphertext,
          externalAccountId: input.externalAccountId,
          scopes: [...input.scopes],
          expiresAt: input.expiresAt,
          updatedAt: new Date(),
        },
      });
  }
  async deleteConnection(
    projectId: string,
    actorUserId: string,
  ): Promise<void> {
    await db
      .delete(productionIntegrationConnections)
      .where(and(
        eq(productionIntegrationConnections.projectId, projectId),
        eq(productionIntegrationConnections.actorUserId, actorUserId),
        eq(productionIntegrationConnections.provider, "google-workspace"),
      ));
  }

  async createOauthState(input: {
    readonly stateHash: string;
    readonly projectId: string;
    readonly actorUserId: string;
    readonly redirectPath: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    await db.insert(productionIntegrationOauthStates).values({
      ...input,
      provider: "google-workspace",
    });
  }

  async consumeOauthState(
    stateHash: string,
  ): Promise<ProductionIntegrationOauthStateRecord | null> {
    return db.transaction(async (transaction) => {
      const rows = await transaction
        .update(productionIntegrationOauthStates)
        .set({ consumedAt: new Date() })
        .where(and(
          eq(productionIntegrationOauthStates.stateHash, stateHash),
          eq(
            productionIntegrationOauthStates.provider,
            "google-workspace",
          ),
          isNull(productionIntegrationOauthStates.consumedAt),
          gt(productionIntegrationOauthStates.expiresAt, new Date()),
        ))
        .returning({
          projectId: productionIntegrationOauthStates.projectId,
          actorUserId: productionIntegrationOauthStates.actorUserId,
          redirectPath: productionIntegrationOauthStates.redirectPath,
        });
      return rows[0] ?? null;
    });
  }

  async upsertPushSubscription(input: ProductionPushSubscriptionRecord) {
    await db
      .insert(productionPushSubscriptions)
      .values(input)
      .onConflictDoUpdate({
        target: [
          productionPushSubscriptions.projectId,
          productionPushSubscriptions.actorUserId,
          productionPushSubscriptions.endpointHash,
        ],
        set: {
          projectId: input.projectId,
          actorUserId: input.actorUserId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          expirationTime: input.expirationTime,
          updatedAt: new Date(),
        },
      });
  }
  async deletePushSubscription(
    projectId: string,
    actorUserId: string,
    endpointHash: string,
  ): Promise<void> {
    await db
      .delete(productionPushSubscriptions)
      .where(and(
        eq(productionPushSubscriptions.projectId, projectId),
        eq(productionPushSubscriptions.actorUserId, actorUserId),
        eq(productionPushSubscriptions.endpointHash, endpointHash),
      ));
  }

  async deletePushSubscriptionByHash(endpointHash: string): Promise<void> {
    await db
      .delete(productionPushSubscriptions)
      .where(eq(productionPushSubscriptions.endpointHash, endpointHash));
  }

  async listPushSubscriptions(
    projectId: string,
  ): Promise<readonly ProductionPushSubscriptionRecord[]> {
    return db
      .select({
        projectId: productionPushSubscriptions.projectId,
        actorUserId: productionPushSubscriptions.actorUserId,
        endpointHash: productionPushSubscriptions.endpointHash,
        endpoint: productionPushSubscriptions.endpoint,
        p256dh: productionPushSubscriptions.p256dh,
        auth: productionPushSubscriptions.auth,
        expirationTime: productionPushSubscriptions.expirationTime,
      })
      .from(productionPushSubscriptions)
      .where(eq(productionPushSubscriptions.projectId, projectId));
  }
}
