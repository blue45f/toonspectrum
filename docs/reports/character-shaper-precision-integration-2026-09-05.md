# 캐릭터 셰이퍼 정밀 편집 패키지 통합 — 2026-09-05

## 대상 및 보존 범위

PR #754 `ai/shaper-discovery-quality-20260905`의 검색·즐겨찾기·호환성·저장 복원 변경 위에
기존 정밀 편집 패키지 전체를 추가한다. 준비 기준 head는
`04fc7a4d87e636efd5dc574d1fdec01f9cfd8aa3`이다.

원본 패키지의 15개 파일 SHA-256과 크기를 재확인했다.
기존 `CharacterShaperControls.tsx` blob은 PR head와 확인한 main
`0e8254c9889509fede2a918299ac01dcf6b8cb68` 양쪽에서
`6fbc59ba350eeccc88a36c78e97e67ad26c6daad`로 패키지 기준과 같다.
기존 컨트롤 테스트는 삭제하거나 완화하지 않는다.
필터·캔버스·에셋·마켓 등 다른 스튜디오 기능은 변경하지 않는다.

## 통합 기능

- 기본 간격보다 작은 Alt 미세 조절값의 표시·입력·접근성 값 보존.
- 증가/감소 버튼, Shift 10배·Alt 0.1배 조절, 입력 중인 숫자에서 이어서 조절.
- 쉼표/점 소수, 전각 문자, 유니코드 마이너스 및 유효한 그룹 구분 처리.
- 잘못된 숫자·HEX에 오류 연결, 작성자가 지정한 비격자 기본값 보존.
- 동기 편집 스냅샷으로 마지막 변경 보존 및 pointer-up/blur 중복 커밋 방지.
- pointer cancel/Escape/언마운트에서 시작값 복원, 선택적 호스트 rollback 지원.
- 색상 임시 선택·적용·취소, 같은 색 재선택 무시, null 원본 색 구분.
- 숫자 및 HEX 편집에서 한글 IME 확정 Enter 보호.

통합 검토에서 비활성화 도중의 미완료 수치·색상 편집 취소를 보강했다.
오류 테스트는 output과 오류 안내의 중복 status 역할 대신 입력의 aria-describedby를 검사한다.
추가 lifecycle 테스트 6개는 비활성화/재활성화, host rollback 중복 방지,
window blur, document hidden, null 색 복원, HEX IME를 다룬다.

## 테스트 및 CI

실제 로컬 실행:
- TypeScript 5.8.3으로 순수 수치 모듈 strict 컴파일 통과.
- 새로 컴파일한 실제 모듈의 Node 검증문 12,055개 통과(범위 샘플 4,001개).
- TS/TSX 5개 파일 변환 진단 0. 전체 프로젝트 타입 검사를 뜻하지 않는다.

작성된 정밀 Vitest/React 사례는 기존 71개와 lifecycle 6개, 총 77개이다.
로컬 의존성 서버 DNS EAI_AGAIN으로 React/Vitest 및 프로젝트 lint/typecheck/build,
Playwright는 실행하지 못했다. 이 항목의 결과는 CI에서 확인해야 한다.

별도 중복 워크플로를 추가하지 않고 기존 `character-shaper-discovery-quality.yml`의
ESLint 목록에 정밀 파일 5개를 추가했다. 기존 전체 셰이퍼 Vitest 및 프론트엔드 타입 검사,
core·시각·브라우저 검사와 브랜치 보호는 그대로 유지한다.

## 병합 전 확인

현재 PR head에 대해 정밀 파일이 모두 포함됐는지, core와 관련 검사가 통과했는지,
최신 main과 충돌하지 않는지 확인해야 한다. 자동 병합 설정은 실제 병합 완료가 아니다.
네이티브 색상 선택기, 터치 드래그, 좁은 화면의 조절 버튼은 실브라우저 검증 대상이다.
선택적 onPreview/onCancel 인터페이스를 모든 3D 호스트의 실시간 미리보기 연결 완료로
해석하지 않는다. 메시·의상 피팅·손 접촉·PSD 시각 품질은 이번 통합 범위가 아니다.
