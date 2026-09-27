# Studio 메뉴·문서 권한 검증 — 2026-09-27

상태: **current**. 정적 preview의 메뉴 조작 검증과 서버 정본 문서의 변경 계약을 구분한다.

## 확인한 결함과 수정

오프라인 발행자는 편집을 Automerge branch에 수락한 뒤 canonical Yjs 문서를 변경하지 않는다.
기존 커밋 엔진이 바로 canonical frontier를 병합하면서 수락된 그룹·요소 편집을 이전 값으로
되돌렸다. `mergeStudioCrdtFrontier`는 원격 요소를 먼저 병합한 뒤 pending offline operation을
기존 `projectPages`로 투영한다. 권한 판정·정본 발행·승격·실행 취소 알고리즘은 변경하지 않는다.

지원하지 않는 페이지 크기 변경은 오프라인 planner가 원자적으로 거절하지만 그 이유가
연결 패널의 오류 상태에만 전달됐다. 발행자는 같은 거절 사유를 기존 편집기 오류 포트에도
전달하여 메뉴를 실행한 화면의 `role="alert"`에 표시한다. 페이지 크기를 offline schema에
추가하거나 권한 없는 변경을 강제로 발행하지 않는다.

## CI에서 함께 요구하는 계약

`studio-production-integrity`는 다음 두 검증을 같은 job에서 필수 실행한다.

- 실제 Automerge runtime, Yjs 문서, transition publisher, commit engine을 연결한 통합 테스트:
  정본 권한이 있으면 Naver 8348 → Kakao 8000 → 실행 취소 8348을 발행한다.
  권한이 없으면 높이·히스토리·정본이 바뀌지 않으며 오류를 알린다. 오프라인 그룹·요소 편집,
  원격 획 보존, 오프라인 실행 취소, Smart Shape 최종 경로·메타데이터 보존도 검사한다.
- 실제 production bundle의 브라우저 메뉴 검사: 크기 변경이 허용된 경우 기존
  Naver → Kakao → 실행 취소 검사를 유지한다. 검증기가 직접 연 loopback static preview와
  정확히 같은 origin에서 명시적 정본 권한 거절이 발생하면 두 메뉴를 각각 실행하여
  새 오류 안내와 높이·현재 원고 불변을 요구한다. 이전 오류는 두 번째 실행 전에 닫는다.
  아무 반응 없음, 임의 오류, 높이 변동, 외부 origin의 거절은 성공으로 인정하지 않는다.

## 2026-09-27 실행 결과

- 관련 오프라인·정본 발행·커밋·메뉴 단위 및 통합 테스트 13개 파일, 145개 통과.
  Smart Shape 회귀는 투영 수정 전의 raw 18점과 메타데이터 유실을 재현한 뒤,
  수정 후 보정된 2점과 메타데이터 보존을 확인했다.
- CI 필수 단계 계약 21개 통과. 고정 빌드 경로 지원을 연결한 뒤 메뉴 단위 테스트
  14개도 다시 통과했다.
- `.qa/sitewide-merge-ready/dist`의 고정 production bundle로 전체 메뉴 검증 통과.
  9개 주메뉴, AI 동작, 도구 모음·팝오버, 장치 5종, 도킹·잠금·내보내기를 검사했다.
  이 실행의 페이지 크기 메뉴는 정적 mesh 작업방의 권한 거절 분기였으며,
  네이버·카카오 두 동작 각각에서 명시적 안내와 원고 불변을 확인했다.

고정 빌드 검사는 `TOONSPECTRUM_VERIFY_DIST`로 산출물의 절대 경로를 전달하며,
검증기가 별도 loopback preview를 직접 연다. 진행 중인 다른 작업의 `dist/` 또는
이미 실행 중인 preview를 묵시적으로 재사용하지 않는다.

## 검증 한계

기존 메뉴 스크립트는 자체 Vite preview의 `/studio/canvas`를 열 뿐 인증 API, 저장된
CreatorWork, Socket.IO 정본 서버를 시작하지 않았다. 2026-09-27 재현에서 임시 작업방은
`mode=server`, `crdtFanout=mesh`, `ready=true`, `canonicalAuthority=false`였다.
이는 peer mesh의 준비 상태이며 서버 정본 권한을 뜻하지 않는다. 기존 정적 브라우저의
크기 변경 기대를 인증된 서버 작업의 검증 근거로 해석할 수 없다.

실제 인증 API를 거쳐 저장된 작품의 서버 정본을 변경하는 브라우저 검증은 이 작업에서
수행하지 않았다. 그러한 검증에는 실제 인증·작품 ACL·ticket·정본 sync/ACK·lease를 갖춘
별도 환경이 필요하다. CI 조건·timeout·실패 기준을 완화하거나 전송 모드를 위조하지 않는다.
