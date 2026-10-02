/**
 * 에셋 포인트 적립 트리거 — 실제 활동 지점과 원장을 잇는 배선.
 *
 * 호출 전제: 두 트리거 모두 "로그인이 확인된 맥락"에서만 부른다.
 * - 로그인 보너스: 지갑 페이지가 로그인 사용자에게만 자동 청구한다.
 * - 컷츠 게시: CutsStudioPage가 작성자 확인(게스트면 로그인 모달) 뒤에만 부른다.
 * 중복·일일 상한 판정은 원장이 하므로, 트리거를 여러 번 불러도 안전하다.
 */

import { localDateKey } from "./asset-points-ledger";
import { useAssetPointsStore, type EarnResult } from "./asset-points-store";

/** 하루 첫 로그인 보너스. sourceRef에 날짜를 넣어 하루 1회만 인정한다. */
export function awardDailyLoginBonus(now: Date = new Date()): EarnResult {
  return useAssetPointsStore
    .getState()
    .earn("auth.login.daily", `login:${localDateKey(now)}`, now);
}

/** 컷츠 클립 게시 보상. 클립 ID가 sourceRef라 같은 클립 재게시로 중복 적립되지 않는다. */
export function awardCutsClipPublished(clipId: string, now: Date = new Date()): EarnResult {
  return useAssetPointsStore
    .getState()
    .earn("cuts.clip.published", `cuts-clip:${clipId}`, now);
}
