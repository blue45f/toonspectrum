import {
  createEditorClient,
  createEditorSnapshotStore,
} from "./editor-client";

import type {
  EditorClient,
  EditorClientOptions,
} from "./editor-client";
import type { CommandContext } from "./types";

/**
 * Mutable owner behind one stable EditorClient identity.
 *
 * React surfaces and Worker bridges can replace their committed snapshot and
 * command context without recreating the client. This preserves subscriptions,
 * in-flight coalescing, request sequencing and the client's internal revision
 * counter across ordinary parent renders.
 */
export interface EditorClientRuntimeUpdate<S> {
  readonly snapshot: S;
  readonly context: () => CommandContext;
}

export type EditorClientRuntimeOptions<S> = Omit<
  EditorClientOptions<S>,
  "store" | "context"
> & {
  readonly initialSnapshot: S;
  readonly initialContext: () => CommandContext;
};

export interface EditorClientRuntime<S> {
  readonly client: EditorClient<S>;

  /**
   * Installs the latest command context before publishing a changed snapshot.
   * Returns true only when subscribers were notified.
   */
  update(next: EditorClientRuntimeUpdate<S>): boolean;
}

export function createEditorClientRuntime<S>(
  options: EditorClientRuntimeOptions<S>,
): EditorClientRuntime<S> {
  const {
    initialSnapshot,
    initialContext,
    ...clientOptions
  } = options;
  const store = createEditorSnapshotStore(initialSnapshot);
  let currentContext = initialContext;

  const client = createEditorClient({
    ...clientOptions,
    store,
    context: () => currentContext(),
  });

  return {
    client,
    update: (next) => {
      // Commands dispatched by a subscriber awakened below must already see
      // the latest host ports, even when snapshot publication is synchronous.
      currentContext = next.context;
      if (Object.is(store.getSnapshot(), next.snapshot)) return false;
      store.set(next.snapshot);
      return true;
    },
  };
}
