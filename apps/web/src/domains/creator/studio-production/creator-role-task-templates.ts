import type {
  ProductionPriority,
  ProductionRole,
  ProductionStage,
  ProductionTask,
} from "./studio-production-workspace-runtime";

export interface CreatorRoleTaskTemplateStep {
  readonly title: string;
  readonly stage: ProductionStage;
  readonly priority: ProductionPriority;
}

export interface CreatorRoleTaskTemplate {
  readonly id: string;
  readonly role: ProductionRole;
  readonly label: string;
  readonly description: string;
  readonly steps: readonly CreatorRoleTaskTemplateStep[];
}

const template = (
  id: string,
  role: ProductionRole,
  label: string,
  description: string,
  steps: readonly CreatorRoleTaskTemplateStep[],
): CreatorRoleTaskTemplate => ({ id, role, label, description, steps });

export const CREATOR_ROLE_TASK_TEMPLATES: readonly CreatorRoleTaskTemplate[] = [
  template("story-episode", "story", "회차 대본 준비", "설정 확인부터 대본 승인 요청까지 묶습니다.", [
    { title: "설정·호칭·복선 확인", stage: "planning", priority: "normal" },
    { title: "회차 대본 초안 작성", stage: "script", priority: "high" },
    { title: "대본 자체 검수와 인계 준비", stage: "script-approved", priority: "high" },
  ]),
  template("storyboard-pass", "storyboard", "콘티 제작", "대본 의도를 컷과 스크롤 리듬으로 전환합니다.", [
    { title: "장면 목적과 필수 연출 확인", stage: "storyboard", priority: "high" },
    { title: "세로 스크롤 콘티 제작", stage: "storyboard", priority: "high" },
    { title: "공동 콘티 검수 요청", stage: "storyboard-approved", priority: "normal" },
  ]),
  template("lineart-pass", "lineart", "선화 제작", "러프 확인부터 레이어 정리까지 진행합니다.", [
    { title: "러프·캐릭터 연속성 확인", stage: "rough", priority: "high" },
    { title: "담당 컷 선화", stage: "lineart", priority: "high" },
    { title: "레이어명·누락선 자체 검수", stage: "lineart", priority: "normal" },
  ]),
] as const;
export const CREATOR_ROLE_TASK_TEMPLATES_FINISHING: readonly CreatorRoleTaskTemplate[] = [
  template("color-pass", "color", "채색·후보정", "색 기준부터 최종 화면 톤까지 확인합니다.", [
    { title: "팔레트·광원 기준 확인", stage: "color-background", priority: "high" },
    { title: "밑색·명암·효과 작업", stage: "color-background", priority: "high" },
    { title: "색 번짐·누락·후보정 검수", stage: "review", priority: "normal" },
  ]),
  template("background-pass", "background", "배경 제작", "장면 요구와 카메라를 배경 자산으로 연결합니다.", [
    { title: "장면·카메라·원근 요구 확인", stage: "rough", priority: "high" },
    { title: "2D·3D 배경 및 소품 제작", stage: "color-background", priority: "high" },
    { title: "캐릭터 접지·광원 통합 확인", stage: "review", priority: "normal" },
  ]),
  template("lettering-pass", "lettering", "식자·통합", "대사부터 효과음과 말풍선 안전영역까지 확인합니다.", [
    { title: "최종 대사·번역본 확인", stage: "lettering", priority: "high" },
    { title: "말풍선·효과음 배치", stage: "lettering", priority: "high" },
    { title: "잘림·가독성·순서 검수", stage: "review", priority: "normal" },
  ]),
  template("review-gate", "reviewer", "최종 검수", "플랫폼 납품 전에 차단 오류와 수정 사항을 확인합니다.", [
    { title: "대사·이미지·연속성 검수", stage: "review", priority: "urgent" },
    { title: "수정 요청 반영 확인", stage: "review", priority: "high" },
    { title: "최종 승인 기록", stage: "approved", priority: "high" },
  ]),
] as const;
export const CREATOR_ROLE_TASK_TEMPLATES_OPERATIONS: readonly CreatorRoleTaskTemplate[] = [
  template("director-week", "director", "주간 제작 운영", "담당자·병목·승인 일정을 주간 단위로 정리합니다.", [
    { title: "담당자 없는 작업 확인", stage: "planning", priority: "urgent" },
    { title: "마감·병목·과부하 조정", stage: "planning", priority: "high" },
    { title: "승인 대기와 다음 인계 확인", stage: "review", priority: "high" },
  ]),
  template("publish-release", "publisher", "플랫폼 게시 준비", "규격 검사부터 게시 후 확인까지 묶습니다.", [
    { title: "플랫폼 규격·크레딧 확인", stage: "approved", priority: "high" },
    { title: "내보내기 파일·메타데이터 검수", stage: "publishing", priority: "urgent" },
    { title: "게시 결과와 복구본 확인", stage: "publishing", priority: "normal" },
  ]),
] as const;

export const ALL_CREATOR_ROLE_TASK_TEMPLATES: readonly CreatorRoleTaskTemplate[] = [
  ...CREATOR_ROLE_TASK_TEMPLATES,
  ...CREATOR_ROLE_TASK_TEMPLATES_FINISHING,
  ...CREATOR_ROLE_TASK_TEMPLATES_OPERATIONS,
];

export function creatorRoleTaskTemplates(
  roles: readonly ProductionRole[],
): readonly CreatorRoleTaskTemplate[] {
  const roleSet = new Set(roles);
  return ALL_CREATOR_ROLE_TASK_TEMPLATES.filter((entry) => roleSet.has(entry.role));
}

export function createCreatorRoleTemplateTasks(
  templateValue: CreatorRoleTaskTemplate,
  owner: string,
  assignmentId: string | null,
  createId: (index: number) => string,
): readonly ProductionTask[] {
  const ids = templateValue.steps.map((_, index) => createId(index));
  return templateValue.steps.map((step, index) => ({
    id: ids[index]!,
    title: step.title,
    owner,
    due: "",
    progress: 0,
    status: "todo",
    stage: step.stage,
    priority: step.priority,
    role: templateValue.role,
    hierarchyNodeId: null,
    dependencyIds: index > 0 ? [ids[index - 1]!] : [],
    assigneeIds: assignmentId ? [assignmentId] : [],
    reviewerIds: [],
    blockedReason: "",
  }));
}
