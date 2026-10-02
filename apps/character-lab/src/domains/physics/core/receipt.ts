/**
 * 결정성 영수증(character-physics.md §4.3): 입자 위치 바이트의 SHA-256과 시뮬레이션 메타.
 * 캡처·export 메타(`extras.toonstudioPhysics`)에 첨부한다.
 */
import { fnv1a64HexBytes, sha256Hex } from "../../../shared/hash";

import type { DeterminismScope, PhysicsProviderId, PhysicsReceipt } from "../../../contracts";

/** Float32Array의 바이트 뷰(복사 없음, 리틀엔디언 플랫폼 기준) */
export function float32Bytes(buffer: Float32Array): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** 동기 상태 해시(fnv1a64, 테스트·캐시 키용). 영수증에는 sha256을 쓴다. */
export function stateHashSync(positions: Float32Array): string {
  return fnv1a64HexBytes(float32Bytes(positions));
}

/** 입자 위치의 SHA-256 hex */
export function stateHashSha256(positions: Float32Array): Promise<string> {
  return sha256Hex(float32Bytes(positions));
}

export interface ReceiptInput {
  readonly providerId: PhysicsProviderId;
  readonly determinismScope: DeterminismScope;
  readonly modelHash: string;
  readonly poseHash: string;
  readonly steps: number;
  readonly dt: number;
  readonly positions: Float32Array;
}

export async function createPhysicsReceipt(input: ReceiptInput): Promise<PhysicsReceipt> {
  const stateHash = await stateHashSha256(input.positions);
  return {
    providerId: input.providerId,
    determinismScope: input.determinismScope,
    modelHash: input.modelHash,
    poseHash: input.poseHash,
    steps: input.steps,
    dt: input.dt,
    stateHash,
  };
}
