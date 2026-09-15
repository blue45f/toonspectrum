import type {
  StudioPeerCapability,
} from "./studio-peer-fabric-protocol";
import type {
  StudioPeerFabricEvent,
  StudioPeerFabricPeer,
  StudioPeerFabricPort,
} from "./studio-peer-fabric";

export const STUDIO_PEER_COMPUTE_WIRE = "studio-peer-trusted-compute-v1" as const;
export const STUDIO_PEER_COMPUTE_JOB_TYPES = [
  "text-assist",
  "image-assist",
  "thumbnail-preview",
  "render-preview",
  "animatic-segment",
] as const;
export type StudioPeerComputeJobType = (typeof STUDIO_PEER_COMPUTE_JOB_TYPES)[number];

export interface StudioPeerComputeRequest {
  readonly wire: typeof STUDIO_PEER_COMPUTE_WIRE;
  readonly type: "request";
  readonly jobId: string;
  readonly jobType: StudioPeerComputeJobType;
  readonly input: string;
  readonly sentAt: number;
}

export interface StudioPeerComputeExecution {
  readonly sender: StudioPeerFabricPeer;
  readonly jobId: string;
  readonly jobType: StudioPeerComputeJobType;
  readonly input: unknown;
  readonly signal: AbortSignal;
}

export interface StudioPeerTrustedComputeOptions {
  readonly now?: () => number;
  readonly randomId?: () => string;
  readonly timeoutMs?: number;
  readonly maximumConcurrent?: number;
  readonly allowRequest?: (
    sender: StudioPeerFabricPeer,
    request: Omit<StudioPeerComputeExecution, "signal">,
  ) => boolean | Promise<boolean>;
  readonly execute?: (request: StudioPeerComputeExecution) => unknown | Promise<unknown>;
}

export interface StudioPeerTrustedComputePort {
  request(targetSessionId: string, jobType: StudioPeerComputeJobType, input: unknown): Promise<unknown>;
  cancel(jobId: string): boolean;
  close(): void;
}

type StudioPeerComputePacket =
  | StudioPeerComputeRequest
  | {
      readonly wire: typeof STUDIO_PEER_COMPUTE_WIRE;
      readonly type: "cancel";
      readonly jobId: string;
      readonly reason: string;
    }
  | {
      readonly wire: typeof STUDIO_PEER_COMPUTE_WIRE;
      readonly type: "result";
      readonly jobId: string;
      readonly status: "completed" | "failed";
      readonly output?: string;
      readonly error?: string;
    };

interface PendingRequest {
  readonly targetSessionId: string;
  readonly capability: StudioPeerCapability;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof globalThis.setTimeout>;
}

const JOB_SET = new Set<string>(STUDIO_PEER_COMPUTE_JOB_TYPES);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;
const MAX_JSON_BYTES = 32 * 1024;
const FORBIDDEN_KEYS = new Set([
  "url", "baseurl", "command", "shell", "executable", "script", "code",
  "headers", "apikey", "api_key", "token", "authorization", "cookie",
]);
const FORBIDDEN_STRING_PREFIX = /^(?:https?:|file:|javascript:|data:text\/html)/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function safeJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 16_000 && !FORBIDDEN_STRING_PREFIX.test(value);
  if (Array.isArray(value)) return value.length <= 512
    && value.every((entry) => safeJsonValue(entry, depth + 1));
  if (!isRecord(value) || Object.keys(value).length > 128) return false;
  return Object.entries(value).every(([key, entry]) =>
    !FORBIDDEN_KEYS.has(key.toLowerCase()) && safeJsonValue(entry, depth + 1)
  );
}

