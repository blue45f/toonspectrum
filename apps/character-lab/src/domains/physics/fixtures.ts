/**
 * physics 테스트 픽스처(결정적). 테스트 파일이 아니므로 typecheck·lint 대상이다.
 */
import { CHAIN_HIT_RADIUS_DEFAULTS, CHAIN_PARAM_DEFAULTS } from "../../contracts";

import type { CapsuleCollider, ChainAnchor, ChainDef, Vec3 } from "../../contracts";
import type { ChainCompileInput } from "./chain/chain-model";

export interface ChainFixtureOptions {
  readonly id?: string;
  readonly root?: Vec3;
  readonly segments?: number;
  readonly segmentLength?: number;
  readonly direction?: Vec3;
  readonly role?: ChainAnchor["role"];
  readonly stiffness?: number;
  readonly damping?: number;
  readonly gravityScale?: number;
  readonly radius?: number;
}

/** 직선 체인 앵커(루트에서 direction 방향으로 segments개) */
export function chainAnchorFixture(options: ChainFixtureOptions = {}): ChainAnchor {
  const id = options.id ?? "hair-0";
  const root = options.root ?? [0, 1.7, 0];
  const segments = options.segments ?? 6;
  const segmentLength = options.segmentLength ?? 0.05;
  const direction = options.direction ?? [0, -1, 0];
  const role = options.role ?? "hair";
  const base = CHAIN_PARAM_DEFAULTS[role];
  const boneNames: string[] = [];
  const restPoints: Vec3[] = [];
  for (let j = 0; j <= segments; j += 1) {
    boneNames.push(`${role}_${id}_${j}`);
    restPoints.push([root[0] + direction[0] * segmentLength * j, root[1] + direction[1] * segmentLength * j, root[2] + direction[2] * segmentLength * j]);
  }
  return {
    id,
    role,
    boneNames,
    restPoints,
    radius: options.radius ?? CHAIN_HIT_RADIUS_DEFAULTS[role],
    stiffness: options.stiffness ?? base.stiffness,
    damping: options.damping ?? base.dragForce,
    gravityScale: options.gravityScale ?? base.gravityPower,
  };
}

export function chainInputFixture(options: ChainFixtureOptions & { readonly params?: Partial<ChainDef["params"]> } = {}): ChainCompileInput {
  const anchor = chainAnchorFixture(options);
  const role = options.role ?? "hair";
  return {
    def: {
      id: anchor.id,
      rootBone: anchor.boneNames[0] ?? anchor.id,
      joints: anchor.boneNames.map((bone) => ({ bone, hitRadius: anchor.radius })),
      params: { ...CHAIN_PARAM_DEFAULTS[role], ...options.params },
    },
    restPoints: anchor.restPoints,
  };
}

/** 머리 캡슐(본 로컬: 목 위 0.12 m) */
export function headColliderFixture(radius = 0.1): CapsuleCollider {
  return { bone: "head", a: [0, 0, 0], b: [0, 0.12, 0], radius };
}
