import { beforeEach, describe, expect, it, vi } from "vitest";

import { PostgresStudio3dGenerationProviderIdentityStore } from "./studio-3d-generation-provider-identity-store";

const driver = vi.hoisted(() => ({ create: vi.fn(), query: vi.fn(), end: vi.fn(), on: vi.fn() }));
vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) { driver.create(options); }
    query = driver.query;
    end = driver.end;
    on = driver.on;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  driver.query.mockReset().mockResolvedValue({ rows: [] });
  driver.end.mockReset().mockResolvedValue(undefined);
});

const url = "postgresql://test:test@127.0.0.1:9/identity_test";

describe("traceable durable provider identity storage", () => {
  it("boots without connecting, importing an undeclared driver or executing DDL", async () => {
    const store = new PostgresStudio3dGenerationProviderIdentityStore(url);
    await Promise.resolve();
    expect(driver.create).toHaveBeenCalledWith(expect.objectContaining({ max: 2, allowExitOnIdle: true, connectionTimeoutMillis: 15_000 }));
    expect(driver.query).not.toHaveBeenCalled();
    expect(driver.on).toHaveBeenCalledWith("error", expect.any(Function));
    await store.close();
    expect(driver.query).not.toHaveBeenCalled();
    expect(driver.end).toHaveBeenCalledTimes(1);
  });
  it("retains full TLS verification and rejects invalid database URLs synchronously", () => {
    new PostgresStudio3dGenerationProviderIdentityStore(`${url}?sslmode=require`);
    expect(driver.create.mock.calls[0][0].connectionString).toContain("sslmode=verify-full");
    expect(() => new PostgresStudio3dGenerationProviderIdentityStore(" ")).toThrow("DATABASE_URL");
    expect(() => new PostgresStudio3dGenerationProviderIdentityStore("https://example.invalid")).toThrow("postgres");
    expect(() => new PostgresStudio3dGenerationProviderIdentityStore("postgres://test:test@db.neon.tech/test?sslmode=disable")).toThrow("TLS");
  });
  it("initializes once and binds encrypted identities and job IDs as parameters", async () => {
    const store = new PostgresStudio3dGenerationProviderIdentityStore(url);
    const id = "job'; DROP TABLE example;--";
    await store.put(id, "sealed-identity", 123);
    driver.query.mockResolvedValueOnce({ rows: [{ sealed_identity: "sealed-identity" }] });
    await expect(store.get(id)).resolves.toBe("sealed-identity");
    await store.delete(id);
    expect(driver.query.mock.calls.filter(([sql]) => sql.includes("CREATE TABLE"))).toHaveLength(1);
    expect(driver.query.mock.calls[1][1]).toEqual([id, "sealed-identity", 123]);
    expect(driver.query.mock.calls[2][1]).toEqual([id]);
    expect(driver.query.mock.calls[3][1]).toEqual([id]);
    expect(driver.query.mock.calls.every(([sql]) => !sql.includes(id))).toBe(true);
    await store.close();
  });
  it("shares first-use initialization between concurrent reads", async () => {
    let resolve!: (value: { rows: never[] }) => void;
    driver.query.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const store = new PostgresStudio3dGenerationProviderIdentityStore(url);
    const first = store.get("first");
    const second = store.get("second");
    expect(driver.query).toHaveBeenCalledTimes(1);
    resolve({ rows: [] });
    await Promise.all([first, second]);
    expect(driver.query).toHaveBeenCalledTimes(3);
    await store.close();
  });
  it("propagates database failures and retries failed initialization without memory fallback", async () => {
    const failure = new Error("database unavailable");
    driver.query.mockRejectedValueOnce(failure);
    const store = new PostgresStudio3dGenerationProviderIdentityStore(url);
    await expect(store.get("job")).rejects.toBe(failure);
    await expect(store.get("job")).resolves.toBeUndefined();
    expect(driver.query.mock.calls.filter(([sql]) => sql.includes("CREATE TABLE"))).toHaveLength(2);
    driver.query.mockRejectedValueOnce(failure);
    await expect(store.put("job", "sealed", 1)).rejects.toBe(failure);
    await store.close();
  });
  it("rejects invalid records before querying and prevents reads after close", async () => {
    const store = new PostgresStudio3dGenerationProviderIdentityStore(url);
    await expect(store.put("", "sealed", 1)).rejects.toThrow("invalid");
    await expect(store.put("job", " ", 1)).rejects.toThrow("invalid");
    expect(driver.query).not.toHaveBeenCalled();
    await Promise.all([store.close(), store.close()]);
    await expect(store.get("job")).rejects.toThrow("closed");
    expect(driver.end).toHaveBeenCalledTimes(1);
    expect(driver.query).not.toHaveBeenCalled();
  });
});
