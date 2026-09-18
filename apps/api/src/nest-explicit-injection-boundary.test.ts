import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const apiSourceRoot = dirname(fileURLToPath(import.meta.url));
const modulesRoot = join(apiSourceRoot, "modules");

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".controller.ts") ? [path] : [];
  });
}

function constructorDependencies(source: string): readonly string[] {
  return [...source.matchAll(/constructor\(([\s\S]*?)\)\s*\{/gu)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((parameters) => /\b(?:private|protected|public)\s+readonly\b/u.test(parameters));
}

const explicitServiceContracts = [
  [
    "creator/creator-role-workspace.service.ts",
    ["@Inject(CreatorRoleWorkspaceRepository)"],
  ],
  [
    "personal-cloud/personal-cloud.service.ts",
    ["@Inject(PersonalCloudRepository)"],
  ],
  [
    "production-collaboration/production-collaboration.service.ts",
    ["@Inject(ProductionCollaborationRepository)"],
  ],
  [
    "production-collaboration/production-integration.service.ts",
    [
      "@Inject(ProductionCollaborationService)",
      "@Inject(ProductionIntegrationRepository)",
    ],
  ],
  [
    "studio-project-graph/studio-project-graph.service.ts",
    [
      "@Inject(StudioProjectGraphRepository)",
      "@Inject(StudioExternalFileBindingRepository)",
    ],
  ],
] as const;

describe("Nest explicit dependency injection boundary", () => {
  it("declares explicit injection tokens for every controller dependency", () => {
    const missing = sourceFiles(modulesRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return constructorDependencies(source)
        .filter((parameters) => !parameters.includes("@Inject("))
        .map(() => path.slice(modulesRoot.length + 1));
    });

    expect(missing).toEqual([]);
  });

  it.each(explicitServiceContracts)(
    "%s keeps its runtime provider tokens explicit",
    (relativePath, tokens) => {
      const source = readFileSync(join(modulesRoot, relativePath), "utf8");
      for (const token of tokens) expect(source).toContain(token);
    },
  );
});
