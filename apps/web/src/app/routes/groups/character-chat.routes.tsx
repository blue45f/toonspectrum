import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const CharacterChatPage = lazyRetry(
  () => import("@/domains/character-chat/CharacterChatPage").then((module) => ({ default: module.CharacterChatPage })),
  "CharacterChatPage",
);
const CharacterChatManagePage = lazyRetry(
  () => import("@/domains/character-chat/CharacterChatManagePage").then((module) => ({ default: module.CharacterChatManagePage })),
  "CharacterChatManagePage",
);

export const characterChatRoutes = defineAppRoutes([
  { id: "character-chat", path: "/character-chat", element: <CharacterChatPage /> },
  { id: "character-chat-manage", path: "/character-chat/manage", element: <CharacterChatManagePage /> },
]);
