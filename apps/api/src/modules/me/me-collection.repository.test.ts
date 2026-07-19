import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { collectionItems, collections } from "../../../../../lib/db/schema";

import { DrizzleMeCollectionRepository } from "./me-collection.repository";

import type { MeCollectionDatabase } from "./me-collection.repository";

interface CollectionRow {
  id: string;
  userId: string;
  name: string;
  emoji: string;
}

interface HarnessState {
  row: CollectionRow | null;
  inserted: CollectionRow | null;
  conflictTarget: unknown;
  replayCondition: { sql: string; params: unknown[] } | null;
}

class FakeInsertQuery {
  private candidate: CollectionRow | null = null;

  constructor(private readonly state: HarnessState) {}

  values(value: CollectionRow): this {
    this.candidate = { ...value };
    this.state.inserted = { ...value };
    return this;
  }

  onConflictDoNothing(options: { target?: unknown }): this {
    this.state.conflictTarget = options.target;
    return this;
  }

  returning(): Promise<Array<{ id: string }>> {
    if (!this.candidate || this.state.row) return Promise.resolve([]);
    this.state.row = { ...this.candidate };
    return Promise.resolve([{ id: this.candidate.id }]);
  }
}

class FakeSelectQuery {
  private condition: { sql: string; params: unknown[] } | null = null;

  constructor(private readonly state: HarnessState) {}

  from(): this {
    return this;
  }

  where(value: unknown): this {
    const rendered = new PgDialect().sqlToQuery(value as never);
    this.condition = { sql: rendered.sql, params: [...rendered.params] };
    this.state.replayCondition = this.condition;
    return this;
  }

  limit(): Promise<Array<{ id: string }>> {
    const row = this.state.row;
    const params = this.condition?.params ?? [];
    return Promise.resolve(
      row &&
        params.includes(row.id) &&
        params.includes(row.userId) &&
        params.includes(row.name) &&
        params.includes(row.emoji)
        ? [{ id: row.id }]
        : []
    );
  }
}

function harness(existing: CollectionRow | null = null) {
  const state: HarnessState = {
    row: existing ? { ...existing } : null,
    inserted: null,
    conflictTarget: null,
    replayCondition: null,
  };
  const database = {
    insert: () => new FakeInsertQuery(state),
    select: () => new FakeSelectQuery(state),
  } as unknown as MeCollectionDatabase;
  return { state, repository: new DrizzleMeCollectionRepository(database) };
}

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const exact = {
  id: CLIENT_ID,
  userId: "owner-1",
  name: "컬렉션",
  emoji: "📚",
};

