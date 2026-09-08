# 2026-09-08 미반영 작업 통합 근거

통합 브랜치 `codex/integrate-unmerged-20260908`의 대상은 `release/salvage-integration-20260908`입니다. 감사 기준 main은 `a1c08fa111cc79efdaaed73ab71cdcff4d3c490c`이며, 이 문서의 통합 완료는 운영 배포 또는 모든 제품 이슈의 완료를 의미하지 않습니다.

## 전체 원본 범위

최초 ref 55개(로컬 14개, 원격 41개, 중복 제거 46개 SHA)를 [source-manifest.json](source-manifest.json)에서 빠짐없이 분류했습니다. 모든 원본 SHA와 파일·patch 근거는 [product audit](product-audit.json), [backup audit](backup-audit.json), [remote audit](remote-audit.json)에 있습니다. 커밋 개수나 이름만으로 누락을 판단하지 않았습니다.

| 분류 | ref 수 | 처리 |
| --- | ---: | --- |
| main과 기능/patch가 동등 | 9 | 중복 재적용 없이 근거 보존 |
| 현재 제품에 복구한 변경 | 7 | 현재 구조에 맞춘 구현과 회귀 검사 |
| 과거 운영 자동화 제안 | 24 | workflow 원문과 의도를 감사 자료로 보관 |
| 백업 실험 | 12 | 6개 원본 snapshot과 실행 가능한 opt-in 하네스로 보관 |
| main/통합 기준 ref | 3 | 기준 SHA 유지 |

55개 분류는 같은 소스의 로컬·원격 ref를 따로 센 수치입니다. 이 중 제품 소스의 실제 복구 그룹은 서로 중복될 수 있습니다.

## 현재 코드로 복구한 내용

- Smart Shape: 최근 획 편집을 Host, 메뉴, 인스펙터, 빠른 명령, 단축키와 연결했습니다. 페이지 변경·잠금·진행 중 입력·변경된 원본·권한 ticket을 검사하며, 취소는 문서를 바꾸지 않습니다. 복사, 클립 저장 및 CRDT 복구에서 원본 획을 유지하고 편집 모드 종료 시 노드 입력 소유권을 해제합니다. 편집 전용 검증은 lazy 경계를 유지합니다.
- 권한·자산: AI 입력/학습 표면에 각각의 허용값을 검사합니다. 자산 refinery는 `repaired` 단계에서 현재 활성 오류만 명시적으로 해결하고 같은 이벤트의 재발 오류는 다시 차단합니다. 자산 stable-ID/URL/admission, Lift3D tab 접근성, CC0 manifest/provider 검증을 복구했습니다.
- 화면·검증: 협업 표시와 view HUD를 공통 sticky 영역에 배치하고 상태 안내가 전체 높이를 따라가게 했습니다. Smart Shape cold recovery/extreme view 검사, fractional touch target 검증, 탐색 시간 측정을 복구했습니다.
- 동시 작업에서 확정된 `a4a7dd1b68a4c4fe499c4b5f3af1010aaeb7022a`까지 원본 14개 커밋도 합쳤습니다. 필터별 불투명도, ICC 곡선 검증, 자산 revision 정리 경합, Rodin 응답 body 취소, 오디오 준비 중 내보내기 취소, 이미지 재생성 실패 시 기존 결과 보존이 포함됩니다. 이후 새로 시작한 기능 작업은 이 snapshot 범위에 포함하지 않습니다.
- 정리 자동화: 다른 열린 PR의 base인 브랜치를 보호하는 `f3557f3d` 수정(통합 내 `52e76936`)을 포함했습니다. 대상 SHA와 열린 base PR을 삭제 직전에 다시 검사하고 API 오류에는 삭제를 중단합니다.
- CI: `7f4bd6ba182e86d4d273bf007a0ba852b3ec45d0`의 3개 workflow 대상/경로 수정과 정책 테스트를 합쳤습니다. 통합 브랜치 및 번들 검사 관련 파일 변경을 감지하며 기존 job/permissions/concurrency는 유지합니다.

## 원본을 보관한 제안과 실험

[실험 README](../../../scripts/experiments/recovered-20260908/README.md)에 명시적 실행 방법, 원본 SHA, 측정값과 제한을 기록했습니다. 원본 patch 6개와 benchmark 결과 4개는 byte 단위로 대조했습니다. CPU 실험 27건은 실행됐지만 inkwash direct/tile 픽셀 차이가 남으므로 픽셀 동등성 성공으로 해석하면 안 됩니다. BG3D/GPU probe는 타입 검사만 수행했습니다.

과거 self-push, 옛 PR 자동 병합, CI 취소 workflow 33개는 remote audit 안에 원문으로 보관했습니다. 현재 workflow로 설치하지 않습니다. `always() && !cancelled()` 제안은 현재 필수 gate 정책에 반하므로 활성화하지 않았습니다.

[구조 제안 감사](architecture-proposals.json)에는 미적용 차이도 적었습니다. shared ESLint 분류를 그대로 추가하면 11개 파일에서 기존 경계 위반 21개가 발생합니다. 현재 기능 복구와 별개로 검토할 제안으로 원본을 보관했습니다. 현재 server re-export 파일의 Node globals 추가는 동작 변화가 없습니다. 광범위한 QA noise regex는 실제 모듈 로드 오류까지 숨기므로 적용하지 않았습니다. Docker context 축소 제안도 원본으로 보존했습니다. 현재 경로를 이미 포함하는 ignore 규칙은 중복 추가하지 않았습니다.

원본 소스 이력을 보존하는 merge는 현재 tree를 바꾸지 않는 보관 작업입니다. ancestry만으로 모든 옛 구현이 활성화됐다고 판단하지 않으며, 위 manifest의 코드·동등성·보관 분류를 함께 확인해야 합니다.

## 검증과 정리

현재 합본 관련 회귀 테스트 777개, CI 정책 테스트 23개, 웹/API TypeScript, 수정 파일 ESLint, Vite production build를 통과했습니다. 별도 opt-in CPU 실험 27개 및 scoped TypeScript/ESLint도 통과했습니다. 정적 번들/CSP 검사의 최종 결과는 verification.json에 기록합니다. 전체 브라우저/GPU 제품 인수 검증은 다른 작업에서 진행 중이며 이 MR의 합본 전체 통과로 주장하지 않습니다.

이미 main에 반영된 PR919 계열 clean worktree 1개와 로컬 브랜치 3개, 원격 CRDT 번들 브랜치 1개를 정리했습니다. worktree의 고유·무시 파일 179개는 압축 후 개별 SHA-256을 재검증했습니다. 원본 SHA는 `refs/cleanup-archive/all-unmerged-integration-20260908/`에 남아 있습니다. 활성 main checkout과 다른 작업의 독립 소스/서비스는 유지합니다. 미반영 소스는 이 통합 MR에 수집한 뒤에도 실제 대상 브랜치 반영 전까지 무조건 병합 완료로 취급하지 않습니다.
