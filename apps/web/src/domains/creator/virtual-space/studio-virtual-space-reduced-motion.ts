import { useEffect, useState } from "react";

/**
 * `(prefers-reduced-motion: reduce)` 미디어 쿼리를 구독하는 훅.
 *
 * 가상 공간 도메인에서 모션 감소 대응이 필요한 컴포넌트들이 공유한다.
 * `matchMedia`가 없는 환경(SSR·구형 브라우저·테스트 스텁)에서는
 * `false`를 반환하고 조용히 렌더링한다.
 */
export function useStudioPrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}