function parsePacket(value: unknown): StudioPeerComputePacket | null {
  if (!isRecord(value) || value.wire !== STUDIO_PEER_COMPUTE_WIRE
    || typeof value.type !== "string"
    || typeof value.jobId !== "string" || !ID_PATTERN.test(value.jobId)) return null;
  if (value.type === "request") {
    if (Object.keys(value).length !== 6
      || typeof value.jobType !== "string" || !JOB_SET.has(value.jobType)
      || typeof value.input !== "string" || utf8Bytes(value.input) > MAX_JSON_BYTES
      || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt)) return null;
    try {
      if (!safeJsonValue(JSON.parse(value.input) as unknown)) return null;
    } catch {
      return null;
    }
    return {
      wire: STUDIO_PEER_COMPUTE_WIRE,
      type: "request",
      jobId: value.jobId,
      jobType: value.jobType as StudioPeerComputeJobType,
      input: value.input,
      sentAt: value.sentAt,
    };
  }
  if (value.type === "cancel") {
    return Object.keys(value).length === 4
      && typeof value.reason === "string" && value.reason.length <= 240
      ? { wire: STUDIO_PEER_COMPUTE_WIRE, type: "cancel", jobId: value.jobId, reason: value.reason }
      : null;
  }
  if (value.type === "result") {
    const keys = Object.keys(value);
    if (keys.length < 4 || keys.length > 6
      || (value.status !== "completed" && value.status !== "failed")
      || (value.output !== undefined
        && (typeof value.output !== "string" || utf8Bytes(value.output) > MAX_JSON_BYTES))
      || (value.error !== undefined
        && (typeof value.error !== "string" || value.error.length > 500))) return null;
    if (value.status === "completed" && typeof value.output !== "string") return null;
    if (value.status === "failed" && typeof value.error !== "string") return null;
    return {
      wire: STUDIO_PEER_COMPUTE_WIRE,
      type: "result",
      jobId: value.jobId,
      status: value.status,
      ...(typeof value.output === "string" ? { output: value.output } : {}),
      ...(typeof value.error === "string" ? { error: value.error } : {}),
    };
  }
  return null;
}

function capabilityForJob(jobType: StudioPeerComputeJobType): StudioPeerCapability {
  return jobType === "render-preview" || jobType === "animatic-segment"
    ? "peer-render-v1"
    : "trusted-compute-v1";
}

function createJobId(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value || !ID_PATTERN.test(value)) {
    throw new Error("P2P 연산 작업 식별자를 생성할 수 없습니다.");
  }
  return value;
}

export class StudioPeerTrustedCompute implements StudioPeerTrustedComputePort {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly inbound = new Map<string, {
    senderSessionId: string;
    capability: StudioPeerCapability;
    controller: AbortController;
  }>();
  private readonly unsubscribeCompute: () => void;
  private readonly unsubscribeRender: () => void;
  private readonly now: () => number;
  private readonly makeId: () => string;
  private readonly timeoutMs: number;
  private readonly maximumConcurrent: number;
  private readonly allowRequest: NonNullable<StudioPeerTrustedComputeOptions["allowRequest"]>;
  private readonly execute?: StudioPeerTrustedComputeOptions["execute"];
  private closed = false;

  constructor(
    private readonly fabric: StudioPeerFabricPort,
    options: StudioPeerTrustedComputeOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.makeId = options.randomId ?? createJobId;
    this.timeoutMs = Number.isSafeInteger(options.timeoutMs)
      ? Math.max(1_000, Math.min(10 * 60_000, Number(options.timeoutMs)))
      : 60_000;
    this.maximumConcurrent = Number.isSafeInteger(options.maximumConcurrent)
      ? Math.max(1, Math.min(8, Number(options.maximumConcurrent)))
      : 2;
    this.allowRequest = options.allowRequest ?? (() => false);
    this.execute = options.execute;
    this.unsubscribeCompute = fabric.subscribe("trusted-compute-v1", (event) => {
      void this.receive(event, "trusted-compute-v1");
    });
    this.unsubscribeRender = fabric.subscribe("peer-render-v1", (event) => {
      void this.receive(event, "peer-render-v1");
    });
  }

