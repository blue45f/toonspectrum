/**
 * 파괴적 명령 카탈로그 — StudioPage 의 네이티브 `confirm()` 10곳을 대체하는 요청 기술.
 *
 * 각 항목의 `reversibility` 는 실측 판단이다(ux-audit-v5 §2.12 후속 조사):
 * 아홉 곳은 승인 후 문서 커밋(`commit`/`commitPages`/히스토리 스냅샷)을 거쳐 ⌘Z 로
 * 되돌아오고, 한 곳(복구 지점 삭제)만 브라우저 저장소에서 레코드를 지우므로 되돌릴 수
 * 없다. 되돌림 범위가 문서 일부에 그치는 경우(`checkpointRestore`)는 `undoNote` 로
 * 한계를 명시한다 — "되돌릴 수 있다"는 말만 하고 일부가 안 돌아오면 숨은 실패다.
 *
 * 문구는 여기 한 곳에만 있다. StudioPage 호출부는 값만 넘긴다.
 */

import { recordStudioDestructiveOutcome } from "./studio-destructive-action-preview";

import type { StudioDestructiveActionRequest } from "./studio-destructive-action-preview";

const PAGE_ELEMENTS_LABEL = "현재 페이지의 요소";

/** ① 빠른 웹툰 결과로 현재 페이지 교체 — commit() 경유, ⌘Z 가능. */
export function studioQuickComicReplaceRequest(
  elementCount: number,
): StudioDestructiveActionRequest {
  return {
    id: "studio.quick-comic.replace-page",
    title: "빠른 웹툰 결과로 현재 페이지 교체",
    losses: [{ label: PAGE_ELEMENTS_LABEL, count: elementCount }],
    gains: ["빠른 웹툰이 조립한 컷과 말풍선"],
    reversibility: "undoable",
  };
}

/** ② 장면 스냅샷으로 페이지 교체 — commitPages() 경유, ⌘Z 가능. */
export function studioSceneSnapshotReplaceRequest(input: {
  readonly pageName: string;
  readonly sceneName: string;
  readonly currentElementCount: number;
  readonly incomingElementCount: number;
}): StudioDestructiveActionRequest {
  return {
    id: "studio.scene-snapshot.replace-page",
    title: `${input.pageName}을(를) “${input.sceneName}” 장면으로 교체`,
    losses: [
      { label: `${input.pageName}의 요소`, count: input.currentElementCount },
    ],
    gains: [`“${input.sceneName}” 장면 레이어 ${input.incomingElementCount}개`],
    reversibility: "undoable",
  };
}

/** ③ 예시 작품 불러오기 — commit() 경유, ⌘Z 가능. */
export function studioStartFromExampleRequest(
  elementCount: number,
): StudioDestructiveActionRequest {
  return {
    id: "studio.example.replace-page",
    title: "예시 작품 불러오기",
    losses: [{ label: PAGE_ELEMENTS_LABEL, count: elementCount }],
    gains: ["예시 웹툰 한 페이지"],
    reversibility: "undoable",
  };
}

/** ④ 이메레스 밑그림 일괄 삭제 — commit() 경유, ⌘Z 가능. */
export function studioRemoveEmeresUnderlaysRequest(
  underlayCount: number,
): StudioDestructiveActionRequest {
  return {
    id: "studio.emeres.remove-underlays",
    title: "이메레스 밑그림 전부 지우기",
    losses: [
      {
        label: "이메레스 밑그림",
        count: underlayCount,
        note: "그 위에 그린 펜 선은 지워지지 않아요",
      },
    ],
    reversibility: "undoable",
  };
}

/** ⑤ 템플릿 적용 — commit() 경유, ⌘Z 가능. */
export function studioApplyTemplateRequest(input: {
  readonly elementCount: number;
  readonly frameCount: number;
}): StudioDestructiveActionRequest {
  return {
    id: "studio.template.apply",
    title: "템플릿 적용",
    losses: [{ label: PAGE_ELEMENTS_LABEL, count: input.elementCount }],
    gains: [`템플릿 컷 ${input.frameCount}개`],
    reversibility: "undoable",
  };
}

