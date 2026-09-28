import { createServer } from "vite";

import { studioPromoE2eServerConfig } from "./studio-promo-e2e-server-config.mjs";

// 루트의 Vite 설정은 퇴역했다. 웹 앱의 alias·플러그인·공개 경로를 그대로 사용한다.
const server = await createServer(studioPromoE2eServerConfig());
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void server.close().finally(() => process.exit(0)); });
}
