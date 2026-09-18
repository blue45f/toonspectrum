import { LESSONS } from "./learning-content";
import { CURATED_LEARNING_RESOURCES } from "./learning-resources";

export const CLASSROOM_STORAGE_KEY = "toonstudio:academy-classroom:v1";

export interface ClassroomWeek {
  week: number;
  title: string;
  summary: string;
  lessonIds: string[];
  resourceIds: string[];
}

export interface ClassroomAssignment {
  id: string;
  title: string;
  week: number;
  lessonId: string | null;
  dueDate: string;
  notes: string;
}

export interface ClassroomPlan {
  version: 1;
  name: string;
  templateId: ClassroomTemplateId;
  weeks: ClassroomWeek[];
  assignments: ClassroomAssignment[];
  updatedAt: string;
}

export type ClassroomTemplateId = "webtoon-foundation" | "story-direction" | "visual-production";

export interface ClassroomTemplate {
  id: ClassroomTemplateId;
  title: string;
  description: string;
  weeks: readonly Omit<ClassroomWeek, "week">[];
}

export const CLASSROOM_TEMPLATES: readonly ClassroomTemplate[] = [
  {
    id: "webtoon-foundation",
    title: "웹툰 제작 입문 · 8주",
    description: "스토리에서 콘티, 드로잉, 채색, 말풍선, 게시 검수까지 한 회차 제작 흐름을 경험합니다.",
    weeks: [
      { title: "아이디어와 3컷 이야기", summary: "주인공의 목표를 행동으로 바꾸고 짧은 콘티를 만듭니다.", lessonIds: ["story-board"], resourceIds: ["kocca-storyboard"] },
      { title: "세로 스크롤 연출", summary: "컷과 여백으로 읽는 호흡을 조절합니다.", lessonIds: ["scroll-rhythm"], resourceIds: ["clip-webtoon-scroll"] },
      { title: "공간과 카메라", summary: "아이레벨과 소실점으로 장면의 공간 관계를 잡습니다.", lessonIds: ["camera-perspective"], resourceIds: ["clip-perspective-ruler"] },
      { title: "캐릭터와 화면 초점", summary: "실루엣과 명도로 캐릭터 행동과 시선을 정리합니다.", lessonIds: ["character-silhouette"], resourceIds: ["kocca-character-2026"] },
      { title: "선화와 레이어", summary: "선의 역할과 수정 가능한 레이어 구조를 익힙니다.", lessonIds: ["inking", "color-layers"], resourceIds: ["clip-layer-mask"] },
      { title: "대사와 말풍선", summary: "대사 길이와 배치로 읽는 순서를 설계합니다.", lessonIds: ["lettering"], resourceIds: ["toonstudio-lettering"] },
      { title: "툰스튜디오 제작 실습", summary: "세 컷 러프와 레이어 수정 실습을 작업 화면에서 수행합니다.", lessonIds: ["studio-first-page", "studio-layer-practice"], resourceIds: [] },
      { title: "게시 전 검수", summary: "원본과 게시본을 분리하고 최종 결과를 검수합니다.", lessonIds: ["publish-check"], resourceIds: ["webtoon-academy-publish"] },
    ],
  },
  {
    id: "story-direction",
    title: "스토리·콘티 집중 · 6주",
    description: "글 작가와 콘티 담당자가 이야기 목표, 컷 호흡, 카메라, 대사를 집중적으로 연습합니다.",
    weeks: [
      { title: "로그라인과 장면 목표", summary: "설정을 행동 가능한 목표와 갈등으로 바꿉니다.", lessonIds: ["story-board"], resourceIds: ["kocca-storyboard"] },
      { title: "컷 분할과 스크롤", summary: "같은 장면을 다른 호흡으로 편집해 비교합니다.", lessonIds: ["scroll-rhythm"], resourceIds: ["clip-webtoon-scroll"] },
      { title: "카메라와 공간", summary: "인물 관계와 정보량에 맞춰 앵글과 공간을 설계합니다.", lessonIds: ["camera-perspective"], resourceIds: ["clip-perspective-ruler"] },
      { title: "대사와 시선 흐름", summary: "말풍선 위치와 문장 길이로 읽는 순서를 만듭니다.", lessonIds: ["lettering"], resourceIds: ["toonstudio-lettering"] },
      { title: "3컷 콘티 제작", summary: "툰스튜디오에서 이야기와 연출을 하나의 러프로 통합합니다.", lessonIds: ["studio-first-page"], resourceIds: ["webtoon-academy-home"] },
      { title: "피드백과 수정", summary: "자가 점검표로 수정 우선순위를 정하고 게시 전 흐름을 검수합니다.", lessonIds: ["publish-check"], resourceIds: ["webtoon-academy-publish"] },
    ],
  },
  {
    id: "visual-production",
    title: "작화·채색 제작 · 6주",
    description: "그림 작가와 어시스턴트가 투시, 실루엣, 선화, 채색 레이어와 납품 흐름을 연습합니다.",
    weeks: [
      { title: "투시와 배경 기초", summary: "공간 기준과 배경 제작의 출발점을 잡습니다.", lessonIds: ["camera-perspective"], resourceIds: ["clip-perspective-ruler"] },
      { title: "캐릭터 실루엣", summary: "동작과 초점이 작은 화면에서도 읽히도록 정리합니다.", lessonIds: ["character-silhouette"], resourceIds: ["kocca-character-2026"] },
      { title: "선화", summary: "외곽, 겹침, 내부 묘사에 서로 다른 선 역할을 부여합니다.", lessonIds: ["inking"], resourceIds: [] },
      { title: "밑색과 음영", summary: "밑색, 음영, 클리핑과 마스크의 수정 단위를 구분합니다.", lessonIds: ["color-layers"], resourceIds: ["clip-layer-mask"] },
      { title: "스튜디오 수정 실습", summary: "레이어 원본을 유지한 채 색 수정과 내보내기를 수행합니다.", lessonIds: ["studio-layer-practice"], resourceIds: [] },
      { title: "납품·게시 검수", summary: "실제 결과 파일을 작은 화면에서 다시 확인합니다.", lessonIds: ["publish-check"], resourceIds: ["webtoon-academy-publish"] },
    ],
  },
];