/** ⑥ 컷 레이아웃 프리셋 적용 — commit() 경유, ⌘Z 가능. */
export function studioApplyPanelLayoutRequest(input: {
  readonly layoutName: string;
  readonly elementCount: number;
}): StudioDestructiveActionRequest {
  return {
    id: "studio.panel-layout.apply",
    title: `컷 템플릿 “${input.layoutName}” 적용`,
    losses: [{ label: PAGE_ELEMENTS_LABEL, count: input.elementCount }],
    gains: ["선택한 컷 배치"],
    reversibility: "undoable",
  };
}

/** ⑦ 콜라주 적용(교체 모드) — commit() 경유, ⌘Z 가능. */
export function studioApplyCollageRequest(input: {
  readonly elementCount: number;
  readonly frameCount: number;
}): StudioDestructiveActionRequest {
  return {
    id: "studio.collage.apply",
    title: "콜라주로 현재 페이지 교체",
    losses: [{ label: PAGE_ELEMENTS_LABEL, count: input.elementCount }],
    gains: [`콜라주 컷 ${input.frameCount}개와 배치한 사진`],
    reversibility: "undoable",
  };
}

/**
 * ⑧ 명명 체크포인트로 문서 복원 — 페이지는 히스토리 스냅샷으로 되돌아오지만
 * 제목·설명·마스터·캐릭터 바이블·댓글 등 사이드 문서는 히스토리에 들어가지 않는다.
 * 그래서 `undoNote` 로 되돌림 범위를 정확히 밝힌다.
 */
export function studioRestoreCheckpointRequest(input: {
  readonly checkpointName: string;
  readonly currentPageCount: number;
}): StudioDestructiveActionRequest {
  return {
    id: "studio.checkpoint.restore",
    title: `'${input.checkpointName}' 시점으로 문서 복원`,
    losses: [
      { label: "현재 페이지", count: input.currentPageCount },
      {
        label: "현재 제목·설명·마스터·캐릭터 설정",
        note: "체크포인트에 담긴 값으로 덮어써져요",
      },
    ],
    gains: [`'${input.checkpointName}' 시점의 문서 전체`],
    reversibility: "undoable",
    undoNote:
      "다만 실행 취소는 페이지에만 적용됩니다. 제목·설명·마스터 같은 문서 정보는 되돌아오지 않아요.",
  };
}

/**
 * ⑨ 복구 지점 삭제 — **되돌릴 수 없다.** 브라우저 저장소의 스냅샷 레코드를 지우며
 * 히스토리 커밋이 전혀 없다. confirm 을 유지하되 무엇이 영구히 사라지는지 명시한다.
 */
export function studioDeleteCheckpointRequest(input: {
  readonly checkpointName: string;
  readonly savedAtLabel?: string;
}): StudioDestructiveActionRequest {
  return {
    id: "studio.checkpoint.delete",
    title: `'${input.checkpointName}' 복구 지점 삭제`,
    losses: [
      {
        label: `복구 지점 '${input.checkpointName}'`,
        ...(input.savedAtLabel ? { note: `${input.savedAtLabel}에 저장된 스냅샷` } : {}),
      },
    ],
    reversibility: "irreversible",
  };
}

/** ⑩ 페이지 전체의 수채 번짐 레이어 지우기 — commit() 경유, ⌘Z 가능. */
export function studioClearLivingInkRequest(): StudioDestructiveActionRequest {
  return {
    id: "studio.living-ink.clear-page",
    title: "현재 페이지의 수채 번짐 레이어 지우기",
    losses: [
      {
        label: "이 페이지의 수채 번짐 레이어",
        note: "펜 선과 다른 레이어는 그대로 남아요",
      },
    ],
    reversibility: "undoable",
  };
}

/**
 * 커밋 결과를 원장에 남기고 그대로 돌려준다.
 *
 * 감사가 찾아낸 조용한 실패: 파괴 승인 뒤의 `commit(...)` 다섯 곳이 반환값을 버려서,
 * 문서 잠금·저장 중 거절이 **아무 표시 없이** 사라졌다. 승인은 했는데 아무 일도 일어나지
 * 않는 것은 사용자에게 가장 나쁜 실패다. 이 함수를 지나면 성공도 거절도 반드시 남는다.
 */
export function settleStudioDestructiveCommit(
  request: StudioDestructiveActionRequest,
  committed: boolean,
  undo?: () => void,
): boolean {
  recordStudioDestructiveOutcome({
    request,
    outcome: committed ? "committed" : "refused",
    ...(committed && undo ? { undo } : {}),
  });
  return committed;
}
