import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { collectionItems, collections, db } from "../../db";

export const ME_COLLECTION_REPOSITORY = Symbol("ME_COLLECTION_REPOSITORY");

export interface CreateOwnedCollectionInput {
  id?: string;
  userId: string;
  name: string;
  emoji: string;
}

export type CreateOwnedCollectionResult =
  | { status: "created" | "replayed"; id: string }
  | { status: "conflict" };

export type OwnedCollectionMutationResult =
  | { status: "updated" }
  | { status: "not_found" };

export type OwnedCollectionItemMutationResult =
  | { status: "updated"; included: boolean }
  | { status: "not_found" };

export interface MergeOwnedCollectionInput {
  clientId?: string;
  name: string;
  emoji: string;
  titleIds: string[];
}

export interface MeCollectionRepository {
  createOwned(input: CreateOwnedCollectionInput): Promise<CreateOwnedCollectionResult>;
  renameOwned(userId: string, id: string, name: string): Promise<OwnedCollectionMutationResult>;
  deleteOwned(userId: string, id: string): Promise<OwnedCollectionMutationResult>;
  setItem(
    userId: string,
    id: string,
    titleId: string,
    included: boolean
  ): Promise<OwnedCollectionItemMutationResult>;
  toggleItem(
    userId: string,
    id: string,
    titleId: string
  ): Promise<OwnedCollectionItemMutationResult>;
  mergeOwned(
    userId: string,
    inputs: MergeOwnedCollectionInput[]
  ): Promise<Record<string, string>>;
}

export type MeCollectionDatabase = Pick<
  typeof db,
  "insert" | "select" | "update" | "delete" | "execute" | "transaction"
>;

export class DrizzleMeCollectionRepository implements MeCollectionRepository {
  constructor(private readonly database: MeCollectionDatabase = db) {}

  async createOwned(input: CreateOwnedCollectionInput): Promise<CreateOwnedCollectionResult> {
    const id = input.id ?? randomUUID();
    const [created] = await this.database
      .insert(collections)
      .values({
        id,
        userId: input.userId,
        name: input.name,
        emoji: input.emoji,
      })
      .onConflictDoNothing({ target: collections.id })
      .returning({ id: collections.id });
    if (created) return { status: "created", id: created.id };

    // Query only an exact same-owner replay. Foreign ownership and a changed payload deliberately
    // collapse to the same conflict result, and no foreign metadata crosses this boundary.
    const [replayed] = await this.database
      .select({ id: collections.id })
      .from(collections)
      .where(
        and(
          eq(collections.id, id),
          eq(collections.userId, input.userId),
          eq(collections.name, input.name),
          eq(collections.emoji, input.emoji)
        )
      )
      .limit(1);
    return replayed
      ? { status: "replayed", id: replayed.id }
      : { status: "conflict" };
  }

  async renameOwned(
    userId: string,
    id: string,
    name: string
  ): Promise<OwnedCollectionMutationResult> {
    const [updated] = await this.database
      .update(collections)
      .set({ name })
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning({ id: collections.id });
    return updated ? { status: "updated" } : { status: "not_found" };
  }

  async deleteOwned(userId: string, id: string): Promise<OwnedCollectionMutationResult> {
    const [deleted] = await this.database
      .delete(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning({ id: collections.id });
    return deleted ? { status: "updated" } : { status: "not_found" };
  }

  async setItem(
    userId: string,
    id: string,
    titleId: string,
    included: boolean
  ): Promise<OwnedCollectionItemMutationResult> {
    return this.database.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, id), eq(collections.userId, userId)))
        .limit(1)
        .for("update");
      if (!owned) return { status: "not_found" };

      if (included) {
        await tx
          .insert(collectionItems)
          .values({ collectionId: id, titleId })
          .onConflictDoNothing();
      } else {
        await tx
          .delete(collectionItems)
          .where(and(eq(collectionItems.collectionId, id), eq(collectionItems.titleId, titleId)));
      }
      return { status: "updated", included };
    });
  }

  async toggleItem(
    userId: string,
    id: string,
    titleId: string
  ): Promise<OwnedCollectionItemMutationResult> {
    return this.database.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, id), eq(collections.userId, userId)))
        .limit(1)
        .for("update");
      if (!owned) return { status: "not_found" };

      const [existing] = await tx
        .select({ collectionId: collectionItems.collectionId })
        .from(collectionItems)
        .where(and(eq(collectionItems.collectionId, id), eq(collectionItems.titleId, titleId)))
        .limit(1);
      if (existing) {
        await tx
          .delete(collectionItems)
          .where(and(eq(collectionItems.collectionId, id), eq(collectionItems.titleId, titleId)));
      } else {
        await tx.insert(collectionItems).values({ collectionId: id, titleId });
      }
      return { status: "updated", included: !existing };
    });
  }

  async mergeOwned(
    userId: string,
    inputs: MergeOwnedCollectionInput[]
  ): Promise<Record<string, string>> {
    if (inputs.length === 0) return {};
    return this.database.transaction(async (transaction) => {
      const tx = transaction as unknown as MeCollectionDatabase;
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`toonspectrum:me-collection-merge:${userId}`}, 0)
        )
      `);

      const scoped = new DrizzleMeCollectionRepository(tx);
      const serverCollections = await tx
        .select()
        .from(collections)
        .where(eq(collections.userId, userId));
      const byName = new Map(serverCollections.map((collection) => [collection.name, collection.id]));
      const ownedIds = new Set(serverCollections.map((collection) => collection.id));
      const idMap: Record<string, string> = {};

      for (const input of inputs) {
        const { clientId, name, emoji, titleIds } = input;
        let collectionId = clientId
          ? (ownedIds.has(clientId) ? clientId : undefined)
          : byName.get(name);

        if (!collectionId) {
          const preferred = await scoped.createOwned({
            ...(clientId ? { id: clientId } : {}),
            userId,
            name,
            emoji,
          });
          if (preferred.status === "conflict") {
            const [concurrentlyOwned] = clientId
              ? await tx
                  .select({ id: collections.id })
                  .from(collections)
                  .where(and(eq(collections.id, clientId), eq(collections.userId, userId)))
                  .limit(1)
              : [];
            if (concurrentlyOwned) {
              collectionId = concurrentlyOwned.id;
            } else {
              const fallback = await scoped.createOwned({ userId, name, emoji });
              if (fallback.status === "conflict") {
                throw new Error("컬렉션 병합 ID를 할당하지 못했습니다.");
              }
              collectionId = fallback.id;
            }
          } else {
            collectionId = preferred.id;
          }
          byName.set(name, collectionId);
          ownedIds.add(collectionId);
        }

        if (clientId) idMap[clientId] = collectionId;
        if (titleIds.length) {
          await tx
            .insert(collectionItems)
            .values(titleIds.map((titleId) => ({ collectionId, titleId })))
            .onConflictDoNothing();
        }
      }

      return idMap;
    });
  }
}

export const meCollectionRepositoryProvider = {
  provide: ME_COLLECTION_REPOSITORY,
  useFactory: (): MeCollectionRepository => new DrizzleMeCollectionRepository(),
};
