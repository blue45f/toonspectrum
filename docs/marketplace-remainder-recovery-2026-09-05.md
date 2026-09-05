# 마켓 미반영 변경 복구 — 2026-09-05

## 출처와 중복 판정

기준 main은 `089c0b97e4a594690513a2cb6299239faea126a4`이다.

| 원래 작업 | 확인 결과 | 처리 |
| --- | --- | --- |
| PR #741 (`0e8254c9889509fede2a918299ac01dcf6b8cb68`) | 비교 화면·카드·내비게이션은 이미 병합 | 최신 구현 유지 |
| 닫힌 소셜 PR #691 (`1811b10153eba0aa8fd55fdda3f0e28b868592b8`) | 변경 35개 경로 중 23개 동일, 10개는 main의 후속 수정, 2개 삭제도 반영됨 | 오래된 브랜치 재병합하지 않음 |
| 같은 소셜 작업의 이전 PR #684 | #691로 이어진 이전 단계 | 중복 복구 제외 |
| `feat/marketplace-engagement-trust-20260905` | 기준 main 대비 고유 변경은 일회성 소스 내보내기 workflow 한 개 | 제품 변경이 아니므로 제외, 원본 브랜치는 보존 |
| `c69700728b7ed6f15bf73b06fbbdb5ef91ec66f7`의 deferred trust/parity 작업 | #741에서 미반영/제외된 UI·DB 변경 확인 | 아래 변경을 최신 main에 맞춰 복구 |

소셜 35개 경로의 실제 비교는 GitHub Actions run `33965786421`에서 수행했다. main의 변경 내용은 import 정리, 안정적인 빈 배열, 명시적 접근성 이름, WebView의 BroadcastChannel 생성 실패 방어였다. 댓글·리뷰·인증 경계를 예전 코드로 되돌리지 않는다.

## 복구 범위

### 3D 계정 라이브러리와 신고 증거의 제약 일치

공개 catalog는 migration 0035에서 `3d-asset`을 허용했지만 계정 라이브러리와 신고 증거의 CHECK는 기존 6종만 허용했다. 이 작업은 두 Drizzle 선언에 7번째 종류를 추가하고 새 migration 0037을 등록한다. 과거 SQL/checksum은 수정하지 않는다.

0037은 대체 CHECK 추가 → 기존 행 검증 → 이전 CHECK 제거 → 원래 이름 복원 순서다. 신고의 JSON 객체 형태, 리소스 ID, hash, byte size, license, schemaVersion 1/2/3, 배급자·패키지·moderationRevision·reportEpoch 일치 조건과 `IS TRUE`는 유지한다. 라이브러리·신고의 기존 행이나 계정 소유권을 변경하지 않는다.

`verify-marketplace-3d-parity.mjs`는 명시적 opt-in, loopback, test 이름, 빈 public schema를 요구한다. 운영/기존 DB를 초기화하는 경로는 없다. 과거 migration을 실제 PostgreSQL에 적용하고 스키마 검증된 7종 starter manifest를 게시 릴리스로 만든다. 실제 릴리스에 연결된 계정 보관함과 v3 신고에서 3D kind CHECK 거절을 재현한 뒤 0037 적용 후 성공을 검증한다. 그 외 잘못된 증거·소스 연결은 계속 거절돼야 하며 이전 행, 무관한 제약과 모든 트리거 정의도 그대로여야 한다.

신규 신고는 0034의 v3-only 트리거를 유지한다. v1/v2는 새 신고로 허용하는 것이 아니라 과거 증거의 저장 호환성이다. 세 버전의 CHECK 자체는 원본 DB에서 복제한 임시 계약 테이블에서 별도로 실행하며, 실제 테이블의 v1/v2 신규 INSERT는 계속 거절되는지 검사한다. 실제 테이블의 트리거나 제약을 비활성화하는 경로는 없다.

### 공개 정보와 실제 동작에 맞춘 UI

- 상세 화면에서 실제 비교 선택 저장소로 이어지는 비교 버튼을 복구한다.
- 판매자 관리의 고정 4.9 평점을 패키지 항목 수와 manifest 크기로 대체한다.
- 기술·사용권 배지는 명시적으로 제공된 값만 표시한다. GLB, 최적화, 은선, NoAI, 팀/상업 사용권을 기본값으로 만들지 않는다.
- 상세 화면의 전면 상업 허용·저작권 분쟁 안전·학습 크롤링 차단·1초 배치 보증을 실제 게시 라이선스와 호환 선언·AI 공개값·출처 정보로 대체한다.
- `containsAi: false`는 AI 미포함 공개값이지 독립 감정이나 NoAI 사용권이 아니다.
- 종류 이름으로 파일 형식을 추정하지 않는다. 모든 전달 항목이 portable-json일 때만 해당 형식을 표시한다.
- 기존 CSS 도형 화면은 실제 에셋 메시를 그리는 엔진이 아니다. 이를 렌더 모드 예시로 명시하고 가짜 메시 통계를 제거한다. 실제 에셋 확인 링크는 기존 Studio resource deep link를 사용한다. 단지 대화상자를 닫고 배치 완료를 암시하지 않는다.

## 검증

전용 `.github/workflows/marketplace-integrity.yml`은 실제 marketplace/API/계약 테스트, strict lint, 0037 전후 PostgreSQL 검증, 기존 marketplace repository 통합 검증, workspace typecheck, production build 및 workspace builds를 실행한다.

기준 main의 일반 CI에는 `CI_CORE_BYPASS`가 설정돼 있었다. 이 작업은 그 설정을 변경하지 않으며 일반 `core`의 녹색 표시를 검증 증거로 간주하지 않는다. 전용 integrity job에는 해당 bypass 분기가 없다. 최종 통과 여부는 PR의 해당 실행 결과로 확인한다.

복구용 patcher와 두 임시 workflow는 제품 diff에서 제거한다. 검증 결과 파일·벤치마크 측정값·무관한 기능 파일은 복구에 포함하지 않는다.

## 배포 경계

코드 병합과 운영 DB migration 적용/사이트 배포는 별개다. 이번 작업은 운영 DB에 접속하거나 데이터를 변경하지 않는다. 운영 적용은 기존 pending-only migration 절차와 연결된 release 검증을 따라야 한다. 두 CHECK 교체의 테이블 잠금과 validation 소요 시간은 운영 데이터 규모에 따라 별도로 확인한다.

결제·정산·새 알림 서비스는 미병합 코드로 발견되지 않았으므로 구현된 것처럼 복구하거나 완료로 표시하지 않는다.
