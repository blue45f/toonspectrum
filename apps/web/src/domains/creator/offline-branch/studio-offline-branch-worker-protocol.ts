import type { CreateStudioOfflineBranchInput } from "./studio-offline-branch-automerge";
import type {
  StudioOfflineBranchConflict,
  StudioOfflineBranchOperation,
  StudioOfflineBranchReceipt,
  StudioOfflineBranchSnapshot,
} from "./studio-offline-branch-contract";

export type StudioOfflineBranchWorkerRequest =
  | {
      readonly requestId: number;
      readonly type: "open";
      readonly input: CreateStudioOfflineBranchInput;
      readonly bytes: Uint8Array | null;
    }
  | {
      readonly requestId: number;
      readonly type: "append";
      readonly operations: readonly StudioOfflineBranchOperation[];
      readonly updatedAt: number;
    }
  | {
      readonly requestId: number;
      readonly type: "receipts";
      readonly receipts: readonly StudioOfflineBranchReceipt[];
      readonly updatedAt: number;
    }
  | {
      readonly requestId: number;
      readonly type: "conflicts";
      readonly conflicts: readonly StudioOfflineBranchConflict[];
      readonly updatedAt: number;
    };

export type StudioOfflineBranchWorkerCommand =
  | StudioOfflineBranchWorkerRequest
  | {
      readonly requestId: number;
      readonly type: "snapshot" | "save" | "close";
    }
  | {
      readonly requestId: number;
      readonly type: "import-peer";
      readonly bytes: Uint8Array;
      readonly updatedAt: number;
    };

export type StudioOfflineBranchWorkerResult =
  | { readonly kind: "opened"; readonly snapshot: StudioOfflineBranchSnapshot }
  | {
      readonly kind: "appended";
      readonly count: number;
      readonly snapshot: StudioOfflineBranchSnapshot;
    }
  | { readonly kind: "updated"; readonly snapshot: StudioOfflineBranchSnapshot }
  | { readonly kind: "snapshot"; readonly snapshot: StudioOfflineBranchSnapshot }
  | { readonly kind: "saved"; readonly bytes: Uint8Array }
  | {
      readonly kind: "imported";
      readonly changed: boolean;
      readonly replyNeeded: boolean;
      readonly snapshot: StudioOfflineBranchSnapshot;
    }
  | { readonly kind: "closed" };

export type StudioOfflineBranchWorkerResponse =
  | {
      readonly requestId: number;
      readonly ok: true;
      readonly result: StudioOfflineBranchWorkerResult;
    }
  | {
      readonly requestId: number;
      readonly ok: false;
      readonly error: string;
    };

export interface StudioOfflineBranchWorkerLike {
  postMessage(message: StudioOfflineBranchWorkerCommand, transfer?: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<StudioOfflineBranchWorkerResponse>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<StudioOfflineBranchWorkerResponse>) => void,
  ): void;
  terminate(): void;
}
