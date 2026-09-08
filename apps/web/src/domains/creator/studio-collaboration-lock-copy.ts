// 공동 문서 잠금/역할 카피 — StudioCuttoonEditorHost에서 추출.
// 메뉴바·툴벨트가 렌더 중 읽는 문구라 호출 시점의 권한 스냅샷만 받는 순수 함수로 둔다.

export interface StudioCollaborationLockCopyInput {
  readonly collaborationOperationSyncPending: boolean;
  readonly documentReloadRequired: boolean;
  readonly sharedDocument: { readonly role: string } | null | undefined;
  readonly sourceHydrationPending: boolean;
  readonly studioTeamCommentCapabilities: { readonly comment?: boolean } | null;
  readonly workHydrated: boolean;
  readonly workHydrationFailed: boolean;
}

export function describeStudioCollaborationLock(
  input: StudioCollaborationLockCopyInput,
): string {
  if (input.documentReloadRequired) {
    return "서버 문서가 변경되어 안전하게 잠갔어요. 로컬 원고를 내보낸 뒤 페이지를 다시 불러와 주세요.";
  }
  if (input.sourceHydrationPending) {
    return input.workHydrationFailed
      ? "원본 원고를 열지 못해 편집·저장·가져오기를 잠갔어요. 다시 시도해 주세요."
      : "원본 원고를 불러오는 동안 편집·저장·가져오기를 잠갔어요. 불러오기가 끝나면 자동으로 열립니다.";
  }
  if (!input.sharedDocument) {
    return input.workHydrated
      ? "공동 문서를 열지 못해 편집과 저장을 잠갔어요. 연결을 확인한 뒤 다시 시도해 주세요."
      : "공동 문서를 불러오는 동안 편집과 저장을 사용할 수 없어요.";
  }
  if (input.collaborationOperationSyncPending) {
    return "같은 화면의 원고 연산을 동기화하고 있어요. CRDT 문서와 장면 런타임이 모두 준비되면 편집이 자동으로 열립니다.";
  }
  if (input.sharedDocument.role === "commenter") {
    if (input.studioTeamCommentCapabilities?.comment === true) {
      return "검토 전용 권한입니다. 원고 편집은 잠겨 있지만 댓글 도구로 캔버스 위치에 피드백을 남길 수 있어요.";
    }
    if (input.studioTeamCommentCapabilities === null) {
      return "검토 전용 권한입니다. 원고 편집은 잠겨 있으며 팀 댓글 권한과 기록을 확인하고 있어요.";
    }
    return "검토 전용 권한입니다. 원고와 댓글 작성은 읽기 전용이며 기존 피드백을 확인할 수 있어요.";
  }
  if (input.sharedDocument.role === "viewer") {
    return "열람 전용 권한입니다. 원고 편집과 저장은 할 수 없지만 스크롤과 내보내기는 계속 사용할 수 있어요.";
  }
  return "현재 서버 권한이 열람 전용입니다. 원고 편집과 저장은 할 수 없지만 스크롤과 내보내기는 계속 사용할 수 있어요.";
}

export function labelStudioCollaborationRole(role: string | null | undefined): string {
  switch (role) {
    case "owner":
      return "소유자";
    case "admin":
      return "관리자";
    case "editor":
      return "편집자";
    case "commenter":
      return "검토자";
    case "viewer":
      return "열람자";
    default:
      return "권한 확인 중";
  }
}
