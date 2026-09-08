# 2026-09-08 미반영 작업 통합 근거

미반영 작업은 `codex/integrate-unmerged-20260908`에 수집한 뒤 MR #960을 통해 `release/salvage-integration-20260908`에 병합됐습니다. 최종 main 병합용 MR은 이 release 브랜치를 사용합니다. 감사 기준 main은 `a1c08fa111cc79efdaaed73ab71cdcff4d3c490c`이며, 이 문서의 통합 완료는 운영 배포 또는 모든 제품 이슈의 완료를 의미하지 않습니다.

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
- 내보내기 후속 수정: `3fdc520c23e161e0f7b7e19fefb27dd9b4373bee`의 이미지 필터 완료 대기와 `376a210a6bb59749a5fd68d6db6ad742efda5aef`의 확정된 잉크 flush, React 문서 반영 대기, PSD 비동기 캡처 수명 보장을 추가 수집했습니다. 통합 검토에서 발견한 중첩 clip/multiply 캐시 문제도 `2f6c0baa8`에서 수정했습니다. 현재 이미지 요청과 실제 그리기가 일치하고 안쪽부터 바깥쪽 캐시까지 갱신된 경우에만 캡처 준비 완료를 알립니다. 같은 React commit의 부모 캐시 등록과 자식 확인 순서도 회귀 검사로 보장합니다.
- 정리 자동화: 다른 열린 PR의 base인 브랜치를 보호하는 `f3557f3d` 수정(통합 내 `52e76936`)을 포함했습니다. 대상 SHA와 열린 base PR을 삭제 직전에 다시 검사하고 API 오류에는 삭제를 중단합니다.
- CI: `7f4bd6ba182e86d4d273bf007a0ba852b3ec45d0` 및 최종 후속 `3fedb55c33488add4931ab4ffe9c8c7672ffc209`의 workflow 대상/경로 수정과 정책 테스트를 합쳤습니다. 통합 브랜치 및 번들 검사 관련 파일 변경을 감지하며 기존 job/permissions/concurrency는 유지합니다.
- 메뉴 검사: 이전 MR head의 `manual-browser`가 브라우저 실행 전에 실패한 원인은 복구한 `brush/correct-current-stroke`의 메뉴 명세 누락이었습니다. `3efb99121`에서 명세와 등록 수를 수정했고 동일한 6개 suite의 73개 검사가 통과했습니다.
- 도형 브라우저 검사: 새 사용자 기본 설정에서 숨겨진 확대·회전 도구를 검사 스크립트가 바로 클릭해 실패하던 문제를 `fd4277582`에서 수정했습니다. 더보기의 실제 도구 선택 UI로 표시한 뒤 기존 극단 확대·회전 검사를 유지합니다. 변경 helper 타입/ESLint, 표시·메뉴 상태 8가지, 기존 메뉴 React 검사 3개를 확인했습니다. 전체 shapes 브라우저의 최종 head 결과는 별도 확인 대상입니다.

## 원본을 보관한 제안과 실험

[실험 README](../../../scripts/experiments/recovered-20260908/README.md)에 명시적 실행 방법, 원본 SHA, 측정값과 제한을 기록했습니다. 원본 patch 6개와 benchmark 결과 4개는 byte 단위로 대조했습니다. CPU 실험 27건은 실행됐지만 inkwash direct/tile 픽셀 차이가 남으므로 픽셀 동등성 성공으로 해석하면 안 됩니다. BG3D/GPU probe는 타입 검사만 수행했습니다.

과거 self-push, 옛 PR 자동 병합, CI 취소 workflow 33개는 remote audit 안에 원문으로 보관했습니다. 현재 workflow로 설치하지 않습니다. `always() && !cancelled()` 제안은 현재 필수 gate 정책에 반하므로 활성화하지 않았습니다.

[구조 제안 감사](architecture-proposals.json)에는 미적용 차이도 적었습니다. shared ESLint 분류를 그대로 추가하면 11개 파일에서 기존 경계 위반 21개가 발생합니다. 현재 기능 복구와 별개로 검토할 제안으로 원본을 보관했습니다. 현재 server re-export 파일의 Node globals 추가는 동작 변화가 없습니다. 광범위한 QA noise regex는 실제 모듈 로드 오류까지 숨기므로 적용하지 않았습니다. Docker context 축소 제안도 원본으로 보존했습니다. 현재 경로를 이미 포함하는 ignore 규칙은 중복 추가하지 않았습니다.

원본 소스 이력을 보존하는 merge는 현재 tree를 바꾸지 않는 보관 작업입니다. ancestry만으로 모든 옛 구현이 활성화됐다고 판단하지 않으며, 위 manifest의 코드·동등성·보관 분류를 함께 확인해야 합니다.

## 검증과 정리

최종 제품 코드 `7b215fb67a176056aae68a1d212c474f070a6038`에서 56개 파일의 회귀 테스트 965개(CI 정책 및 메뉴 검사 포함), 웹 TypeScript, 수정 파일 104개의 ESLint, Vite production build, 라이선스 고지, 정적 Studio 번들 및 CSP 검사를 통과했습니다. API TypeScript는 앞선 합본에서 통과했고 이후 `apps/api`와 `packages/core` 차이가 없음을 확인했습니다. 별도 opt-in CPU 실험 27개 및 scoped TypeScript/ESLint도 통과했습니다. 실행 기록과 SHA-256은 [verification.json](verification.json)에 있습니다. 최종 빌드 도중 제품 HEAD는 바뀌지 않았으며, dist 파일 10,615개의 해시 manifest도 남겼습니다. 이후 감사 문서 및 별도 검증 스크립트를 갱신할 수 있으며 제품 코드 차이는 따로 확인합니다.

