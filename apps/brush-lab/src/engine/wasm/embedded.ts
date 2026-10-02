import { SUMI_KERNEL_BASE64 } from "./kernel-embedded";
import { SUMI_KERNEL_SHA256 } from "./kernel-integrity";
import { loadSumiKernel } from "./loader";

import type { SumiKernel } from "./loader";

/**
 * 내장 wasm 바이트(`kernel-embedded.ts`, build.sh가 생성한 base64) 접근. 브라우저·Worker·Node 어디서나
 * 별도 fetch·자산 배선 없이 같은 바이트를 얻고, 로더가 `kernel-integrity.ts`의 SHA-256과 대조한다.
 * 호스트가 다른 바이트를 주입하려면(테스트·교체 빌드) `loadSumiKernel(bytes, expectedSha256)`를 직접 쓴다.
 */
export function embeddedKernelBytes(): Uint8Array {
  const binary = atob(SUMI_KERNEL_BASE64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 내장 커널을 로드한다(호출마다 새 인스턴스·새 선형 메모리). 무결성 불일치는 `LaneUnavailableError("wasm-integrity-mismatch")`. */
export function loadEmbeddedKernel(): Promise<SumiKernel> {
  return loadSumiKernel(embeddedKernelBytes(), SUMI_KERNEL_SHA256);
}

export { SUMI_KERNEL_SHA256 };
