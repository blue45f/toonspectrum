import { describe, expect, it, vi } from "vitest";

import {
  CommandRegistry,
  createEditorClientRuntime,
} from "../index";

import type { CommandContext } from "../index";

interface TestSnapshot {
  readonly tool: "select" | "draw";
}

const ACTION_SERVICE_KEY = "test.tool.action";

function contextFor(action: () => void): CommandContext {
  return {
    workspace: "comic",
    services: new Map([[ACTION_SERVICE_KEY, action]]),
  };
}

describe("createEditorClientRuntime", () => {
  it("keeps one client while replacing committed snapshots and command ports", async () => {
    const firstAction = vi.fn();
    const secondAction = vi.fn();
    const thirdAction = vi.fn();
    const registry = new CommandRegistry();
    registry.register({
      id: "tool.activate",
      title: "Activate tool",
      category: "tool",
      run: (context) => {
        const action = context.services.get(ACTION_SERVICE_KEY);
        if (typeof action !== "function") {
          throw new Error("tool action unavailable");
        }
        action();
      },
    });

    const initialSnapshot: TestSnapshot = Object.freeze({ tool: "select" });
    let requestSequence = 0;
    const runtime = createEditorClientRuntime({
      registry,
      initialSnapshot,
      initialContext: () => contextFor(firstAction),
      requestId: () => `runtime-${(requestSequence += 1)}`,
    });
    const client = runtime.client;
    const listener = vi.fn();
    client.subscribe(listener);

    const drawSnapshot: TestSnapshot = Object.freeze({ tool: "draw" });
    expect(runtime.update({
      snapshot: drawSnapshot,
      context: () => contextFor(secondAction),
    })).toBe(true);
    expect(runtime.client).toBe(client);
    expect(client.getSnapshot()).toBe(drawSnapshot);
    expect(listener).toHaveBeenCalledTimes(1);

    const firstReceipt = await client.dispatch({
      id: "tool.activate",
      source: "test",
    });
    expect(firstAction).not.toHaveBeenCalled();
    expect(secondAction).toHaveBeenCalledOnce();
    expect(firstReceipt.acceptedRevision).toBe(1);

    // Context replacement is independent from snapshot publication. This lets
    // a host refresh closures without waking UI subscribers.
    expect(runtime.update({
      snapshot: drawSnapshot,
      context: () => contextFor(thirdAction),
    })).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    const secondReceipt = await client.dispatch({
      id: "tool.activate",
      source: "test",
    });
    expect(secondAction).toHaveBeenCalledOnce();
    expect(thirdAction).toHaveBeenCalledOnce();
    expect(secondReceipt.acceptedRevision).toBe(2);
  });
});