  request(
    targetSessionId: string,
    jobType: StudioPeerComputeJobType,
    input: unknown,
  ): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("P2P 신뢰 기기 연산이 종료되었습니다."));
    if (!JOB_SET.has(jobType) || !safeJsonValue(input)) {
      return Promise.reject(new TypeError("P2P 연산 입력이 안전 계약을 통과하지 못했습니다."));
    }
    const capability = capabilityForJob(jobType);
    if (!this.fabric.getPeers(capability).some((peer) => peer.sessionId === targetSessionId)) {
      return Promise.reject(new Error("상대 기기가 요청한 P2P 연산 capability를 지원하지 않습니다."));
    }
    const encoded = JSON.stringify(input);
    if (utf8Bytes(encoded) > MAX_JSON_BYTES) {
      return Promise.reject(new TypeError("P2P 연산 입력이 크기 한도를 초과했습니다."));
    }
    const jobId = this.makeId();
    if (!ID_PATTERN.test(jobId) || this.pending.has(jobId)) {
      return Promise.reject(new Error("P2P 연산 작업 식별자가 올바르지 않거나 중복되었습니다."));
    }
    const packet: StudioPeerComputeRequest = {
      wire: STUDIO_PEER_COMPUTE_WIRE,
      type: "request",
      jobId,
      jobType,
      input: encoded,
      sentAt: this.now(),
    };
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.pending.delete(jobId);
        this.sendPacket(targetSessionId, capability, {
          wire: STUDIO_PEER_COMPUTE_WIRE,
          type: "cancel",
          jobId,
          reason: "P2P 연산 응답 시간이 초과되었습니다.",
        });
        reject(new Error("P2P 연산 응답 시간이 초과되었습니다."));
      }, this.timeoutMs);
      this.pending.set(jobId, { targetSessionId, capability, resolve, reject, timer });
      if (!this.sendPacket(targetSessionId, capability, packet)) {
        globalThis.clearTimeout(timer);
        this.pending.delete(jobId);
        reject(new Error("P2P 연산 요청을 전달하지 못했습니다."));
      }
    });
  }

  cancel(jobId: string): boolean {
    const pending = this.pending.get(jobId);
    if (!pending) return false;
    this.pending.delete(jobId);
    globalThis.clearTimeout(pending.timer);
    this.sendPacket(pending.targetSessionId, pending.capability, {
        wire: STUDIO_PEER_COMPUTE_WIRE,
        type: "cancel",
        jobId,
        reason: "사용자가 P2P 연산을 취소했습니다.",
      });
    pending.reject(new Error("사용자가 P2P 연산을 취소했습니다."));
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeCompute();
    this.unsubscribeRender();
    for (const [jobId, pending] of this.pending) {
      globalThis.clearTimeout(pending.timer);
      pending.reject(new Error("P2P 신뢰 기기 연산이 종료되었습니다."));
      this.pending.delete(jobId);
    }
    for (const inbound of this.inbound.values()) inbound.controller.abort();
    this.inbound.clear();
  }

  private sendPacket(
    targetSessionId: string,
    capability: StudioPeerCapability,
    packet: StudioPeerComputePacket,
  ): boolean {
    return this.fabric.send(targetSessionId, capability, JSON.stringify(packet), {
      trafficClass: "control",
      ttlMs: Math.min(this.timeoutMs, 60_000),
    });
  }

  private async receive(
    event: StudioPeerFabricEvent,
    capability: StudioPeerCapability,
  ): Promise<void> {
    if (this.closed) return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(event.payload) as unknown;
    } catch {
      return;
    }
    const packet = parsePacket(candidate);
    if (!packet) return;
    if (packet.type === "request") {
      await this.receiveRequest(event.sender, capability, packet);
      return;
    }
    if (packet.type === "cancel") {
      const inbound = this.inbound.get(packet.jobId);
      if (inbound?.senderSessionId === event.sender.sessionId
        && inbound.capability === capability) {
        inbound.controller.abort();
        this.inbound.delete(packet.jobId);
      }
      return;
    }
    const pending = this.pending.get(packet.jobId);
    if (!pending || pending.targetSessionId !== event.sender.sessionId
      || pending.capability !== capability) return;
    globalThis.clearTimeout(pending.timer);
    this.pending.delete(packet.jobId);
    if (packet.status === "failed") {
      pending.reject(new Error(packet.error ?? "상대 기기의 P2P 연산이 실패했습니다."));
      return;
    }
    try {
      const output = JSON.parse(packet.output ?? "null") as unknown;
      if (!safeJsonValue(output)) throw new Error("P2P 연산 결과가 안전 계약을 통과하지 못했습니다.");
      pending.resolve(output);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error("P2P 연산 결과를 해석하지 못했습니다."));
    }
  }

  private async receiveRequest(
    sender: StudioPeerFabricPeer,
    capability: StudioPeerCapability,
    packet: StudioPeerComputeRequest,
  ): Promise<void> {
    if (capabilityForJob(packet.jobType) !== capability
      || packet.sentAt > this.now() + 5_000
      || this.now() - packet.sentAt > this.timeoutMs
      || this.inbound.has(packet.jobId)) return;
    if (this.inbound.size >= this.maximumConcurrent || !this.execute) {
      this.sendFailure(sender.sessionId, capability, packet.jobId, "P2P 연산 실행기가 사용 가능하지 않습니다.");
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(packet.input) as unknown;
    } catch {
      return;
    }
    const context = {
      sender,
      jobId: packet.jobId,
      jobType: packet.jobType,
      input,
    };
    let allowed: boolean;
    try {
      allowed = await this.allowRequest(sender, context);
    } catch {
      this.sendFailure(sender.sessionId, capability, packet.jobId, "P2P 연산 승인 확인에 실패했습니다.");
      return;
    }
    if (!allowed) {
      this.sendFailure(sender.sessionId, capability, packet.jobId, "P2P 연산 요청이 승인되지 않았습니다.");
      return;
    }
    const controller = new AbortController();
    this.inbound.set(packet.jobId, {
      senderSessionId: sender.sessionId,
      capability,
      controller,
    });
    try {
      const output = await this.execute({ ...context, signal: controller.signal });
      if (controller.signal.aborted || !safeJsonValue(output)) {
        throw new Error(controller.signal.aborted
          ? "P2P 연산이 취소되었습니다."
          : "P2P 연산 결과가 안전 계약을 통과하지 못했습니다.");
      }
      const encoded = JSON.stringify(output);
      if (utf8Bytes(encoded) > MAX_JSON_BYTES) {
        throw new Error("P2P 연산 결과가 크기 한도를 초과했습니다.");
      }
      this.sendPacket(sender.sessionId, capability, {
        wire: STUDIO_PEER_COMPUTE_WIRE,
        type: "result",
        jobId: packet.jobId,
        status: "completed",
        output: encoded,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        this.sendFailure(
          sender.sessionId,
          capability,
          packet.jobId,
          error instanceof Error ? error.message : "P2P 연산 실행에 실패했습니다.",
        );
      }
    } finally {
      if (this.inbound.get(packet.jobId)?.controller === controller) {
        this.inbound.delete(packet.jobId);
      }
    }
  }

  private sendFailure(
    targetSessionId: string,
    capability: StudioPeerCapability,
    jobId: string,
    error: string,
  ): void {
    this.sendPacket(targetSessionId, capability, {
      wire: STUDIO_PEER_COMPUTE_WIRE,
      type: "result",
      jobId,
      status: "failed",
      error: error.slice(0, 500),
    });
  }
}

export function createStudioPeerTrustedCompute(
  fabric: StudioPeerFabricPort,
  options: StudioPeerTrustedComputeOptions = {},
): StudioPeerTrustedComputePort {
  return new StudioPeerTrustedCompute(fabric, options);
}
