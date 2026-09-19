import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadConfigFromFile, type UserConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const configFile = path.join(repositoryRoot, "vite.config.ts");
const interopModule = path.join(
  repositoryRoot,
  "apps/web/config/react-compiler-runtime-interop.mjs",
);

function aliases(config: UserConfig): Record<string, string> {
  const configuredAliases = config.resolve?.alias;
  if (!configuredAliases || Array.isArray(configuredAliases)) {
    throw new Error("Expected object-form Vite aliases");
  }
  return configuredAliases as Record<string, string>;
}

async function load(command: "build" | "serve"): Promise<UserConfig> {
  const loaded = await loadConfigFromFile(
    { command, mode: command === "serve" ? "development" : "production" },
    configFile,
    repositoryRoot,
  );
  if (!loaded) throw new Error("Missing application Vite config");
  return loaded.config;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vite React Compiler development policy", () => {
  it("uses an explicit worktree cache directory only while serving", async () => {
    vi.stubEnv("TOONSPECTRUM_VITE_CACHE_DIR", ".vite-cache/worktree-a");

    await expect(load("serve")).resolves.toMatchObject({
      cacheDir: path.join(repositoryRoot, ".vite-cache/worktree-a"),
    });
    await expect(load("build")).resolves.not.toHaveProperty("cacheDir");
  });

  it("aliases the CommonJS compiler runtime through a named-export ESM module only while serving", async () => {
    const serveAliases = aliases(await load("serve"));
    expect(serveAliases["react/compiler-runtime"]).toBe(interopModule);
    expect(
      path.normalize(serveAliases["@toonspectrum/react-compiler-runtime-cjs"])
        .endsWith(path.join("react", "compiler-runtime.js")),
    ).toBe(true);

    const buildAliases = aliases(await load("build"));
    expect(buildAliases).not.toHaveProperty("react/compiler-runtime");
    expect(buildAliases).not.toHaveProperty("@toonspectrum/react-compiler-runtime-cjs");

    await expect(readFile(interopModule, "utf8")).resolves.toContain(
      "export const c = runtime.c;",
    );
  });
});
