import { decodeStudioWorkspaceArrangement } from "./studio-workspace-arrangement";
import type { StudioAsyncKeyValueStore } from "./studio-local-database";

export function createStudioWorkspaceArrangementDevice(store: StudioAsyncKeyValueStore) {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    save(raw: string): Promise<boolean> {
      if (!decodeStudioWorkspaceArrangement(raw)) return Promise.resolve(false);
      const operation = tail.catch(() => undefined).then(async () => {
        try {
          await store.set("snapshot", raw);
          return await store.get("snapshot") === raw;
        } catch { return false; }
      });
      tail = operation;
      return operation;
    },
    async load(): Promise<string | null> {
      await tail.catch(() => undefined);
      try {
        const raw = await store.get("snapshot");
        return raw && decodeStudioWorkspaceArrangement(raw) ? raw : null;
      } catch { return null; }
    },
  };
}

let shared: Promise<ReturnType<typeof createStudioWorkspaceArrangementDevice>> | null = null;
export function acquireStudioWorkspaceArrangementDevice() {
  shared ??= import("./studio-local-database-runtime")
    .then(({ acquireStudioLocalDatabase }) => acquireStudioLocalDatabase())
    .then(database => createStudioWorkspaceArrangementDevice(
      database.asAsyncKeyValueStore("studio-workspace-arrangement-v1"),
    ))
    .catch(error => { shared = null; throw error; });
  return shared;
}
