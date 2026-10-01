/**
 * 브라우저 전용: `fetch`로 index.json을 읽는다(package-load-flow의 얇은 바인딩).
 * 테스트는 이 파일을 import하지 않고 package-load-flow를 가짜 포트로 검증한다.
 */
import { createFetchPackagePort, loadPackageIndexFlow } from "./package-load-flow";

import type { PackageIndexLoadResult } from "./package-load-flow";

export function loadCharacterPackageIndex(url?: string): Promise<PackageIndexLoadResult> {
  return loadPackageIndexFlow(createFetchPackagePort(globalThis.fetch.bind(globalThis)), url, Date.now());
}
