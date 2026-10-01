/**
 * 제작 패키지 로드 흐름(순수, fetch 포트 주입): index.json → manifest(두 형식) → slot-mapping.json(선택) → GLB 바이트 →
 * SHA-256 → AuthoredPackagePlan. 브라우저 바인딩은 package-index.browser.ts / package-loader.browser.ts가 맡고,
 * 이 파일은 Node 테스트에서 가짜 포트로 모든 실패 경로(404·형식 오류·SHA 불일치·품질 미통과)를 검증한다.
 */
import { CHARACTER_PACKAGE_ASSET_ROOT, CHARACTER_PACKAGE_INDEX_FILENAME, failVisible, isLabFailure } from "../../contracts";

import { parseAnyCharacterManifest } from "./authored-character-manifest";
import { parseCharacterPackageIndex } from "./package-index";
import { buildPackagePlanDetailed, joinPackageUrl } from "./package-plan";

import type { AuthoredGap, AuthoredManifestConversion } from "./authored-character-manifest";
import type { HairLodSelection } from "./mesh-role-mapping";
import type { CapabilityJudgement } from "./package-capability";
import type { AuthoredIndexEntry } from "./package-index";
import type { AuthoredPackagePlan, LabFailure } from "../../contracts";

export type FetchJsonResult = { readonly ok: true; readonly json: unknown } | { readonly ok: false; readonly status: number | null; readonly message: string };
export type FetchBytesResult = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly status: number | null; readonly message: string };

export interface PackageFetchPort {
  fetchJson(url: string): Promise<FetchJsonResult>;
  fetchBytes(url: string): Promise<FetchBytesResult>;
}

export const DEFAULT_PACKAGE_INDEX_URL = `${CHARACTER_PACKAGE_ASSET_ROOT}/${CHARACTER_PACKAGE_INDEX_FILENAME}`;

export type PackageIndexLoadResult =
  | { readonly ok: true; readonly entries: readonly AuthoredIndexEntry[] }
  | { readonly ok: false; readonly failure: LabFailure };

/** index.json을 읽어 항목 목록으로. 404는 "등록된 제작 패키지 없음"으로 구분한다. */
export async function loadPackageIndexFlow(port: PackageFetchPort, url: string = DEFAULT_PACKAGE_INDEX_URL, now?: number): Promise<PackageIndexLoadResult> {
  const response = await port.fetchJson(url);
  if (!response.ok) {
    if (response.status === 404) {
      return { ok: false, failure: failVisible("package-index-missing", "등록된 제작 패키지가 없습니다(index.json 없음).", response.message, now) };
    }
    return { ok: false, failure: failVisible("package-index-fetch-failed", `index.json을 불러오지 못했습니다(${response.status ?? "네트워크"}).`, response.message, now) };
  }
  const parsed = parseCharacterPackageIndex(response.json, now);
  if (!parsed.ok) return { ok: false, failure: parsed.failure };
  if (parsed.entries.length === 0) {
    return { ok: false, failure: failVisible("package-index-empty", "등록된 제작 패키지가 없습니다(index.json 항목 0개).", undefined, now) };
  }
  return { ok: true, entries: parsed.entries };
}

export interface AuthoredPackageDetail {
  readonly judgement: CapabilityJudgement;
  readonly hairLod: HairLodSelection;
  readonly conversion: AuthoredManifestConversion | null;
  readonly gaps: readonly AuthoredGap[];
  /** 치명적이지 않지만 사용자에게 보여야 하는 경고(예: slot-mapping.json 로드 실패 → 규칙 판정만 사용) */
  readonly warnings: readonly string[];
  readonly glbBytes: Uint8Array;
  readonly observedSha256: string;
}

export type AuthoredPackageLoadResult =
  | { readonly ok: true; readonly plan: AuthoredPackagePlan; readonly detail: AuthoredPackageDetail }
  | { readonly ok: false; readonly failure: LabFailure };

export interface PackageLoadDeps {
  readonly sha256: (bytes: Uint8Array) => Promise<string>;
  readonly preferredLod?: number;
  readonly now?: number;
}

