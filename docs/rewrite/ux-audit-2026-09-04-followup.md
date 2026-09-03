# ToonStudio UI/UX 후속 개선 — 2026-09-04

기준 main: `915d68a4e899c8f40bc0cd0d9fbef9d5a1a94626`

## 반영

- 필터 메뉴를 기본 필터·레이어 보정·픽셀화·블러·렌즈/화면·스타일화·선화/복원·노이즈·왜곡·질감/변환으로 구획화.
- 메뉴 행이 명시적으로 승인한 비파괴 진입점만 통합 검색에서 직접 실행. 첫 적용 범위는 실제 적용이 아니라 미리보기/편집면을 여는 필터 명령 전체.
- 메뉴와 검색은 같은 `onSelect` 클로저를 사용하며, 저장·게시·삭제 등은 기본적으로 계속 도움말 전용.
- 텍스트·말풍선·스티커 선택 시 글자/대사 편집을 위치·크기보다 앞선 최상위 인스펙터 액션으로 승격.

## 검증

- `studio-command-execution-registry.test.ts`
- `StudioCommandSearchDialog.test.tsx`
- `studio-main-menu-items-filter.test.ts`
- `studio-inspector-primary-text-edit.test.ts`
