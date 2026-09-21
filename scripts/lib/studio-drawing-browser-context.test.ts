import { afterEach, expect, it, vi } from "vitest";

import { openStudioDrawingContext } from "./studio-drawing-browser-context.mjs";

const files = vi.hoisted(() => ({ mkdtemp: vi.fn(async () => "/tmp/toon-drawing-opfs-test"), rm: vi.fn(async () => undefined) }));
vi.mock("node:fs/promises", () => files);
afterEach(() => { vi.clearAllMocks(); });
it("keeps Chromium/Firefox contexts unchanged without accessing a persistent user profile", async () => {
  const context = { close: vi.fn(async () => undefined) };
  const browser = { newContext: vi.fn(async () => context) };
  const session = await openStudioDrawingContext({}, browser, "chromium", { viewport: { width: 320, height: 640 } });
  expect(session.context).toBe(context); expect(session.mode).toBe("ephemeral");
  expect(files.mkdtemp).not.toHaveBeenCalled(); await session.close(); expect(context.close).toHaveBeenCalledOnce();
});
it("reopens the same isolated WebKit profile and removes only its own generated directory", async () => {
  const first = { close: vi.fn(async () => undefined) }; const second = { close: vi.fn(async () => undefined) };
  const launcher = { launchPersistentContext: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) };
  const session = await openStudioDrawingContext(launcher, {}, "webkit", { hasTouch: true });
  expect(await session.reopen!()).toBe(second); expect(first.close).toHaveBeenCalledOnce();
  expect(launcher.launchPersistentContext.mock.calls.map((call) => call[0])).toEqual(["/tmp/toon-drawing-opfs-test", "/tmp/toon-drawing-opfs-test"]);
  expect(files.rm).not.toHaveBeenCalled(); await session.close(); expect(second.close).toHaveBeenCalledOnce();
  expect(files.rm).toHaveBeenCalledExactlyOnceWith("/tmp/toon-drawing-opfs-test", { recursive: true, force: true });
});
it("does not swallow launch failures or turn an unavailable context into a passing fixture", async () => {
  const launcher = { launchPersistentContext: vi.fn().mockRejectedValue(new Error("failed launch")) };
  await expect(openStudioDrawingContext(launcher, {}, "webkit", {})).rejects.toThrow("failed launch");
  expect(files.rm).toHaveBeenCalledOnce();
});
