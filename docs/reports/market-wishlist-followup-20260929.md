# 서버 소재 찜 목록 후속 검증

- 상태: **current** — 구현 및 로컬 검증 결과. 운영 배포 완료를 의미하지 않는다.
- 기준일: **2026-09-29**
- 기준 main: `063b9cae7879e1e1d5584d54c9b5f66b2e34a72e`
- 관련 작업: #2179 병합 후 남아 있던 찜 목록 연계 오류.

## 수정한 동작

찜 목록은 저장한 ID를 기존 서버 상세 조회 hook으로 확인한다. 내장·로컬 소재 목록에 없는 서버 소재도 표시하며, 12개씩 추가 조회한다. 비공개·조회 실패·마지막 서버 응답의 캐시를 서로 구분하고, 확인되지 않는 항목을 자동 삭제하지 않는다. 사용자는 재조회하거나 해당 브라우저의 찜 목록에서 직접 제거할 수 있다.

브라우저 저장에 실패하면 선택·제거를 성공한 것처럼 반영하지 않고 오류를 알린다. 찜 목록이 계정 소장 권한이나 현재 기기 설치를 뜻하지 않는다는 안내도 명확히 했다.

실제 브라우저 회귀 검사에서 공유 HTTP 계층의 `AppApiError`에 담긴 404가 기존 `response.status` 검사에 잡히지 않아 오래된 캐시가 표시되는 문제를 재현했다. 단건 상세·릴리스 식별자·내 패키지 이력에서 공통 `httpStatus`를 사용해 404를 `NotFoundError`로 처리한다. 500/503은 삭제로 오인하지 않는다.

## 실행 결과

- 관련 마켓·인증·HTTP 클라이언트 Vitest: **96개 파일 / 911개 테스트 통과**.
- Chromium: **10개 시나리오 통과**. 서버 전용 소재 찜 → 목록 이동 → 새로고침 → 404 → 명시적 제거까지 확인했다.
- 기존 모바일 폭·테마·접근성 검사를 유지하고 390px 찜 목록의 가로 넘침과 화면을 확인했다.
- 초기에 새 테스트가 카드 제목을 heading으로 찾던 선택자 오류를 실제 link 역할로 수정했다. 이후 발견한 404 처리 문제는 코드 수정 후 재검증했다. 타임아웃이나 기대 동작을 완화하지 않았다.

브라우저 검사는 통제된 API fixture를 사용하며 운영 가입·소장·결제의 성공 증거가 아니다. 이번 변경에는 DB 스키마·마이그레이션·접속 정보·환경변수·운영 배포 변경이 없다.

## 재현 및 복구

저장소 루트에서 의존성 설치 후 실행한다.

```sh
pnpm exec vitest run apps/web/src/domains/market/ apps/web/src/domains/auth/ apps/web/src/platform/creator-marketplace-client.test.ts apps/web/src/platform/creator-marketplace-client-boundary.test.ts apps/web/src/platform/api-error.test.ts apps/api/src/server/auth-email.test.ts apps/api/src/modules/auth/ apps/web/src/domains/creator/studio-shell/StudioAssetHubPage.test.tsx --maxWorkers=2
TOONSPECTRUM_MARKET_E2E_PORT=5397 pnpm exec playwright test --config playwright.market.config.ts market-asset-experience.spec.ts
pnpm harness:verify
```

저장소 관리자가 검증 결과를 검토하고 PR을 병합한다. 문제 발생 시 이 변경 커밋만 revert하며 기존 브라우저의 찜 ID 형식은 바뀌지 않는다. 서버 데이터나 DB를 되돌리는 작업은 필요 없다. 운영 반영은 별도 승인·정확한 main SHA·검증·롤백 절차를 따른다.

최종 정적 검증: `pnpm harness:verify`(Lint·Secretlint·경계·웹/API 타입)와 `pnpm verify:i18n-builtins` 통과.