const TEMPLATE_IDS = CLASSROOM_TEMPLATES.map((template) => template.id);
const LESSON_IDS = new Set(LESSONS.map((lesson) => lesson.id));
const RESOURCE_IDS = new Set(CURATED_LEARNING_RESOURCES.map((resource) => resource.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTemplateId(value: unknown): value is ClassroomTemplateId {
  return typeof value === "string" && TEMPLATE_IDS.includes(value as ClassroomTemplateId);
}

function boundedText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

export function createClassroomPlan(templateId: ClassroomTemplateId = "webtoon-foundation"): ClassroomPlan {
  const template = CLASSROOM_TEMPLATES.find((candidate) => candidate.id === templateId) ?? CLASSROOM_TEMPLATES[0];
  return {
    version: 1,
    name: template.title,
    templateId: template.id,
    weeks: template.weeks.map((week, index) => ({
      week: index + 1,
      title: week.title,
      summary: week.summary,
      lessonIds: [...week.lessonIds],
      resourceIds: [...week.resourceIds],
    })),
    assignments: [],
    updatedAt: new Date().toISOString(),
  };
}

export function parseClassroomPlan(raw: string | null): ClassroomPlan {
  if (!raw || raw.length > 250_000) return createClassroomPlan();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return createClassroomPlan(); }
  if (!isRecord(value) || value.version !== 1 || !isTemplateId(value.templateId)) return createClassroomPlan();

  const fallback = createClassroomPlan(value.templateId);
  const weeks = Array.isArray(value.weeks)
    ? value.weeks.slice(0, 24).flatMap((item, index): ClassroomWeek[] => {
        if (!isRecord(item)) return [];
        const lessonIds = Array.isArray(item.lessonIds)
          ? [...new Set(item.lessonIds.filter((id): id is string => typeof id === "string" && LESSON_IDS.has(id)))].slice(0, 12)
          : [];
        const resourceIds = Array.isArray(item.resourceIds)
          ? [...new Set(item.resourceIds.filter((id): id is string => typeof id === "string" && RESOURCE_IDS.has(id)))].slice(0, 12)
          : [];
        return [{
          week: index + 1,
          title: boundedText(item.title, `Week ${index + 1}`, 120),
          summary: boundedText(item.summary, "", 800),
          lessonIds,
          resourceIds,
        }];
      })
    : fallback.weeks;

  const assignments = Array.isArray(value.assignments)
    ? value.assignments.slice(0, 100).flatMap((item): ClassroomAssignment[] => {
        if (!isRecord(item) || typeof item.id !== "string") return [];
        const rawWeek = typeof item.week === "number" && Number.isInteger(item.week) ? item.week : 1;
        const lessonId = typeof item.lessonId === "string" && LESSON_IDS.has(item.lessonId) ? item.lessonId : null;
        return [{
          id: item.id.slice(0, 120),
          title: boundedText(item.title, "과제", 160),
          week: Math.max(1, Math.min(Math.max(weeks.length, 1), rawWeek)),
          lessonId,
          dueDate: boundedText(item.dueDate, "", 20),
          notes: boundedText(item.notes, "", 1200),
        }];
      })
    : [];

  return {
    version: 1,
    name: boundedText(value.name, fallback.name, 160),
    templateId: value.templateId,
    weeks: weeks.length ? weeks : fallback.weeks,
    assignments,
    updatedAt: boundedText(value.updatedAt, fallback.updatedAt, 64),
  };
}

export function loadClassroomPlan(storage: Pick<Storage, "getItem"> | null): ClassroomPlan {
  if (!storage) return createClassroomPlan();
  try { return parseClassroomPlan(storage.getItem(CLASSROOM_STORAGE_KEY)); }
  catch { return createClassroomPlan(); }
}

export function saveClassroomPlan(storage: Pick<Storage, "setItem"> | null, plan: ClassroomPlan): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CLASSROOM_STORAGE_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}
