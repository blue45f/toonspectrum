# 드로잉 동기화·저장 UX 안정화 검증

상태: `current` — 작업 브랜치의 구현과 로컬 검증 기록이며 운영 배포 완료를 뜻하지 않는다.

기준일: 2026-09-28. 기준 커밋: `b93760b687ee5289d779d747abc0957123949c18`.

## 재현한 데이터 보호 결함

[CRDT 연결 바인딩](../../apps/web/src/domains/creator/live/studio-crdt-room-binding.ts)의 비동기 경계에 연결 세대·전송 모드·전송 권한 종류 확인을 추가했다. 재연결 전 응답은 현재 연결의 승인으로 사용하지 않으며 불확실한 변경은 동일한 updateId로 재전송한다. 기존 서버 프로토콜과 DB 스키마는 변경하지 않았다.

[회귀 테스트](../../apps/web/src/domains/creator/live/studio-crdt-room-binding.test.ts)에 추가한 다섯 사례는 수정 전 모두 실패했고 수정 후 기존 54개와 함께 59개가 통과했다.

| 사례 | 수정 후 보호 동작 |
| --- | --- |
| 피어 전송 중 서버 연결로 전환 | 늦은 피어 영수증을 서버 ACK로 오인하지 않고 보관함 유지 |
| 이전 연결의 지연 스냅샷 | 현재 문서에 적용하지 않고 새 연결에서 다시 동기화 |
| 원고 종료 중 최종 저장 응답 | 종료된 편집기를 저장 완료로 처리하지 않음 |
| 동기화 중 발견한 서버 순번 누락 | 진행 중 요청의 타이머 정리 이후에도 후속 복구 요청 유지 |
| 원고를 닫은 뒤 도착한 승인 | 다음 세션이 복구할 보관함을 늦은 콜백이 삭제하지 않음 |

OPFS 저장 대기 이후에도 연결 준비와 최초 서버 동기화 완료 여부를 다시 확인한다. 서버 승인, 동일 기기 탭 전달, 기기 복구 저장을 하나의 성공 상태로 합치지 않는다.

## 저장·백업 조작성

[실제 저장 상태 패널](../../apps/web/src/domains/creator/StudioDraftOperationSyncAssistant.tsx)에 내보내기 단일 실행, 백업 중 표시, 실패 안내와 재시도를 추가했다. 렌더링 전에 이어진 클릭도 ref 경계로 중복 실행하지 않는다. 패널을 열면 상세 영역으로 키보드 초점을 옮기고 Escape로 닫을 때 트리거로 돌려준다.

패널 최대 높이는 화면 전체가 아니라 실제 상·하단 배치 공간을 기준으로 계산한다. 작은 화면과 가로 화면에서도 패널의 상하단이 화면 밖으로 나가지 않는다. 서버 원고, 로컬 복구 저장 담당 탭, 서버 승인 대기 수의 기존 구분은 유지한다. 정상 동기화 상태에서 주의 패널이 사라지는 기존 정책도 유지한다.

## 시작 안내 이미지 비용

여섯 장면의 작은 미리보기에서 원본 PNG 대신 축소 WebP를 사용한다. 원본과 원본의 출처 기록은 유지했다. [SOURCE.json](../../apps/web/public/brand/studio-canvas-previews/SOURCE.json)에 원본 경로와 SHA-256을 기록하고 [생성 도구](../../scripts/generate-studio-canvas-previews.py)로 재생성할 수 있다.

- 기존 여섯 원본 파일 합계: **24,093,808 bytes**.
- 새 미리보기 합계: **136,488 bytes**.
- 해당 파일 합계 감소: **99.43%**. 전체 페이지 전송량이나 프레임 속도 측정값은 아니다.
- 긴 변 최대 384px, WebP quality 80. 이미지 합계 200,000 bytes 예산과 원본 해시를 테스트한다.

시작 안내 내부에서는 Escape로 안내를 닫을 수 있다. 이미지 디코딩은 비동기로 요청한다. 별도 이미지 생성 서비스, 외부 API, 새 런타임 의존성은 추가하지 않았다.

## 검증 결과

