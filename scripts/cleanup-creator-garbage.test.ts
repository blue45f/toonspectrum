import { describe, expect, it } from "vitest";

import { isLocalDatabaseUrl, parseCleanupArguments } from "./cleanup-creator-garbage";

describe("creator QA cleanup safety", () => {
  it("defaults to neither deletion nor an implicit confirmation", () => {
    expect(() => parseCleanupArguments([])).toThrow(/--dry-run/);
    expect(() => parseCleanupArguments(["--confirm"])).toThrow(/--dry-run/);
  });

  it("keeps dry-run and explicit deletion mutually exclusive", () => {
    expect(parseCleanupArguments(["--dry-run"])).toEqual({ mode: "dry-run", allowRemote: false });
    expect(parseCleanupArguments(["--confirm-test-users"])).toEqual({ mode: "delete", allowRemote: false });
    expect(parseCleanupArguments(["--confirm-test-users", "--allow-remote"])).toEqual({
      mode: "delete",
      allowRemote: true,
    });
    expect(() => parseCleanupArguments(["--dry-run", "--confirm-test-users"])).toThrow(/함께/);
  });

  it("classifies local PostgreSQL URLs without exposing credentials", () => {
    expect(isLocalDatabaseUrl("postgresql://user:secret@localhost:55432/app")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://user:secret@127.0.0.1:5432/app")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://user:secret@[::1]:5432/app")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://user:secret@host.docker.internal:5432/app")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://user:secret@example.neon.tech/app?sslmode=require")).toBe(false);
  });

  it("rejects malformed and non-PostgreSQL URLs", () => {
    expect(() => isLocalDatabaseUrl("not-a-url")).toThrow(/DATABASE_URL/);
    expect(() => isLocalDatabaseUrl("https://localhost/database")).toThrow(/PostgreSQL/);
  });
});
