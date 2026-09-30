import type { PageReviewState } from "../studio-page-review";

export interface StoryboardReviewPageLike {
  readonly review?: PageReviewState | null;
}

/**
 * 팀 검토(상태 변경·잠금·담당 지정·검토 메모)를 한 번이라도 쓴 작품인지.
 *
 * 쓰지 않은 1인 작업에서는 스토리보드 컨트롤 룸의 팀 지표·담당·차단 배지를 접는다.
 * 빈 새 작품에 '차단'·'담당 미지정'이 떠서 오류처럼 보이는 것을 막기 위한 표시 규칙이며,
 * 준비도 계산이나 페이지 데이터는 바꾸지 않는다.
 */
export function storyboardTeamReviewInUse(pages: readonly StoryboardReviewPageLike[]): boolean {
  return pages.some(({ review }) => {
    if (!review) return false;
    return review.status !== "draft"
      || review.locked
      || Boolean(review.assignee?.trim())
      || Boolean(review.note?.trim());
  });
}
