import {
  getActiveI18nLocale,
  translateAuthoredSourceText,
  translateBilingualPair,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const ENGLISH: Readonly<Record<string, string>> = {
  "제작 작업 보드": "Production board",
  "작업 만들기": "Create task",
  "공정 설정": "Configure workflow",
  "공정 보기": "View workflow",
  "회차 공정 만들기": "Create episode tasks",
  "작업 검색": "Search tasks",
  "칸반 보기": "Board view",
  "목록 보기": "List view",
  보드: "Board",
  목록: "List",
  "필터·팀 보기": "Filters & team views",
  "상세 필터와 팀 보기": "Filters and team views",
  "필터 초기화": "Reset filters",
  "모든 작업": "All tasks",
  "기한 지남": "Overdue",
  "막힌 작업": "Blocked",
  "검수 대기": "Awaiting review",
  "담당 미배정": "Unassigned",
  "모든 회차": "All episodes",
  "모든 공정": "All processes",
  "모든 담당자": "All assignees",
  "우선순위 높은 순": "Highest priority",
  "마감 빠른 순": "Earliest due date",
  "작업 제목순": "Title",
  "현재 보기 저장": "Save current view",
  "팀 보기 저장": "Save team view",
  "보기 이름": "View name",
  "선택 작업 이동": "Move selected tasks",
  "선택 해제": "Clear selection",
  "현재 결과 선택 (최대 200개)": "Select results (up to 200)",
  "작업 제목": "Task title",
  우선순위: "Priority",
  "제작 공정": "Production process",
  회차: "Episode",
  "프로젝트 공통": "Project-wide",
  담당자: "Assignees",
  검수자: "Reviewers",
  "작업 저장": "Save task",
  "마감 · 내 시간대": "Due date · local time",
  "대화상자 닫기": "Close dialog",
  "편집 계속": "Continue editing",
  "저장하지 않고 닫기": "Discard and close",
  "저장하지 않은 변경이 있습니다.": "You have unsaved changes.",
  "프로세스 이름": "Workflow name",
  "프로세스 저장": "Save workflow",
  "선택한 공정 상세": "Selected process",
  "공정 이름": "Process name",
  "작업 안내": "Task instructions",
  "기본 담당 역할": "Default role",
  "동시 진행 작업 수": "Work-in-progress limit",
  "예상 공수 (시간)": "Estimated hours",
  "공정 추가": "Add process",
  "선택한 공정 삭제": "Delete selected process",
  "선행 공정": "Prerequisite processes",
  "저장 전에 확인해주세요": "Check before saving",
  "저장된 팀 보기": "Saved team views",
  "회차 필터": "Episode filter",
  "공정 필터": "Process filter",
  "담당자 필터": "Assignee filter",
  "작업 정렬": "Task sort",
  "선택한 작업 이동 상태": "Target status for selected tasks",
  "모든 작업 보기": "View all tasks",
  "변경을 적용하지 않았습니다": "No changes were applied",
  "알림 닫기": "Dismiss message",
  "완료 기준 · 한 줄에 하나": "Completion criteria · one per line",
  "검수 단계로 이동할 때 검수자 필수": "Require a reviewer before entering review",
  "작업 설명 · 시각적 블록 편집": "Task brief · visual blocks",
};

/** 작성자 콘텐츠는 번역하지 않고, UI의 고정 문구만 등록한다. */
export function productionText(source: string): string {
  const english = ENGLISH[source];
  return english
    ? translateBilingualPair("creator.production.workboard", source, english)
    : translateAuthoredSourceText(getActiveI18nLocale(), "ko", "creator.production.workboard", source);
}

export function useProductionCopy(): void {
  useBilingualI18nRevision();
}