/** index 항목 하나를 끝까지 로드한다(manifest → slot-mapping → GLB → SHA → 플랜). */
export async function loadAuthoredPackageFlow(port: PackageFetchPort, entry: AuthoredIndexEntry, deps: PackageLoadDeps): Promise<AuthoredPackageLoadResult> {
  const now = deps.now;
  const manifestResponse = await port.fetchJson(entry.manifestUrl);
  if (!manifestResponse.ok) {
    return {
      ok: false,
      failure: failVisible("package-manifest-fetch-failed", `제작 패키지 manifest를 불러오지 못했습니다(${manifestResponse.status ?? "네트워크"}): ${entry.manifestUrl}`, manifestResponse.message, now),
    };
  }
  const warnings: string[] = [];
  let slotMappingJson: unknown;
  const manifestRecord = typeof manifestResponse.json === "object" && manifestResponse.json !== null ? (manifestResponse.json as Record<string, unknown>) : null;
  const files = manifestRecord?.files as { slotMapping?: { path?: unknown } } | undefined;
  const slotMappingPath = typeof files?.slotMapping?.path === "string" ? files.slotMapping.path : null;
  if (slotMappingPath) {
    const mappingResponse = await port.fetchJson(joinPackageUrl(entry.baseUrl, slotMappingPath));
    if (mappingResponse.ok) slotMappingJson = mappingResponse.json;
    else warnings.push(`slot-mapping.json을 불러오지 못해(${mappingResponse.status ?? "네트워크"}) 규칙 판정만 사용합니다.`);
  }

  const parsed = parseAnyCharacterManifest(manifestResponse.json, slotMappingJson, now);
  if (!parsed.ok) return { ok: false, failure: parsed.failure };
  const glb = parsed.manifest.files.glb;
  if (!glb) return { ok: false, failure: failVisible("package-no-glb", "제작 패키지 manifest에 files.glb가 없습니다.", undefined, now) };

  const glbResponse = await port.fetchBytes(joinPackageUrl(entry.baseUrl, glb.path));
  if (!glbResponse.ok) {
    return { ok: false, failure: failVisible("package-glb-fetch-failed", `GLB를 불러오지 못했습니다(${glbResponse.status ?? "네트워크"}): ${glb.path}`, glbResponse.message, now) };
  }
  let observedSha256: string;
  try {
    observedSha256 = await deps.sha256(glbResponse.bytes);
  } catch (error) {
    return { ok: false, failure: isLabFailure(error) ? error : failVisible("package-sha-unavailable", "GLB SHA-256을 계산하지 못했습니다.", error, now) };
  }
  const built = buildPackagePlanDetailed(parsed.manifest, entry.baseUrl, { glbSha256: observedSha256, glbBytes: glbResponse.bytes.byteLength }, {
    preferredLod: deps.preferredLod,
    licenseNote: entry.licenseNote,
    now,
  });
  if (!built.ok) return { ok: false, failure: built.failure };
  return {
    ok: true,
    plan: built.plan,
    detail: {
      judgement: built.judgement,
      hairLod: built.hairLod,
      conversion: parsed.conversion,
      gaps: parsed.conversion?.gaps ?? [],
      warnings,
      glbBytes: glbResponse.bytes,
      observedSha256,
    },
  };
}

/** 전역 fetch(또는 주입된 fetch)로 PackageFetchPort를 만든다. 테스트는 가짜 fetch를 넣는다. */
export function createFetchPackagePort(fetchImpl: typeof fetch): PackageFetchPort {
  const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));
  return {
    async fetchJson(url) {
      try {
        const response = await fetchImpl(url, { cache: "no-cache" });
        if (!response.ok) return { ok: false, status: response.status, message: `${response.status} ${response.statusText}` };
        return { ok: true, json: (await response.json()) as unknown };
      } catch (error) {
        return { ok: false, status: null, message: describe(error) };
      }
    },
    async fetchBytes(url) {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) return { ok: false, status: response.status, message: `${response.status} ${response.statusText}` };
        return { ok: true, bytes: new Uint8Array(await response.arrayBuffer()) };
      } catch (error) {
        return { ok: false, status: null, message: describe(error) };
      }
    },
  };
}
