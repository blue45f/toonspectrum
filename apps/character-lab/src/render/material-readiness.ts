/**
 * 재질(셰이더) 준비 대기(순수). Babylon은 `isReady()`가 false인 재질의 메시를 그리지 않고, 셰이더 컴파일·환경 텍스처 대기가 끝나야 true가 된다.
 * 캡처·썸네일이 준비 전에 RTT를 렌더하면 **완전 투명 결과**가 나오므로 그리기 전에 실제 `isReady`를 폴링해야 한다.
 *
 * 실브라우저 실측(2026-10-01, Chrome + SwiftShader WebGL2): PBR 재질은 소프트웨어 렌더러에서 컴파일에 약 10초가 걸렸고, 이전 구현이 쓰던
 * `material.forceCompilationAsync(mesh)`는 실제 서브메시와 다른 임시 서브메시로 컴파일하는 탓에 1.2초 만에 돌아와 lit 패스가 0픽셀이었다.
 * 그래서 실제 렌더가 쓰는 `material.isReady(mesh)`(= 첫 서브메시의 isReadyForSubMesh)를 직접 폴링한다. 폴링 호출 자체가 컴파일을 시작시킨다.
 */

export interface ReadinessOptions {
  /** 이 시간 안에 모두 준비되지 않으면 ready=false로 돌려준다(ms). */
  readonly timeoutMs: number;
  /** 폴링 간격(ms) */
  readonly pollMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly elapsedMs: number;
  /** 마지막 검사에서 준비되지 않은 항목 수 */
  readonly pending: number;
  /** 검사 횟수 */
  readonly polls: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 모든 검사가 true가 될 때까지(또는 시간 초과까지) 폴링한다. 검사가 비어 있으면 즉시 ready. */
export async function waitUntilReady(checks: ReadonlyArray<() => boolean>, options: ReadinessOptions): Promise<ReadinessResult> {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  const pollMs = options.pollMs ?? 25;
  const start = now();
  let polls = 0;
  for (;;) {
    polls += 1;
    let pending = 0;
    for (const check of checks) if (!check()) pending += 1;
    const elapsedMs = now() - start;
    if (pending === 0) return { ready: true, elapsedMs, pending: 0, polls };
    if (elapsedMs >= options.timeoutMs) return { ready: false, elapsedMs, pending, polls };
    await sleep(pollMs);
  }
}
