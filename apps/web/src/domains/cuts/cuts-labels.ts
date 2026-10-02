/**
 * 컷츠 라우트 라벨 — `route.cuts`, `route.cutsStudio` 키의 한/영 원문을 등록한다.
 * `route-titles.ts`에서 import되어 문서 제목 해석에 쓰인다.
 */

import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "route.cuts": "컷츠",
  "route.cutsStudio": "컷츠 클립 만들기",
  "route.cutsRewards": "컷츠 리워드 펀드 정산",
});

registerI18nLocaleEntries("en", {
  "route.cuts": "Cuts",
  "route.cutsStudio": "Create a Cuts clip",
  "route.cutsRewards": "Cuts reward fund settlement",
});
