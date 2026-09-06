# Studio 댓글 집중 검수함 고도화 — 2026-09-05

## 목적

댓글이 많아질수록 작성 자체보다 **내가 지금 처리해야 하는 피드백을 찾는 시간**이 길어지는 문제를 줄인다. 기존 위치 핀, 읽지 않음, 해결/재개, 담당자, 멘션, 팀 동기화 계약은 유지하고 검수 레일의 탐색과 답글 입력만 확장한다.

## 사용자 변화

- `내 담당`: 현재 사용자에게 명시적으로 배정된 댓글만 즉시 모아 본다.
- `나를 멘션`: 첫 댓글뿐 아니라 전체 답글 이력 중 현재 사용자를 부른 대화까지 모아 본다.
- 새 댓글, 검수 레일 답글, 캔버스 핀 빠른 답글은 `Ctrl/⌘ + Enter`로 등록한다.
- 일반 `Enter`는 줄바꿈으로 유지해 한국어 조합 입력과 여러 줄 피드백을 방해하지 않는다.
- 사용자 식별자는 계정 ID를 우선하며, ID가 없는 레거시 문서는 NFKC 정규화된 표시 이름으로 비교한다.

## 안전성

- 새 전역 저장소나 별도 영속 계층을 만들지 않는다.
- 서버 댓글 문서 형식과 API mutation 형식을 변경하지 않는다.
- 필터는 기존 문서의 `assignee`와 `mentions`만 읽는다.
- 단축키는 IME 조합 중에는 실행되지 않으며 현재 폼의 표준 submit 경로를 그대로 사용한다.

## 검증

```bash
pnpm exec vitest run \
  src/domains/creator/studio-comment-inbox-filter.test.ts \
  src/domains/creator/studio-comment-inbox-integration.test.ts \
  src/domains/creator/StudioCommentsPanel.test.tsx \
  src/domains/creator/StudioCommentThreadPopover.test.tsx

pnpm exec eslint \
  src/domains/creator/studio-comment-inbox-filter.ts \
  src/domains/creator/studio-comment-inbox-filter.test.ts \
  src/domains/creator/studio-comment-inbox-integration.test.ts \
  src/domains/creator/StudioCommentsPanel.tsx \
  src/domains/creator/StudioCommentThreadPopover.tsx

pnpm exec tsc --noEmit
```
