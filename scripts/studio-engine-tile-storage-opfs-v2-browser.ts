/**
 * Page-side orchestrator for the real Chromium Dedicated Worker OPFS v2 verifier.
 */

const WORKER_URL = new URL("./studio-engine-tile-storage-opfs-v2-worker-browser.ts",
  import.meta.url,
);
const COMMAND_TIMEOUT_MS = 30_000;
const CRASH_RECOVERY_TIMEOUT_MS = 60_000;

interface ErrorEvidence {
  readonly name: string;
  readonly code: string | null;
  readonly message: string;
  readonly causeName: string | null;
}

interface WorkerMessage {
  readonly type:
    | "result"
    | "lock-held"
    | "lock-released"
    | "wal-flushed"
    | "failure";
  readonly requestId: number;
  readonly result?: unknown;
  readonly error?: ErrorEvidence;
}

interface WorkerObservation {
  readonly label: string;
  readonly url: string;
  outboundCommands: number;
  inboundMessages: number;
  terminated: boolean;
  readonly errors: string[];
  readonly messageErrors: string[];
  readonly unsolicitedFailures: ErrorEvidence[];
}

interface SecurityViolationEvidence {
  readonly effectiveDirective: string;
  readonly blockedUri: string;
  readonly disposition: string;
}

type BrowserResult =
  | {
      readonly status: "ok";
      readonly backend: "opfs-sync-shards-v2";
      readonly main: unknown;
      readonly exclusiveLock: {
        readonly whileHeld: unknown;
        readonly afterClose: unknown;
      };
      readonly crashRecovery: unknown;
      readonly workers: readonly WorkerObservation[];
      readonly securityPolicyViolations: readonly SecurityViolationEvidence[];
      readonly pageErrors: readonly string[];
      readonly unhandledRejections: readonly string[];
    }
  | {
      readonly status: "unsupported";
      readonly reason:
        | "opfs-unavailable"
        | "sync-access-unavailable"
        | "not-dedicated-worker";
      readonly message: string;
      readonly workers: readonly WorkerObservation[];
      readonly securityPolicyViolations: readonly SecurityViolationEvidence[];
    }
  | {
      readonly status: "error";
      readonly message: string;
      readonly stack: string | null;
      readonly workers: readonly WorkerObservation[];
      readonly securityPolicyViolations: readonly SecurityViolationEvidence[];
      readonly pageErrors: readonly string[];
      readonly unhandledRejections: readonly string[];
    };

declare global {
  interface Window {
    __studioEngineTileStorageOpfsV2Result?: BrowserResult;
  }
}

class WorkerCommandError extends Error {
  public readonly evidence: ErrorEvidence;

  public constructor(evidence: ErrorEvidence) {
    super(evidence.message);
    this.name = evidence.name;
    this.evidence = evidence;
  }
}

const observations: WorkerObservation[] = [];
const securityPolicyViolations: SecurityViolationEvidence[] = [];
const pageErrors: string[] = [];
const unhandledRejections: string[] = [];
let nextRequestId = 1;

window.addEventListener("error", event => {
  pageErrors.push(event.message);
});
window.addEventListener("unhandledrejection", event => {
  unhandledRejections.push(
    event.reason instanceof Error
      ? event.reason.message
      : String(event.reason),
  );
});
window.addEventListener("securitypolicyviolation", event => {
  securityPolicyViolations.push({
    effectiveDirective: event.effectiveDirective,
    blockedUri: event.blockedURI,
    disposition: event.disposition,
  });
});

function createObservedWorker(label: string): {
  readonly worker: Worker;
  readonly observation: WorkerObservation;
} {
  const worker = new Worker(WORKER_URL, {
    type: "module",
    name: `studio-opfs-v2-${label}`,
  });
  const observation: WorkerObservation = {
    label,
    url: worker instanceof Worker ? WORKER_URL.href : "",
    outboundCommands: 0,
    inboundMessages: 0,
    terminated: false,
    errors: [],
    messageErrors: [],
    unsolicitedFailures: [],
  };
  observations.push(observation);
  worker.addEventListener("error", event => {
    observation.errors.push(event.message);
  });
  worker.addEventListener("messageerror", () => {
    observation.messageErrors.push("Worker message could not be cloned.");
  });
  worker.addEventListener("message", event => {
    observation.inboundMessages += 1;
    const message = event.data as WorkerMessage;
    if (message?.type === "failure" && message.requestId === -1) {
      observation.unsolicitedFailures.push(message.error ?? {
        name: "UnknownWorkerFailure",
        code: null,
        message: "Worker reported an unspecified failure.",
        causeName: null,
      });
    }
  });
  return { worker, observation };
}

function terminate(
  worker: Worker,
  observation: WorkerObservation,
): void {
  worker.terminate();
  observation.terminated = true;
}

