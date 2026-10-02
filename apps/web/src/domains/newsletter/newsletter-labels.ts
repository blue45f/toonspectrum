/**
 * 뉴스레터 라우트 라벨 — `route.newsletter`, `route.newsletterCompose` 키의
 * 한/영 원문을 등록한다. `route-titles.ts`에서 import되어 문서 제목 해석에 쓰인다.
 */

import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "route.newsletter": "뉴스레터",
  "route.newsletterCompose": "뉴스레터 보내기",
});

registerI18nLocaleEntries("en", {
  "route.newsletter": "Newsletter",
  "route.newsletterCompose": "Send a newsletter",
});
