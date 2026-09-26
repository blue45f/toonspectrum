import path from "node:path";

import { loadConfigFromFile } from "vite";
import { expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

it("emits module workers so code-split Studio worker graphs can build", async () => {
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "production" },
    path.join(root, "apps/web/vite.config.ts"),
    root,
  );
  if (!loaded) throw new Error("Missing application Vite config");
  expect(loaded.config.worker?.format).toBe("es");
});
