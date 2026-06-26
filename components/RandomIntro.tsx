import { useState } from "react";

import { IntroSplash } from "./IntroSplash";
import { SplashScreen } from "./SplashScreen";

export interface RandomIntroProps {
  /**
   * 세션당 1회만 노출(sessionStorage). 기본 true(웹 동작).
   * false 면 마운트마다 노출 — 토스 앱 재오픈마다 인트로를 다시 보여줄 때 사용.
   */
  once?: boolean;
}

/**
 * RandomIntro — 웹(/)·토스(apps/toss) **공유** 인트로 셔플러(NO fork).
 *
 * 마운트 시 한 번 동전 던지기(Math.random() < 0.5)로 두 인트로 중 하나를 고른다:
 *  - 절반: 구(舊) 웹 인트로 <IntroSplash/> — Three.js 스펙트럼 웨이브("더 멋진").
 *  - 절반: 현행 <SplashScreen/> — 공유 fx 기반 워드마크 스플래시.
 *
 * 선택은 **마운트당 1회**만 결정되어 그 마운트 동안 안정적이다(useState 지연 초기화로 고정).
 * once 는 고른 인트로에 그대로 위임한다(once=true: 세션 1회, once=false: 매 마운트).
 */
export function RandomIntro({ once }: RandomIntroProps = {}) {
  // 마운트당 1회만 평가 — 지연 초기화로 리렌더에도 같은 인트로를 유지한다.
  // NOSONAR S2245 비암호화 용도(인트로 A/B 셔플, 보안 무관)
  const [useLegacy] = useState(() => Math.random() < 0.5);

  return useLegacy ? <IntroSplash once={once} /> : <SplashScreen once={once} />;
}

export default RandomIntro;
