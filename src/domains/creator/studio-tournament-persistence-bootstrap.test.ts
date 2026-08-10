import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createStudioTournamentPersistenceBootstrap,
  type StudioTournamentPersistenceModule,
} from "./studio-tournament-persistence-bootstrap";

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(cause: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("Studio tournament persistence bootstrap", () => {
  it("installs SQLite before constructing and hydrating the shared runtime", async () => {
    const order: string[] = [];
    const persistence: StudioTournamentPersistenceModule = {
      installStudioTournamentSqlitePersistence: () => order.push("install"),
    };
    const bootstrap = createStudioTournamentPersistenceBootstrap({
      loadPersistence: async () => {
        order.push("load");
        return persistence;
      },
      getRuntime: () => {
        order.push("get-runtime");
        return {
          hydrate: async () => {
            order.push("hydrate");
            return true;
          },
        } as never;
      },
      warn: vi.fn(),
    });

    await expect(bootstrap.boot()).resolves.toBe(true);
    expect(order).toEqual(["load", "install", "get-runtime", "hydrate"]);
  });

  it("does not construct a runtime while the dynamic persistence module is loading", async () => {
    const moduleLoad = deferred<StudioTournamentPersistenceModule>();
    const getRuntime = vi.fn(() => ({ hydrate: vi.fn(async () => true) }) as never);
    const bootstrap = createStudioTournamentPersistenceBootstrap({
      loadPersistence: () => moduleLoad.promise,
      getRuntime,
      warn: vi.fn(),
    });

    const boot = bootstrap.boot();
    expect(getRuntime).not.toHaveBeenCalled();
    moduleLoad.resolve({ installStudioTournamentSqlitePersistence: vi.fn() });
    await expect(boot).resolves.toBe(true);
    expect(getRuntime).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent boot calls and hydrates once", async () => {
    const hydrate = vi.fn(async () => true);
    const loadPersistence = vi.fn(async () => ({
      installStudioTournamentSqlitePersistence: vi.fn(),
    }));
    const bootstrap = createStudioTournamentPersistenceBootstrap({
      loadPersistence,
      getRuntime: () => ({ hydrate } as never),
      warn: vi.fn(),
    });

    const first = bootstrap.boot();
    const second = bootstrap.boot();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(loadPersistence).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("contains a failed lazy load and allows a later retry", async () => {
    const warn = vi.fn();
    const loadPersistence = vi
      .fn<() => Promise<StudioTournamentPersistenceModule>>()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce({ installStudioTournamentSqlitePersistence: vi.fn() });
    const bootstrap = createStudioTournamentPersistenceBootstrap({
      loadPersistence,
      getRuntime: () => ({ hydrate: vi.fn(async () => false) } as never),
      warn,
    });

    await expect(bootstrap.boot()).resolves.toBe(false);
    await Promise.resolve();
    await expect(bootstrap.boot()).resolves.toBe(true);
    expect(loadPersistence).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("keeps SQLite persistence outside the StudioPage static graph", () => {
    const page = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
    const bootstrap = readFileSync(
      new URL("./studio-tournament-persistence-bootstrap.ts", import.meta.url),
      "utf8",
    );

    expect(page).not.toMatch(
      /^import .*studio-tournament-sqlite-persistence/mu,
    );
    expect(page).toContain('from "./studio-tournament-persistence-bootstrap"');
    expect(bootstrap).toContain(
      'import("./studio-tournament-sqlite-persistence")',
    );
    expect(bootstrap).not.toMatch(
      /^import .*studio-tournament-sqlite-persistence/mu,
    );
    expect(page).not.toMatch(
      /from\s+["']\.\/studio-brush-library-sqlite-repository["']/u,
    );
    expect(page).toMatch(
      /import\(\s*["']\.\/studio-brush-library-sqlite-repository["']\s*\)/u,
    );
  });

  it("keeps search indexing out of the active-tool and pen-down startup paths", () => {
    const page = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

    expect(page).toContain(
      'from "./studio-active-tool-command"',
    );
    expect(page).not.toContain(
      'from "./studio-current-tool-help"',
    );
    expect(page).toContain("peekBootedStudioTournamentRuntime()");
    expect(page).not.toContain("getStudioTournamentRuntime()");
    expect(page).toContain(
      'strokeRouteTournamentGate?.admits("living-ink") ?? true',
    );
  });
});
