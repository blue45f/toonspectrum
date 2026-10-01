/**
 * Rapier Worker 요청/응답 프로토콜(zod 4). Worker 경계를 넘는 메시지는 전부 여기서 검증하며
 * 핸들러는 Worker 없이도(Node·메인 스레드) 같은 provider에 바로 적용할 수 있다.
 */
import { z } from "zod";

import { HUMANOID_BONE_NAMES, PHYSICS_BUDGET, describeDetail, failVisible } from "../../../contracts";
import { PhysicsProviderError } from "../builtin-provider";

import type { CapsuleCollider, ChainAnchor, LabFailure, PhysicsProvider, PhysicsStatus, SettleReceipt } from "../../../contracts";

const finite = z.number().finite();
export const vec3Schema = z.tuple([finite, finite, finite]).readonly();
export const quatSchema = z.tuple([finite, finite, finite, finite]).readonly();

export const chainAnchorSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["hair", "skirt", "ribbon"]),
    boneNames: z.array(z.string().min(1)).min(2).max(PHYSICS_BUDGET.maxParticlesPerChain).readonly(),
    restPoints: z.array(vec3Schema).min(2).readonly(),
    radius: finite.nonnegative(),
    stiffness: finite,
    damping: finite.min(0).max(1),
    gravityScale: finite,
  })
  .strict()
  .refine((anchor) => anchor.boneNames.length === anchor.restPoints.length, { message: "boneNames와 restPoints 길이가 달라야 합니다." });

export const capsuleColliderSchema = z
  .object({
    bone: z.enum(HUMANOID_BONE_NAMES),
    a: vec3Schema,
    b: vec3Schema,
    radius: finite.positive(),
  })
  .strict();

export const rapierRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("init"), seq: z.number().int().nonnegative() }).strict(),
  z
    .object({
      type: z.literal("setChains"),
      seq: z.number().int().nonnegative(),
      chains: z.array(chainAnchorSchema).max(PHYSICS_BUDGET.maxChains).readonly(),
      colliders: z.array(capsuleColliderSchema).max(PHYSICS_BUDGET.maxCapsules).readonly(),
    })
    .strict(),
  z.object({ type: z.literal("setBoneWorld"), seq: z.number().int().nonnegative(), bone: z.string().min(1), position: vec3Schema, rotation: quatSchema }).strict(),
  z.object({ type: z.literal("step"), seq: z.number().int().nonnegative(), dt: finite.positive(), substeps: z.number().int().min(1).max(16) }).strict(),
  z
    .object({
      type: z.literal("settle"),
      seq: z.number().int().nonnegative(),
      maxSteps: z.number().int().min(0).max(PHYSICS_BUDGET.settleMaxSteps),
      velocityEpsilon: finite.nonnegative(),
    })
    .strict(),
  z.object({ type: z.literal("read"), seq: z.number().int().nonnegative(), chainId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("snapshotHash"), seq: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("reset"), seq: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("dispose"), seq: z.number().int().nonnegative() }).strict(),
]);

export type RapierRequest = z.infer<typeof rapierRequestSchema>;

export type RapierResult =
  | { readonly kind: "status"; readonly status: PhysicsStatus }
  | { readonly kind: "void" }
  | { readonly kind: "settle"; readonly receipt: SettleReceipt }
  | { readonly kind: "positions"; readonly positions: Float32Array }
  | { readonly kind: "hash"; readonly hash: string };

export type RapierResponse =
  | { readonly seq: number; readonly ok: true; readonly result: RapierResult }
  | { readonly seq: number; readonly ok: false; readonly failure: LabFailure };

/** 스냅샷 해시를 제공하는 provider(rapier) */
export interface SnapshotHashProvider extends PhysicsProvider {
  snapshotHash(): Promise<string>;
}

export type RapierProtocolHandler = (message: unknown) => Promise<RapierResponse>;

function toFailure(error: unknown, code: string, now?: number): LabFailure {
  if (error instanceof PhysicsProviderError) return error.failure;
  return failVisible(code, error instanceof Error ? error.message : "알 수 없는 오류", describeDetail(error), now);
}

/**
 * 검증된 요청을 provider에 적용한다. 잘못된 메시지는 `rapier-protocol-invalid`, 실행 실패는
 * `rapier-request-failed`(또는 provider의 LabFailure)로 응답한다.
 */
export function createRapierProtocolHandler(provider: SnapshotHashProvider, now?: () => number): RapierProtocolHandler {
  const clock = now ?? Date.now;
  return async (message: unknown): Promise<RapierResponse> => {
    const parsed = rapierRequestSchema.safeParse(message);
    if (!parsed.success) {
      const seq = typeof message === "object" && message !== null && typeof (message as { seq?: unknown }).seq === "number" ? (message as { seq: number }).seq : -1;
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      return { seq, ok: false, failure: failVisible("rapier-protocol-invalid", `Rapier 요청 형식이 올바르지 않습니다: ${issues}`, undefined, clock()) };
    }
    const request = parsed.data;
    try {
      switch (request.type) {
        case "init":
          return { seq: request.seq, ok: true, result: { kind: "status", status: await provider.init() } };
        case "setChains":
          provider.setChains(request.chains as readonly ChainAnchor[], request.colliders as readonly CapsuleCollider[]);
          return { seq: request.seq, ok: true, result: { kind: "void" } };
        case "setBoneWorld":
          provider.setBoneWorld(request.bone, request.position, request.rotation);
          return { seq: request.seq, ok: true, result: { kind: "void" } };
        case "step":
          provider.step(request.dt, request.substeps);
          return { seq: request.seq, ok: true, result: { kind: "void" } };
        case "settle":
          return { seq: request.seq, ok: true, result: { kind: "settle", receipt: provider.settle(request.maxSteps, request.velocityEpsilon) } };
        case "read":
          return { seq: request.seq, ok: true, result: { kind: "positions", positions: provider.readChainPositions(request.chainId) } };
        case "snapshotHash":
          return { seq: request.seq, ok: true, result: { kind: "hash", hash: await provider.snapshotHash() } };
        case "reset":
          provider.reset();
          return { seq: request.seq, ok: true, result: { kind: "void" } };
        case "dispose":
          provider.dispose();
          return { seq: request.seq, ok: true, result: { kind: "void" } };
        default:
          return { seq: -1, ok: false, failure: failVisible("rapier-protocol-invalid", "알 수 없는 요청 종류입니다.", undefined, clock()) };
      }
    } catch (error) {
      return { seq: request.seq, ok: false, failure: toFailure(error, "rapier-request-failed", clock()) };
    }
  };
}
