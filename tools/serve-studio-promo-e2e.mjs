import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { createServer } from "vite";

const port = Number(process.env.STUDIO_PROMO_E2E_PORT ?? 5353);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid promo E2E port");
const workspace = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12);
const server = await createServer({
  // Isolate worktrees without replacing or repairing their shared dependencies.
  cacheDir: path.join(tmpdir(), `toonstudio-promo-${workspace}`, "node_modules/.vite"),
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void server.close().finally(() => process.exit(0)); });
}
