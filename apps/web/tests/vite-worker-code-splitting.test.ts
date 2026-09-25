import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, loadConfigFromFile } from "vite";
import { expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

it("emits dynamically imported Studio workers as ES modules", async () => {
  const cacheRoot = path.join(repositoryRoot, "node_modules/.cache");
  await mkdir(cacheRoot, { recursive: true });
  const directory = await mkdtemp(path.join(cacheRoot, "toonstudio-worker-split-"));
  try {
    await writeFile(
      path.join(directory, "index.html"),
      '<script type="module" src="/entry.js"></script>',
    );
    await writeFile(
      path.join(directory, "entry.js"),
      'new Worker(new URL("./worker.js", import.meta.url), { type: "module" });',
    );
    await writeFile(
      path.join(directory, "worker.js"),
      'void import("./worker-lazy.js").then(({ value }) => postMessage(value));',
    );
    await writeFile(path.join(directory, "worker-lazy.js"), 'export const value = "ready";');

    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" },
      path.join(repositoryRoot, "apps/web/vite.config.ts"),
      repositoryRoot,
    );
    if (!loaded) throw new Error("Missing application Vite config");
    expect(loaded.config.worker?.format).toBe("es");

    const result = await build({
      configFile: false,
      root: directory,
      logLevel: "silent",
      worker: loaded.config.worker,
      build: {
        write: false,
        copyPublicDir: false,
        minify: false,
      },
    });
    const outputs = (Array.isArray(result) ? result : [result])
      .flatMap((bundle) => ("output" in bundle ? bundle.output : []));
    // Reaching output is the regression contract: the same fixture fails during worker bundling
    // with INVALID_OPTION when Vite's default IIFE format is used.
    expect(outputs.some((output) => output.type === "chunk" && output.isEntry)).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