| 검증 | 결과와 범위 |
| --- | --- |
| 캔버스·협업·자동저장·상태 UI·미리보기 | 182개 파일 / 2,295개 테스트 통과 |
| API CRDT 저장소·할당량·체크포인트·문서 스키마 | 6개 파일 / 34개 테스트 통과; 로컬 단위 테스트 |
| 변경 범위 하네스 | `pnpm harness:verify --staged` 통과; Web/API 타입·아키텍처·문서·린트·Secretlint 포함 |
| 프로덕션 번들 | `pnpm run build:bundle` 통과; CSP와 라이선스 후처리 포함 |
| 실제 Chromium 문서 협업 | A→B, B→A 획 전달, 동시 획, undo/redo, 늦게 연 C의 문서 복원 통과 |
| UI 브라우저 검증 | 1440×1000, 390×844, 844×390, 320×568에서 화면 경계·키보드 초점·백업 잠금 통과 |

문서 협업 검증은 기존 명시적 비로그인 정적 프리뷰 세션 픽스처를 사용했다. 문서 전송·브라우저 탭·원고 픽셀은 실제 동작이며 전송을 가짜로 대체하지 않았다. API가 없는 프리뷰이므로 A/B의 최종 상태는 `retrying-owned-preview`, C는 `synced`였다. 예상된 API 502 진단이 있었고 세 탭의 pageerror는 모두 없었다. 이 결과를 인증된 운영 서버 ACK 완료로 해석해서는 안 된다.

UI 검증은 실제 프로덕션 컴포넌트에 로컬 상태 픽스처를 공급한다. 서버 장애 상태의 레이아웃과 조작을 검증할 뿐 서버 자체의 가용성을 증명하지 않는다. 협업 CI에 네 화면 크기 검증과 이미지 예산 검증을 연결했다.

번들에는 외부 `wasm-vips`의 eval 및 `three-vrm`의 `tslFn` 관련 경고가 남아 있다. 해당 의존성 변경은 이 PR에 포함하지 않았다.

구조 공유 테스트의 GC 기반 힙 계측은 기본 실행에서 수행되지 않았다. 프레임 속도, 펜 입력 지연, 전체 앱 메모리가 개선됐다고 주장하지 않는다.

## 재실행

저장소 루트에서 실행한다. 운영 계정·DB·환경변수는 필요하지 않으며 운영 데이터를 변경하지 않는다. UI 검증은 자체 localhost 개발 서버를 열고 종료 시 정리한다.

```sh
pnpm exec vitest run apps/web/src/domains/creator/live apps/web/src/domains/creator/canvas apps/web/src/domains/creator/studio-autosave apps/web/src/domains/creator/studio-page-autosave-runtime.test.ts apps/web/src/domains/creator/StudioDraftOperationSyncAssistant.test.tsx apps/web/src/domains/creator/studio-draft-operation-sync-assistant-model.test.ts scripts/studio-canvas-preview-budget.test.ts --maxWorkers=2
pnpm run build:bundle
TOONSPECTRUM_VERIFY_DIR=/tmp/toonstudio-drawing-browser pnpm exec tsx scripts/verify-studio-collaboration-sync.mts
TOONSPECTRUM_VERIFY_DIR=/tmp/toonstudio-drawing-ui-browser pnpm exec tsx scripts/verify-studio-drawing-sync-ui.mts
pnpm harness:verify
```

이미지 재생성은 Python 3와 Pillow가 있는 개발 환경에서 `python3 scripts/generate-studio-canvas-previews.py`로 실행한다. 검증에 사용한 Pillow는 11.3.0이며 `--check`는 원본 해시와 재생성 결과가 일치하는지 확인한다. CI의 파일 예산 검증에는 Pillow가 필요 없다.

## 남은 검증 경계와 배포

인증된 다중 기기 운영 서버, 장시간 절전·복귀, Safari/iPad의 필압·팜 리젝션, 실제 네트워크 장애·DB 장애 주입은 이번 로컬 검증에 포함하지 않았다. 전체 드로잉 기능의 무결함이나 모든 기기의 성능 향상을 보증하지 않는다.

이 작업은 PR 제출 범위다. 병합과 배포는 저장소 담당자의 CI·리뷰 확인 후 별도 승인한다. DB·환경변수 변경은 없다. 문제 발생 시 담당자가 본 변경 커밋을 되돌리고 동일 검증을 재실행한다. 기존 미승인 outbox와 원본 이미지를 삭제하는 롤백 절차는 사용하지 않는다.
