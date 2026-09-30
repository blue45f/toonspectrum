import { isAppApiError } from "@/platform/api-error";

/**
 * 버전 충돌(409) 오류인지 판정한다. 공고 수정·상태 변경은 낙관적 동시성
 * 제어를 사용하므로 다른 탭·기기에서 먼저 저장하면 서버가 409를 반환한다.
 */
export function isCollaborationConflictError(error: unknown): boolean {
  return (
    isAppApiError(error) && (error.kind === "conflict" || error.status === 409)
  );
}