전체 합본의 실제 브라우저/GPU 인수 검증과 최종 원격 head의 CI는 별도 확인 대상입니다. MR #960은 2026-09-08 14:43:09 UTC에 `557dd3fa419c615de70950d6d544c51b03bfb5fb`로 실제 병합됐으며, 병합 tree가 검증한 제품 코드 `7b215fb6`와 동일함을 확인했습니다. 이 병합은 다른 동시 작업에서 수행됐습니다. main 대상 MR의 최종 CI와 실제 브라우저/GPU 검증 완료 여부는 별도로 보고합니다. 이전 head의 일부 CI 통과를 최종 head의 통과로 재사용하지 않습니다.

먼저 main 반영이 확인된 PR919 계열 clean worktree 1개를 제거했습니다. worktree의 고유·무시 파일 179개는 압축 후 개별 SHA-256을 재검증했습니다. 이어 최초 범위의 소스 ref를 통합 원격에 보존하고 로컬 브랜치 13개와 원격 브랜치 39개를 정리했습니다. 이 수치는 중복 없이 센 최초 소스 ref이며, 모두 main에 병합됐다는 뜻은 아닙니다. 미반영 소스의 제품 변경·검토 자료·원본 이력을 한 통합 MR에서 보존한 뒤 원래 이름의 브랜치를 정리했습니다. 원본 46개 SHA가 통합 이력에 도달 가능하며 `refs/cleanup-archive/all-unmerged-integration-20260908/`에서도 복구할 수 있습니다.

원래 저장소에 등록된 worktree는 현재 작업 중인 기본 checkout 1개만 남았습니다. 이후 시작된 활성 브랜치와 다른 작업의 독립 소스/QA 서비스는 유지합니다. 최종 삭제 결과는 [cleanup-verification.json](cleanup-verification.json)에 기록했습니다. 이 통합 MR의 생성·수집 완료와 실제 대상 브랜치 병합 완료를 구분합니다.

## 감사 중 도착한 main 변경

MR #959가 감사 도중 main `dce667137fca4849ecd5536fb4e8e9e3e54f4fa3`에 병합됐습니다. 이 변경의 Smart Shape 연결, AI 용도별 권한 및 자산 검사 의도는 이 통합 코드에 이미 포함돼 있습니다. 대체 Host 구현을 다시 설치하면 copy/snapshot 처리와 최신 원본·ID·진행 중 입력 검사가 약해지므로 현재 `useStudioSmartShapeEditing`을 유지했습니다. 고유한 메뉴 미연결 안내와 Quick Shape 버튼 호출·터치 크기 회귀만 좁게 복구했습니다. 새 main과의 source 비교는 [late-main-comparison.json](late-main-comparison.json)에 보관합니다. 최초 55 ref 감사 시점과 이후 변경 시점을 구분합니다.

## 삭제한 작업의 손실 재감사

[손실 감사](loss-audit.json)는 main 반영 여부, 통합본 수집 여부, 원본 복구 가능성을 구분합니다. 이전 최초 74개 ref와 당시 archive 71개, 전체 cleanup archive 326개에서 중복을 제외한 원본 커밋 134개를 모두 읽을 수 있었습니다. 통합본의 조상이 아닌 31개는 patch 동등성, 후속 구현, 원본 실험/운영 기록으로 전부 분류했고 추가 수집이 필요한 제품 변경은 찾지 못했습니다.

21개 dirty 워킹트리의 실제 변경 568건(패치 537건과 미추적 파일 31건)도 원본 해시와 대조해 복원했습니다. 당시 목록에 빠졌던 3건도 실제 패치에서 찾아 포함했습니다. 경로 이동을 고려한 양쪽 미존재 소스와 복구 불가능한 보존 payload는 0건입니다. 현재 main에 원본 그대로 있는 370건, 유지된 삭제 7건, 통합본 evidence에만 있는 과거 benchmark 2건, 후속 변경/재구현/명시 보관으로 분류한 189건을 구분합니다. 나중에 추가된 52개 worktree 목록과 기존 25개 목록의 포함 관계 및 후속 dirty 58파일도 확인했습니다.

생성 아티팩트 221개 중 219개는 현재 main과 통합본에 원본 그대로 있고, 나머지 로그 2개는 검증한 압축본에 보존돼 있습니다. 압축본 5개의 전체 해시와 내부 342개 항목, 갤러리 입력 120개의 존재 및 대응 가능한 manifest 해시 69개도 확인했습니다. 검토한 소스·자산·카탈로그·증거에서 설명되지 않는 고유 작업 소실은 발견하지 못했습니다.

한계도 남깁니다. 정리된 빌드·캐시 경로 7개(당시 9,238파일)는 과거 파일별 해시가 없어 내부 모든 바이트의 동일 복구를 증명할 수 없습니다. 또한 후속 변경된 모든 기능을 다시 실행해 과거와의 완전한 의미 동일성을 확인한 것은 아닙니다. 의도적으로 보관한 운영/구조 제안과 benchmark를 현재 제품 기능으로 모두 활성화했다고 주장하지 않습니다.

사용자가 마지막 두 소스 브랜치의 통합도 요청한 뒤 `ci-salvage-followup`의 9cdd7b96와 `issues-parallel-fixes`의 a4a7dd1b가 release 2797e837의 조상임을 확인했습니다. 두 원격 이름도 정확한 SHA를 archive에 보존하고 lease가 일치하는 경우에만 삭제했습니다. 확인 시점 원격에는 main과 release/salvage-integration-20260908만 남았습니다. main 병합용 MR은 [#961](https://github.com/blue45f/toonspectrum/pull/961)입니다.
