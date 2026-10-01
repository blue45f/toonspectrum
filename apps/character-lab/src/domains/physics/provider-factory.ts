/**
 * 물리 provider 카탈로그·factory(스펙 §5.4 `createPhysicsProviderFactory`).
 * 요청한 provider 하나만 만들고 init()은 호출자(render/physics-bridge)가 한다. 알 수 없는 id는 거부한다.
 */
import { PHYSICS_PROVIDER_IDS, PHYSICS_PROVIDER_LABELS_KO, failVisible, isPhysicsProviderId } from "../../contracts";

import { PhysicsProviderError, createBuiltinPbdProvider } from "./builtin-provider";
import { HAVOK_UNAVAILABLE_REASON_KO, createHavokProvider } from "./havok-provider";
import { createRapierProvider } from "./rapier-provider";

import type { PbdChainSolverOptions } from "./pbd-chain";
import type { RapierProviderOptions } from "./rapier-provider";
import type { DeterminismScope, PhysicsProvider, PhysicsProviderFactory, PhysicsProviderId } from "../../contracts";

export interface PhysicsProviderDescriptor {
  readonly id: PhysicsProviderId;
  readonly labelKo: string;
  /** primary = 헤어·의상 1급, auxiliary = 소품·접지 보조, unavailable = 미설치 */
  readonly role: "primary" | "auxiliary" | "unavailable";
  readonly determinismScope: DeterminismScope | null;
  readonly noteKo: string;
}

export const PHYSICS_PROVIDER_CATALOG: readonly PhysicsProviderDescriptor[] = [
  {
    id: "builtin-pbd",
    labelKo: PHYSICS_PROVIDER_LABELS_KO["builtin-pbd"],
    role: "primary",
    determinismScope: "cross-engine-f32",
    noteKo: "자체 XPBD 체인·클로스·캡슐 충돌. 헤어·스커트·리본·jiggle 1급 엔진.",
  },
  {
    id: "rapier",
    labelKo: PHYSICS_PROVIDER_LABELS_KO.rapier,
    role: "auxiliary",
    determinismScope: "cross-engine-f32",
    noteKo: "동적 import(Apache-2.0). 강체 체인·캡슐 접촉, 삽입 순서 고정·takeSnapshot 해시. rest 복원력 없음.",
  },
  {
    id: "havok",
    labelKo: PHYSICS_PROVIDER_LABELS_KO.havok,
    role: "unavailable",
    determinismScope: null,
    noteKo: HAVOK_UNAVAILABLE_REASON_KO,
  },
];

export interface PhysicsProviderFactoryOptions {
  readonly builtin?: PbdChainSolverOptions;
  readonly rapier?: RapierProviderOptions;
}

export function createPhysicsProviderFactory(options: PhysicsProviderFactoryOptions = {}): PhysicsProviderFactory {
  return (id: PhysicsProviderId): Promise<PhysicsProvider> => {
    if (!isPhysicsProviderId(id)) {
      return Promise.reject(
        new PhysicsProviderError(failVisible("physics-unknown-provider", `알 수 없는 물리 provider입니다: ${String(id)} (지원: ${PHYSICS_PROVIDER_IDS.join(", ")})`)),
      );
    }
    switch (id) {
      case "builtin-pbd":
        return Promise.resolve(createBuiltinPbdProvider(options.builtin));
      case "rapier":
        return Promise.resolve(createRapierProvider(options.rapier));
      case "havok":
        return Promise.resolve(createHavokProvider());
      default:
        return Promise.reject(new PhysicsProviderError(failVisible("physics-unknown-provider", `알 수 없는 물리 provider입니다: ${String(id)}`)));
    }
  };
}
