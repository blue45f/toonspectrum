/**
 * 외형 프리셋(state-presets)과 연기 프리셋(animation)을 병합해 하나의 카탈로그를 만든다.
 * 불변식 위반은 throw(앱 시작 시 바로 보이도록)하거나 `tryCreateCatalog`로 실패 목록을 받는다.
 */
import { catalogInvariants, createPresetCatalog } from "../../contracts";

import type { LabFailure, PresetCatalog, PresetEntry } from "../../contracts";

export interface CatalogSources {
  /** presets/index.ts APPEARANCE_PRESETS(64) */
  readonly appearance: readonly PresetEntry[];
  /** animation/presets/index.ts PERFORMANCE_PRESETS(30) */
  readonly performance: readonly PresetEntry[];
}

export class CatalogInvariantError extends Error {
  readonly failures: readonly LabFailure[];

  constructor(failures: readonly LabFailure[]) {
    super(`프리셋 카탈로그 불변식 위반 ${failures.length}건: ${failures.map((f) => f.reasonKo).slice(0, 3).join(" / ")}`);
    this.name = "CatalogInvariantError";
    this.failures = failures;
  }
}

export type CatalogResult =
  | { readonly ok: true; readonly catalog: PresetCatalog }
  | { readonly ok: false; readonly catalog: PresetCatalog; readonly failures: readonly LabFailure[] };

/** 병합 후 불변식을 실행한다. 실패해도 병합된 카탈로그를 함께 돌려준다(UI가 사유를 표시). */
export function tryCreateCatalog(sources: CatalogSources, now?: number): CatalogResult {
  const catalog = createPresetCatalog([...sources.appearance, ...sources.performance]);
  const failures = catalogInvariants(catalog, now);
  return failures.length === 0 ? { ok: true, catalog } : { ok: false, catalog, failures };
}

/** 불변식 위반 시 throw */
export function createCatalog(sources: CatalogSources): PresetCatalog {
  const result = tryCreateCatalog(sources);
  if (!result.ok) throw new CatalogInvariantError(result.failures);
  return result.catalog;
}
