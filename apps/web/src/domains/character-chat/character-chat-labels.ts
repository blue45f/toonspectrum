/**
 * 캐릭터 토크 라우트 라벨 — `route.characterChat`, `route.characterChatManage`
 * 키의 한/영 원문을 등록한다. `route-titles.ts`에서 import되어 문서 제목과
 * 내비게이션 표면(route-manifest)이 같은 원문을 쓰게 한다.
 */

import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "route.characterChat": "캐릭터 토크",
  "route.characterChatManage": "캐릭터 챗 관리",
});

registerI18nLocaleEntries("en", {
  "route.characterChat": "Character Talk",
  "route.characterChatManage": "Manage Character Chats",
});
