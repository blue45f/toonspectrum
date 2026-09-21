import { expect, it, vi } from "vitest";
import { acquireStudioDatabaseWorkerHandoff, STUDIO_DATABASE_HANDOFF_DELAYS_MS } from "./studio-local-database-worker-handoff";
import { STUDIO_LOCAL_DATABASE_WORKER_LOCK_NAME, type StudioLocalDatabaseWorkerLockManagerLike } from "./studio-local-database-worker-lock";

function manager(lockedAttempts: number) {
  let calls = 0;
  const request = vi.fn(async (_name: string, _options: unknown, callback: (lock: unknown) => Promise<void>) => callback(++calls <= lockedAttempts ? null : {}));
  return { request, lock: { request } as unknown as StudioLocalDatabaseWorkerLockManagerLike };
}
it("acquires immediately without extra delay and holds the exclusive lease until release", async () => {
  const { lock, request } = manager(0); const delay = vi.fn(async (_milliseconds: number) => undefined);
  const lease = await acquireStudioDatabaseWorkerHandoff(lock, delay);
  expect(delay).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith(STUDIO_LOCAL_DATABASE_WORKER_LOCK_NAME, { mode: "exclusive", ifAvailable: true }, expect.any(Function));
  await lease.release(); await lease.release(); expect(request).toHaveBeenCalledOnce();
});
it("tolerates a departing page without stealing another page's lease", async () => {
  const { lock, request } = manager(2); const delay = vi.fn(async (_milliseconds: number) => undefined);
  const lease = await acquireStudioDatabaseWorkerHandoff(lock, delay);
  expect(delay.mock.calls.map((args) => args[0])).toEqual([50, 100]);
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls.every((args) => JSON.stringify(args[1]) === JSON.stringify({ mode: "exclusive", ifAvailable: true }))).toBe(true);
  await lease.release();
});

it("stops after 750ms when a live tab keeps ownership", async () => {
  const { lock, request } = manager(Infinity); const waits: number[] = [];
  await expect(acquireStudioDatabaseWorkerHandoff(lock, async (ms) => { waits.push(ms); })).rejects.toMatchObject({ code: "lock-unavailable" });
  expect(waits).toEqual([...STUDIO_DATABASE_HANDOFF_DELAYS_MS]);
  expect(waits.reduce((sum, value) => sum + value, 0)).toBe(750);
  expect(request).toHaveBeenCalledTimes(5);
});
it("does not retry unsupported environments or lock-manager failures", async () => {
  const delay = vi.fn(async (_milliseconds: number) => undefined);
  await expect(acquireStudioDatabaseWorkerHandoff(null, delay)).rejects.toMatchObject({ code: "web-locks-unavailable" });
  const failed = { request: vi.fn(() => Promise.reject(new Error("permission denied"))) } as unknown as StudioLocalDatabaseWorkerLockManagerLike;
  await expect(acquireStudioDatabaseWorkerHandoff(failed, delay)).rejects.toMatchObject({ code: "lock-request-failed" });
  expect(delay).not.toHaveBeenCalled();
});
