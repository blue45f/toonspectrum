import { pixelHash } from "../../bench/metrics/render-metrics";

import type { LabImage } from "../../engine/core/types";

/**
 * 결정성 해시. 리포트의 `pixelHash`·A/B 비교의 `hashA/hashB`와 같은 함수(fnv1a64, 크기 헤더 포함)를 써서
 * 갤러리 카드·캔버스 캡션·리포트의 해시가 같은 입력에서 항상 일치한다.
 */
export function pixelHashOf(img: LabImage): string {
  return pixelHash(img);
}
