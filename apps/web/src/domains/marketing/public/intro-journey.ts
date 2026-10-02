import {
  ABOUT_JOURNEY,
  SERVICE_FLOW,
  type AboutJourneyHref,
  type ServiceFlowStep,
} from "../reference-home-content";

// 컴포넌트 파일(intro-primitives.tsx)에서 순수 함수를 분리해 두어 Fast Refresh 규칙을 지키고 단위 테스트가 화면 없이 순서를 확인한다.

/** ABOUT_JOURNEY 순서에서 현재 페이지의 앞뒤를 구한다. 마지막 페이지는 다음 소개 대신 시작하기로 끝낸다. */
export function aboutJourneyNeighbors(current: AboutJourneyHref) {
  const index = ABOUT_JOURNEY.findIndex((link) => link.href === current);
  return {
    index,
    total: ABOUT_JOURNEY.length,
    previous: index > 0 ? ABOUT_JOURNEY[index - 1] : undefined,
    next: index >= 0 && index < ABOUT_JOURNEY.length - 1 ? ABOUT_JOURNEY[index + 1] : undefined,
  };
}

/** SERVICE_FLOW에서 현재 단계의 다음 목적지. 마지막 단계(시작)는 다음이 없다. */
export function serviceFlowNext(current: ServiceFlowStep) {
  const index = SERVICE_FLOW.findIndex((step) => step.id === current);
  return index >= 0 ? SERVICE_FLOW[index + 1] : undefined;
}

/** SERVICE_FLOW에서 현재 단계의 이전 목적지. 첫 단계(홈)는 이전이 없다. */
export function serviceFlowPrevious(current: ServiceFlowStep) {
  const index = SERVICE_FLOW.findIndex((step) => step.id === current);
  return index > 0 ? SERVICE_FLOW[index - 1] : undefined;
}
