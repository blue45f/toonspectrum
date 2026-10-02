/**
 * revenue-registry.ts
 *
 * 수익원 제공자(RevenueSourceProvider) 플러그인 레지스트리.
 * monetization 도메인의 루트에 두어 트랙 간 직접 의존을 끊는다.
 * 각 트랙은 자신의 index.ts에서 registerRevenueSourceProvider를 호출한다.
 */
import type { RevenueSourceId, RevenueSourceProvider } from "./models/revenue-model";

const providers = new Map<RevenueSourceId, RevenueSourceProvider>();

/** 수익원 제공자를 등록한다. 같은 sourceId는 덮어쓴다. */
export function registerRevenueSourceProvider(provider: RevenueSourceProvider): void {
  providers.set(provider.sourceId, provider);
}

/** 등록된 제공자를 조회한다. */
export function getRevenueSourceProvider(
  sourceId: RevenueSourceId,
): RevenueSourceProvider | null {
  return providers.get(sourceId) ?? null;
}

/** 등록된 모든 제공자를 조회한다. */
export function listRevenueSourceProviders(): readonly RevenueSourceProvider[] {
  return [...providers.values()];
}

/** 레지스트리를 비운다 (테스트용). */
export function resetRevenueSourceProviders(): void {
  providers.clear();
}
