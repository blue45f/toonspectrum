/**
 * 학습-실습 미션의 도메인 간 공개 경계.
 *
 * 스튜디오(creator 도메인)가 `/studio/canvas?practice=lesson&lesson=<id>&mission=<id>`
 * 딥링크로 들어온 실습 미션을 소비할 때 learn 내부 파일을 직접 import하지 않고
 * 이 모듈만 참조한다(아키텍처 경계 검증의 public 경계 규칙).
 * 노출 범위는 미션 조회·상태 파생·진도 토글·실습 기록에 필요한 것만으로 유지한다.
 */

export {
  areMissionStepsDone,
  getMissionStatus,
  getPracticeMission,
  type MissionStatus,
  type PracticeMission,
} from "../learning-practice";

export { useLearningPractice } from "../use-learning-practice";

export { useLearningProgress } from "../use-learning-progress";

export type { LearningProgress } from "../learning-model";
