import { afterEach, expect, it, vi } from "vitest";
import { getStudioSessionResources } from "./studio-work-session-client";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/api", () => ({ api: { get } }));
const digest = "a".repeat(64);
const resource = () => ({ workId: "work", sessionId: "session", inputDigest: digest,
  sourceStatus: "mapped", expiresAt: new Date(Date.now() + 15000).toISOString(), pages: [], nextPageOffset: null, assets: [] });
afterEach(() => get.mockReset());
it("uses a no-retry metadata read and accepts only the selected work/session/digest", async () => {
  const value = resource(); get.mockResolvedValue(value); const signal = new AbortController().signal;
  expect(await getStudioSessionResources("work", "session", digest, 0, signal)).toEqual(value);
  expect(get).toHaveBeenCalledExactlyOnceWith("/creator/works/work/work-sessions/session/resources?offset=0", { signal, retry: 0 });
});
it.each(["workId", "sessionId", "inputDigest"])("rejects mismatched %s", async (key) => {
  get.mockResolvedValue({ ...resource(), [key]: key === "inputDigest" ? "b".repeat(64) : "another" });
  await expect(getStudioSessionResources("work", "session", digest, 0, new AbortController().signal)).rejects.toThrow();
});
it.each([-1, 0, 60000])("rejects expired/unreasonably long metadata lease %i", async (offset) => {
  get.mockResolvedValue({ ...resource(), expiresAt: new Date(Date.now() + offset).toISOString() });
  await expect(getStudioSessionResources("work", "session", digest, 0, new AbortController().signal)).rejects.toThrow();
});
it.each([-1, 0.5, 100000, NaN])("does not send an invalid pagination request %s", async (offset) => {
  await expect(getStudioSessionResources("work", "session", digest, offset, new AbortController().signal)).rejects.toThrow();
  expect(get).not.toHaveBeenCalled();
});
it("rejects metadata cursors that would loop backwards", async () => {
  get.mockResolvedValue({ ...resource(), nextPageOffset: 0 });
  await expect(getStudioSessionResources("work", "session", digest, 25, new AbortController().signal)).rejects.toThrow();
});
