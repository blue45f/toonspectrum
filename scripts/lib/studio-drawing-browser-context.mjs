import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/** WebKit's ephemeral context can expose OPFS APIs while denying sync handles. */
export async function openStudioDrawingContext(launcher, browser, engine, options) {
  if (engine !== "webkit") {
    const context = await browser.newContext(options);
    return { context, mode: "ephemeral", close: () => context.close() };
  }
  // Never use the user's actual browser profile. Only this run's mkdtemp directory is removed.
  const profile = await mkdtemp(path.join(tmpdir(), "toon-drawing-opfs-"));
  let context;
  try { context = await launcher.launchPersistentContext(profile, { ...options, headless: true }); }
  catch (error) { await rm(profile, { recursive: true, force: true }); throw error; }
  return {
    context, mode: "isolated-persistent", profile,
    async reopen() {
      await context.close();
      context = await launcher.launchPersistentContext(profile, { ...options, headless: true });
      return context;
    },
    async close() {
      try { await context.close(); }
      finally { await rm(profile, { recursive: true, force: true }); }
    },
  };
}
