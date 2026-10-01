/** 새 작품 제목 입력칸과 프로젝트 라이브러리 저장 규칙이 함께 쓰는 제목 길이 한도. */
export const STUDIO_PROJECT_TITLE_MAX_LENGTH = 120;

/**
 * 작품 홈의 한 줄 아이디어나 주소(`?title=`)로 받은 제목 초안을 정리한다.
 * 연속 공백을 하나로 줄이고 한도에 맞추며, 내용이 없으면 `null`을 돌려준다.
 */
export function normalizeStudioProjectTitleDraft(value: string | null | undefined): string | null {
  const title = (value ?? "").trim().replace(/\s+/gu, " ").slice(0, STUDIO_PROJECT_TITLE_MAX_LENGTH);
  return title ? title : null;
}
