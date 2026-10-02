/**
 * 브라우저 전용: index 항목 → manifest·slot-mapping·GLB fetch → crypto.subtle SHA-256 → AuthoredPackagePlan.
 * GLB 바이트는 검증에만 쓰고 플랜의 glbUrl로 엔진이 다시 받는다(브라우저 HTTP 캐시가 두 번째 요청을 흡수한다).
 */
import { sha256Hex } from "../../shared/hash";

import { createFetchPackagePort, loadAuthoredPackageFlow } from "./package-load-flow";

import type { AuthoredIndexEntry } from "./package-index";
import type { AuthoredPackageLoadResult } from "./package-load-flow";

export function loadAuthoredPackage(entry: AuthoredIndexEntry, options: { readonly preferredLod?: number } = {}): Promise<AuthoredPackageLoadResult> {
  return loadAuthoredPackageFlow(createFetchPackagePort(globalThis.fetch.bind(globalThis)), entry, {
    sha256: sha256Hex,
    preferredLod: options.preferredLod,
    now: Date.now(),
  });
}
