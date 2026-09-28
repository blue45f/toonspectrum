import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

/** 호출 디렉터리와 무관하게 사용자 웹의 실제 Vite 설정을 사용한다. */
export function studioPromoE2eServerConfig(environment = process.env) {
  const port = Number(environment.STUDIO_PROMO_E2E_PORT ?? 5353);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("홍보영상 E2E 포트는 1024~65535의 정수여야 합니다.");
  }
  const workspace = createHash("sha256").update(repositoryRoot).digest("hex").slice(0, 12);
  return {
    configFile: path.join(repositoryRoot, "apps/web/vite.config.ts"),
    root: path.join(repositoryRoot, "apps/web"),
    cacheDir: path.join(tmpdir(), `toonstudio-promo-${workspace}`, "node_modules/.vite"),
    server: { host: "127.0.0.1", port, strictPort: true },
  };
}