function waitForWorkerMessage(
  worker: Worker,
  requestId: number,
  expectedType: WorkerMessage["type"],
  timeoutMs: number,
): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(
        `Timed out waiting for ${expectedType} on request ${requestId}.`,
      ));
    }, timeoutMs);
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (
        message?.requestId !== requestId
        || (
          message.type !== expectedType
          && message.type !== "failure"
        )
      ) {
        return;
      }
      cleanup();
      if (message.type === "failure") {
        reject(new WorkerCommandError(message.error ?? {
          name: "UnknownWorkerFailure",
          code: null,
          message: "Worker command failed without structured evidence.",
          causeName: null,
        }));
        return;
      }
      resolve(message);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
  });
}

async function command(
  worker: Worker,
  observation: WorkerObservation,
  input: Readonly<{
    type:
      | "run-main"
      | "hold-lock"
      | "release-lock"
      | "probe-lock"
      | "begin-crash-after-wal"
      | "recover-crash"
      | "cleanup";
    runId: string;
    documentId?: string;
  }>,
  expectedType: WorkerMessage["type"] = "result",
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<unknown> {
  const requestId = nextRequestId;
  nextRequestId += 1;
  const result = waitForWorkerMessage(
    worker,
    requestId,
    expectedType,
    timeoutMs,
  );
  observation.outboundCommands += 1;
  worker.postMessage({ ...input, requestId });
  return (await result).result;
}

function safeRunId(): string {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `opfs-v2-${Date.now()}-${random[0]}-${random[1]}`;
}

function unsupportedCode(error: unknown): BrowserResult["status"] | null {
  if (!(error instanceof WorkerCommandError)) return null;
  return (
    error.evidence.code === "opfs-unavailable"
    || error.evidence.code === "sync-access-unavailable"
    || error.evidence.code === "not-dedicated-worker"
  )
    ? "unsupported"
    : null;
}

async function run(): Promise<BrowserResult> {
  const runId = safeRunId();
  const main = createObservedWorker("main");
  let mainResult: unknown;
  try {
    mainResult = await command(main.worker, main.observation, {
      type: "run-main",
      runId,
    });
  } catch (error) {
    terminate(main.worker, main.observation);
    if (unsupportedCode(error) === "unsupported") {
      const evidence = (error as WorkerCommandError).evidence;
      return {
        status: "unsupported",
        reason: evidence.code as
          | "opfs-unavailable"
          | "sync-access-unavailable"
          | "not-dedicated-worker",
        message: evidence.message,
        workers: observations,
        securityPolicyViolations,
      };
    }
    throw error;
  }
  terminate(main.worker, main.observation);

  const lockDocumentId = `${runId}-lock`;
  const holder = createObservedWorker("lock-holder");
  const contender = createObservedWorker("lock-contender");
  await command(holder.worker, holder.observation, {
    type: "hold-lock",
    runId,
    documentId: lockDocumentId,
  }, "lock-held");
  const whileHeld = await command(contender.worker, contender.observation, {
    type: "probe-lock",
    runId,
    documentId: lockDocumentId,
  });
  await command(holder.worker, holder.observation, {
    type: "release-lock",
    runId,
    documentId: lockDocumentId,
  }, "lock-released");
  terminate(holder.worker, holder.observation);
  terminate(contender.worker, contender.observation);

  await new Promise(resolve => window.setTimeout(resolve, 50));
  const reacquirer = createObservedWorker("lock-reacquirer");
  const afterClose = await command(reacquirer.worker, reacquirer.observation, {
    type: "probe-lock",
    runId,
    documentId: lockDocumentId,
  });
  await command(reacquirer.worker, reacquirer.observation, {
    type: "cleanup",
    runId,
    documentId: lockDocumentId,
  });
  terminate(reacquirer.worker, reacquirer.observation);

  const crashDocumentId = `${runId}-worker-crash`;
  const crashWriter = createObservedWorker("crash-writer");
  await command(crashWriter.worker, crashWriter.observation, {
    type: "begin-crash-after-wal",
    runId,
    documentId: crashDocumentId,
  }, "wal-flushed");
  terminate(crashWriter.worker, crashWriter.observation);
  await new Promise(resolve => window.setTimeout(resolve, 100));
  const crashRecoveryWorker = createObservedWorker("crash-recovery");
  const crashRecovery = await command(
    crashRecoveryWorker.worker,
    crashRecoveryWorker.observation,
    {
      type: "recover-crash",
      runId,
      documentId: crashDocumentId,
    },
    "result",
    CRASH_RECOVERY_TIMEOUT_MS,
  );
  terminate(crashRecoveryWorker.worker, crashRecoveryWorker.observation);

  return {
    status: "ok",
    backend: "opfs-sync-shards-v2",
    main: mainResult,
    exclusiveLock: { whileHeld, afterClose },
    crashRecovery,
    workers: observations,
    securityPolicyViolations,
    pageErrors,
    unhandledRejections,
  };
}

void run().then(
  result => {
    window.__studioEngineTileStorageOpfsV2Result = result;
  },
  error => {
    window.__studioEngineTileStorageOpfsV2Result = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      workers: observations,
      securityPolicyViolations,
      pageErrors,
      unhandledRejections,
    };
  },
);
