import { StudioOfflineBranchAutomergeEngine } from "./studio-offline-branch-automerge";

import type {
  StudioOfflineBranchWorkerCommand,
  StudioOfflineBranchWorkerResponse,
  StudioOfflineBranchWorkerResult,
} from "./studio-offline-branch-worker-protocol";

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<StudioOfflineBranchWorkerCommand>) => void,
  ): void;
  postMessage(message: StudioOfflineBranchWorkerResponse, transfer?: Transferable[]): void;
  close(): void;
}

const scope = globalThis as unknown as WorkerScope;
let engine: StudioOfflineBranchAutomergeEngine | null = null;

function requireEngine(): StudioOfflineBranchAutomergeEngine {
  if (!engine) throw new Error("offline branch worker is not open");
  return engine;
}

function transferables(result: StudioOfflineBranchWorkerResult): Transferable[] {
  return result.kind === "saved" ? [result.bytes.buffer] : [];
}

function execute(command: StudioOfflineBranchWorkerCommand): StudioOfflineBranchWorkerResult {
  switch (command.type) {
    case "open": {
      engine?.close();
      engine = command.bytes
        ? StudioOfflineBranchAutomergeEngine.load(command.bytes, command.input)
        : StudioOfflineBranchAutomergeEngine.create(command.input);
      return { kind: "opened", snapshot: engine.snapshot() };
    }
    case "append": {
      const branch = requireEngine();
      const count = branch.append(command.operations, command.updatedAt);
      return { kind: "appended", count, snapshot: branch.snapshot() };
    }
    case "receipts": {
      const branch = requireEngine();
      branch.recordReceipts(command.receipts, command.updatedAt);
      return { kind: "updated", snapshot: branch.snapshot() };
    }
    case "conflicts": {
      const branch = requireEngine();
      branch.recordConflicts(command.conflicts, command.updatedAt);
      return { kind: "updated", snapshot: branch.snapshot() };
    }
    case "snapshot":
      return { kind: "snapshot", snapshot: requireEngine().snapshot() };
    case "save":
      return { kind: "saved", bytes: requireEngine().save() };
    case "import-peer": {
      const branch = requireEngine();
      const imported = branch.importDocument(command.bytes, command.updatedAt);
      return {
        kind: "imported",
        ...imported,
        snapshot: branch.snapshot(),
      };
    }
    case "close":
      engine?.close();
      engine = null;
      return { kind: "closed" };
  }
}

scope.addEventListener("message", (event) => {
  const command = event.data;
  try {
    const result = execute(command);
    const response: StudioOfflineBranchWorkerResponse = {
      requestId: command.requestId,
      ok: true,
      result,
    };
    scope.postMessage(response, transferables(result));
    if (command.type === "close") scope.close();
  } catch (cause) {
    scope.postMessage({
      requestId: command.requestId,
      ok: false,
      error: cause instanceof Error ? cause.message : "offline branch worker failed",
    });
  }
});
