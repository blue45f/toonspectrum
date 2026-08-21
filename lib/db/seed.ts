/**
 * 시드 진입점 shim — 실제 구현은 apps/api/src/db/seed.ts 로 이전됨.
 *
 * 루트 package.json 의 `db:seed` 스크립트(`tsx lib/db/seed.ts`)는 Hokusai 무결성 게이트의
 * 봉인된 정책 입력(scripts/verify-studio-hokusai-wasm.mjs POLICY_INPUT_FILES)이라 수정할 수 없다.
 * 그래서 경로만 보존하는 얇은 재-export 를 남긴다. 새 코드는 apps/api/src/db/seed 를 직접 쓸 것.
 */
import "../../apps/api/src/db/seed";