describe("DrizzleMeCollectionRepository create fencing", () => {
  it("persists the exact client UUID and scopes conflict handling to the primary key", async () => {
    const { repository, state } = harness();

    await expect(repository.createOwned(exact)).resolves.toEqual({
      status: "created",
      id: CLIENT_ID,
    });
    expect(state.inserted).toEqual(exact);
    expect(state.row).toEqual(exact);
    expect(state.conflictTarget).toBe(collections.id);
  });

  it("treats only the exact same-owner canonical payload as an idempotent replay", async () => {
    const same = harness(exact);
    await expect(same.repository.createOwned(exact)).resolves.toEqual({
      status: "replayed",
      id: CLIENT_ID,
    });
    expect(same.state.replayCondition?.params).toEqual(expect.arrayContaining([
      CLIENT_ID,
      "owner-1",
      "컬렉션",
      "📚",
    ]));

    const renamed = harness(exact);
    await expect(renamed.repository.createOwned({ ...exact, name: "다른 이름" }))
      .resolves.toEqual({ status: "conflict" });
    expect(renamed.state.row).toEqual(exact);

    const foreign = harness({ ...exact, userId: "other-owner" });
    await expect(foreign.repository.createOwned(exact)).resolves.toEqual({
      status: "conflict",
    });
    expect(foreign.state.row).toEqual({ ...exact, userId: "other-owner" });
  });

  it("generates a server UUID v4 for a legacy create without an explicit ID", async () => {
    const { repository, state } = harness();
    const result = await repository.createOwned({
      userId: "owner-1",
      name: "구버전",
      emoji: "📚",
    });

    expect(result.status).toBe("created");
    expect(state.inserted?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });
});

interface MutationHarnessState {
  collections: CollectionRow[];
  items: Set<string>;
  locks: string[];
  conditions: Array<{ sql: string; params: unknown[] }>;
}

function renderCondition(state: MutationHarnessState, value: unknown) {
  const rendered = new PgDialect().sqlToQuery(value as never);
  const condition = { sql: rendered.sql, params: [...rendered.params] };
  state.conditions.push(condition);
  return condition;
}

class MutationSelectQuery implements PromiseLike<Array<Record<string, string>>> {
  private table: unknown;
  private condition: { sql: string; params: unknown[] } | null = null;

  constructor(private readonly state: MutationHarnessState) {}

  from(table: unknown): this {
    this.table = table;
    return this;
  }

  where(value: unknown): this {
    this.condition = renderCondition(this.state, value);
    return this;
  }

  limit(): this {
    return this;
  }

  for(mode: string): Promise<Array<Record<string, string>>> {
    this.state.locks.push(mode);
    return this.execute();
  }

  then<TResult1 = Array<Record<string, string>>, TResult2 = never>(
    onfulfilled?: ((value: Array<Record<string, string>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<Array<Record<string, string>>> {
    const params = this.condition?.params ?? [];
    if (this.table === collections) {
      const row = this.state.collections.find((candidate) =>
        params.includes(candidate.id) && params.includes(candidate.userId)
      );
      return row ? [{ id: row.id }] : [];
    }
    const collectionId = params.find((param) =>
      typeof param === "string" && this.state.collections.some((row) => row.id === param)
    );
    const titleId = params.find((param) => typeof param === "string" && param !== collectionId);
    return collectionId && titleId && this.state.items.has(`${collectionId}:${titleId}`)
      ? [{ collectionId: String(collectionId) }]
      : [];
  }
}

class MutationInsertQuery implements PromiseLike<void> {
  private valuesInput: { collectionId: string; titleId: string } | null = null;

  constructor(private readonly state: MutationHarnessState) {}

  values(value: { collectionId: string; titleId: string }): this {
    this.valuesInput = value;
    return this;
  }

  onConflictDoNothing(): Promise<void> {
    return this.execute();
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<void> {
    if (this.valuesInput) {
      this.state.items.add(`${this.valuesInput.collectionId}:${this.valuesInput.titleId}`);
    }
  }
}

class MutationDeleteQuery implements PromiseLike<void> {
  private condition: { sql: string; params: unknown[] } | null = null;

  constructor(
    private readonly state: MutationHarnessState,
    private readonly table: unknown
  ) {}

  where(value: unknown): this {
    this.condition = renderCondition(this.state, value);
    return this;
  }

  async returning(): Promise<Array<{ id: string }>> {
    const params = this.condition?.params ?? [];
    const index = this.state.collections.findIndex((candidate) =>
      params.includes(candidate.id) && params.includes(candidate.userId)
    );
    if (this.table !== collections || index < 0) return [];
    const [deleted] = this.state.collections.splice(index, 1);
    return deleted ? [{ id: deleted.id }] : [];
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<void> {
    if (this.table !== collectionItems) return;
    const params = this.condition?.params ?? [];
    for (const key of [...this.state.items]) {
      const [collectionId, titleId] = key.split(":");
      if (params.includes(collectionId) && params.includes(titleId)) this.state.items.delete(key);
    }
  }
}

class MutationUpdateQuery {
  private name = "";
  private condition: { sql: string; params: unknown[] } | null = null;

  constructor(private readonly state: MutationHarnessState) {}

  set(value: { name: string }): this {
    this.name = value.name;
    return this;
  }

  where(value: unknown): this {
    this.condition = renderCondition(this.state, value);
    return this;
  }

  async returning(): Promise<Array<{ id: string }>> {
    const params = this.condition?.params ?? [];
    const row = this.state.collections.find((candidate) =>
      params.includes(candidate.id) && params.includes(candidate.userId)
    );
    if (!row) return [];
    row.name = this.name;
    return [{ id: row.id }];
  }
}

function mutationHarness() {
  const state: MutationHarnessState = {
    collections: [{ ...exact }],
    items: new Set(),
    locks: [],
    conditions: [],
  };
  const database: Record<string, unknown> = {};
  database.select = () => new MutationSelectQuery(state);
  database.insert = () => new MutationInsertQuery(state);
  database.update = () => new MutationUpdateQuery(state);
  database.delete = (table: unknown) => new MutationDeleteQuery(state, table);
  database.transaction = async (callback: (tx: unknown) => Promise<unknown>) => callback(database);
  return {
    state,
    repository: new DrizzleMeCollectionRepository(database as unknown as MeCollectionDatabase),
  };
}

describe("DrizzleMeCollectionRepository owned transactional mutations", () => {
  it("sets item membership idempotently while locking the owned collection row", async () => {
    const { repository, state } = mutationHarness();

    await expect(repository.setItem("owner-1", CLIENT_ID, "title-1", true))
      .resolves.toEqual({ status: "updated", included: true });
    await repository.setItem("owner-1", CLIENT_ID, "title-1", true);
    expect([...state.items]).toEqual([`${CLIENT_ID}:title-1`]);

    await repository.setItem("owner-1", CLIENT_ID, "title-1", false);
    await repository.setItem("owner-1", CLIENT_ID, "title-1", false);
    expect([...state.items]).toEqual([]);
    expect(state.locks).toEqual(["update", "update", "update", "update"]);
  });

  it("rejects foreign item mutations before changing membership", async () => {
    const { repository, state } = mutationHarness();
    state.items.add(`${CLIENT_ID}:title-1`);

    await expect(repository.setItem("other-owner", CLIENT_ID, "title-1", false))
      .resolves.toEqual({ status: "not_found" });
    await expect(repository.toggleItem("other-owner", CLIENT_ID, "title-1"))
      .resolves.toEqual({ status: "not_found" });
    expect([...state.items]).toEqual([`${CLIENT_ID}:title-1`]);
  });

  it("serializes legacy toggles so two sequential toggles restore absence", async () => {
    const { repository, state } = mutationHarness();

    await expect(repository.toggleItem("owner-1", CLIENT_ID, "title-1"))
      .resolves.toEqual({ status: "updated", included: true });
    await expect(repository.toggleItem("owner-1", CLIENT_ID, "title-1"))
      .resolves.toEqual({ status: "updated", included: false });
    expect([...state.items]).toEqual([]);
    expect(state.locks).toEqual(["update", "update"]);
  });

  it("scopes rename and delete predicates to both collection ID and owner", async () => {
    const { repository, state } = mutationHarness();

    await expect(repository.renameOwned("other-owner", CLIENT_ID, "침입"))
      .resolves.toEqual({ status: "not_found" });
    await expect(repository.deleteOwned("other-owner", CLIENT_ID))
      .resolves.toEqual({ status: "not_found" });
    expect(state.collections[0]?.name).toBe("컬렉션");

    await expect(repository.renameOwned("owner-1", CLIENT_ID, "변경"))
      .resolves.toEqual({ status: "updated" });
    await expect(repository.deleteOwned("owner-1", CLIENT_ID))
      .resolves.toEqual({ status: "updated" });
    expect(state.collections).toEqual([]);
    expect(state.conditions.every(({ params }) => params.includes(CLIENT_ID))).toBe(true);
    expect(state.conditions.some(({ params }) => params.includes("other-owner"))).toBe(true);
    expect(state.conditions.some(({ params }) => params.includes("owner-1"))).toBe(true);
  });
});

interface MergeHarnessState {
  collections: CollectionRow[];
  items: Set<string>;
  advisoryQueries: string[];
}

class MergeSelectQuery implements PromiseLike<CollectionRow[]> {
  private table: unknown;
  private params: unknown[] = [];

  constructor(private readonly state: MergeHarnessState) {}

  from(table: unknown): this {
    this.table = table;
    return this;
  }

  where(value: unknown): this {
    this.params = new PgDialect().sqlToQuery(value as never).params;
    return this;
  }

  limit(): this {
    return this;
  }

  then<TResult1 = CollectionRow[], TResult2 = never>(
    onfulfilled?: ((value: CollectionRow[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<CollectionRow[]> {
    if (this.table !== collections) return [];
    return this.state.collections.filter((row) => {
      if (!this.params.includes(row.userId)) return false;
      const requestedIds = this.params.filter((param) => param === row.id);
      if (this.params.some((param) => typeof param === "string" && param === row.id)) {
        if (requestedIds.length === 0) return false;
      }
      if (this.params.length >= 4) {
        return this.params.includes(row.name) && this.params.includes(row.emoji);
      }
      return this.params.length === 1 || this.params.includes(row.id);
    }).map((row) => ({ ...row }));
  }
}

class MergeInsertQuery implements PromiseLike<void> {
  private input: CollectionRow | Array<{ collectionId: string; titleId: string }> | null = null;
  private executed = false;
  private createdId: string | null = null;

  constructor(
    private readonly state: MergeHarnessState,
    private readonly table: unknown
  ) {}

  values(value: CollectionRow | Array<{ collectionId: string; titleId: string }>): this {
    this.input = value;
    return this;
  }

  onConflictDoNothing(): this {
    return this;
  }

  async returning(): Promise<Array<{ id: string }>> {
    await this.execute();
    return this.createdId ? [{ id: this.createdId }] : [];
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<void> {
    if (this.executed || !this.input) return;
    this.executed = true;
    if (this.table === collections && !Array.isArray(this.input)) {
      if (!this.state.collections.some((row) => row.id === this.input?.id)) {
        this.state.collections.push({ ...this.input });
        this.createdId = this.input.id;
      }
      return;
    }
    if (this.table === collectionItems && Array.isArray(this.input)) {
      for (const item of this.input) {
        this.state.items.add(`${item.collectionId}:${item.titleId}`);
      }
    }
  }
}

function mergeHarness(initial: CollectionRow[] = []) {
  const state: MergeHarnessState = {
    collections: initial.map((row) => ({ ...row })),
    items: new Set(),
    advisoryQueries: [],
  };
  let transactionTail = Promise.resolve();
  const database: Record<string, unknown> = {};
  database.select = () => new MergeSelectQuery(state);
  database.insert = (table: unknown) => new MergeInsertQuery(state, table);
  database.execute = async (query: unknown) => {
    state.advisoryQueries.push(new PgDialect().sqlToQuery(query as never).sql);
  };
  database.transaction = <T>(callback: (tx: unknown) => Promise<T>) => {
    const result = transactionTail.then(() => callback(database));
    transactionTail = result.then(() => undefined, () => undefined);
    return result;
  };
  return {
    state,
    repository: new DrizzleMeCollectionRepository(database as unknown as MeCollectionDatabase),
  };
}

describe("DrizzleMeCollectionRepository locked login merge", () => {
  it("preserves two canonical UUIDs even when their names are identical", async () => {
    const secondId = "550e8400-e29b-41d4-a716-446655440001";
    const { repository, state } = mergeHarness();

    await expect(repository.mergeOwned("owner-1", [
      { clientId: CLIENT_ID, name: "같은 이름", emoji: "📚", titleIds: [] },
      { clientId: secondId, name: "같은 이름", emoji: "📚", titleIds: [] },
    ])).resolves.toEqual({ [CLIENT_ID]: CLIENT_ID, [secondId]: secondId });

    expect(state.collections.map(({ id }) => id)).toEqual([CLIENT_ID, secondId]);
    expect(state.advisoryQueries[0]).toContain("pg_advisory_xact_lock");
  });

  it("serializes concurrent same-client merges onto one owned identity", async () => {
    const { repository, state } = mergeHarness();

    const [first, second] = await Promise.all([
      repository.mergeOwned("owner-1", [
        { clientId: CLIENT_ID, name: "첫 이름", emoji: "📚", titleIds: [] },
      ]),
      repository.mergeOwned("owner-1", [
        { clientId: CLIENT_ID, name: "둘째 이름", emoji: "⭐", titleIds: [] },
      ]),
    ]);

    expect(first).toEqual({ [CLIENT_ID]: CLIENT_ID });
    expect(second).toEqual({ [CLIENT_ID]: CLIENT_ID });
    expect(state.collections.filter((row) => row.userId === "owner-1"))
      .toHaveLength(1);
    expect(state.advisoryQueries).toHaveLength(2);
  });

  it("remaps a foreign global collision without exposing or changing its row", async () => {
    const foreign = { ...exact, userId: "foreign-owner", name: "외부 비공개" };
    const { repository, state } = mergeHarness([foreign]);

    const result = await repository.mergeOwned("owner-1", [
      { clientId: CLIENT_ID, name: "내 컬렉션", emoji: "📚", titleIds: ["title-1"] },
    ]);
    const targetId = result[CLIENT_ID];

    expect(targetId).toBeTruthy();
    expect(targetId).not.toBe(CLIENT_ID);
    expect(state.collections.find((row) => row.id === CLIENT_ID)).toEqual(foreign);
    expect(state.collections.some((row) => row.id === targetId && row.userId === "owner-1"))
      .toBe(true);
    expect(state.items.has(`${targetId}:title-1`)).toBe(true);
  });

  it("coalesces concurrent legacy name-only merges under the per-user lock", async () => {
    const { repository, state } = mergeHarness();

    await Promise.all([
      repository.mergeOwned("owner-1", [
        { name: "구버전 이름", emoji: "📚", titleIds: [] },
      ]),
      repository.mergeOwned("owner-1", [
        { name: "구버전 이름", emoji: "📚", titleIds: [] },
      ]),
    ]);

    expect(state.collections.filter((row) => row.userId === "owner-1"))
      .toHaveLength(1);
  });
});
