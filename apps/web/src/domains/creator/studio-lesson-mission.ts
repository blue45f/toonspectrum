import {
  getPracticeMission,
  type PracticeMission,
} from "@/domains/learn/public/learning-practice";

/**
 * 학습-실습 딥링크 파라미터를 검증해 미션을 찾는다.
 *
 * learn이 만드는 주소(`/studio/canvas?practice=lesson&lesson=<id>&mission=<id>`)만
 * 인정한다 — 강좌가 없거나 mission id가 그 강좌의 미션과 다르면 연결이 끊긴
 * 주소로 보고 안내를 띄우지 않는다.
 */
export function parseStudioLessonMission(search: URLSearchParams): PracticeMission | null {
  if (search.get("practice") !== "lesson") return null;
  const lessonId = search.get("lesson")?.trim() ?? "";
  const missionId = search.get("mission")?.trim() ?? "";
  if (!lessonId || !missionId) return null;
  const mission = getPracticeMission(lessonId);
  if (!mission || mission.id !== missionId) return null;
  return mission;
}
