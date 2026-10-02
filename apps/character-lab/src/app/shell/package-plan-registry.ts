/**
 * 제작(authored) 패키지 플랜 등록소.
 * PackagePanel(vision-authored)이 로드·검증한 AuthoredPackagePlan을 여기(또는 engineSession.reloadSource)로 넘기면
 * 적용 루프가 `recipe.source{kind:"package"}`를 엔진 소스로 바꿀 때 꺼내 쓴다.
 * 플랜이 없거나 SHA가 다르면 LabFailure를 throw한다(다른 소스로 대체하지 않는다).
 */
import { failVisible } from "../../contracts";

import type { AuthoredPackagePlan, RecipeSource } from "../../contracts";

export interface PackagePlanRegistry {
  register(plan: AuthoredPackagePlan): void;
  get(characterId: string): AuthoredPackagePlan | undefined;
  list(): readonly AuthoredPackagePlan[];
  /** 레시피 소스에 맞는 플랜. 없거나 SHA 불일치면 LabFailure throw. */
  resolve(source: RecipeSource, now?: number): AuthoredPackagePlan;
  subscribe(listener: () => void): () => void;
}

export function createPackagePlanRegistry(): PackagePlanRegistry {
  const plans = new Map<string, AuthoredPackagePlan>();
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    register(plan) {
      plans.set(plan.manifest.characterId, plan);
      notify();
    },
    get: (characterId) => plans.get(characterId),
    list: () => [...plans.values()],
    resolve(source, now) {
      if (source.kind !== "package") {
        throw failVisible("package-source-kind", "제작 패키지 소스가 아닌 레시피입니다.", undefined, now);
      }
      const plan = plans.get(source.characterId);
      if (!plan) {
        throw failVisible(
          "package-plan-missing",
          `제작 패키지 '${source.characterId}'가 아직 로드되지 않았습니다. 제작 패키지 패널에서 먼저 불러오세요.`,
          undefined,
          now,
        );
      }
      if (plan.glbSha256 !== source.sha256) {
        throw failVisible(
          "package-sha-mismatch",
          `제작 패키지 '${source.characterId}'의 GLB SHA-256이 레시피와 다릅니다(레시피 ${source.sha256.slice(0, 8)}…, 로드됨 ${plan.glbSha256.slice(0, 8)}…).`,
          undefined,
          now,
        );
      }
      return plan;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
