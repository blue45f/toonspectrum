import { describe, expect, it, vi } from "vitest";
import { HiringStore } from "./hiring.store";
import type { Pool } from "pg";

describe("hiring transaction readiness and bounded waits", () => {
  it.each(["42883", "42501", "42P01"])("fails closed on missing function, ACL or schema (%s) before invoking work", async (code) => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "SELECT creator_hiring_require_ready()") throw Object.assign(new Error("private SQL diagnostics"), { code });
      return { rows: [] };
    });
    const release = vi.fn(), work = vi.fn();
    const store = new HiringStore({ connect: async () => ({ query, release }) } as unknown as Pool);
    await expect(store.tx(work)).rejects.toMatchObject({ status: 503 });
    expect(work).not.toHaveBeenCalled(); expect(query).toHaveBeenLastCalledWith("ROLLBACK"); expect(release).toHaveBeenCalledOnce();
  });
  it("sets transaction-local statement and lock timeouts before work and rolls back timeout errors without retry", async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [] })), release = vi.fn();
    const store = new HiringStore({ connect: async () => ({ query, release }) } as unknown as Pool);
    const work = vi.fn(async () => { throw Object.assign(new Error("private SQL"), { code: "55P03" }); });
    await expect(store.tx(work)).rejects.toMatchObject({ status: 503 });
    expect(query.mock.calls).toEqual([["BEGIN"], ["SET LOCAL statement_timeout = '10s'; SET LOCAL lock_timeout = '3s'"], ["SELECT creator_hiring_require_ready()"], ["ROLLBACK"]]);
    expect(work).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
  });
});
