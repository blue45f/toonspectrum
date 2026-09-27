import { spawnSync } from "node:child_process";
import { accessSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));

// 격리된 CI 컴파일에서도 실제 공유 계약 소스와 배포되는 CommonJS 경계를 함께 검증한다.
const RESOURCE_WORKSPACE_MODULES = [
  { name: "@toonstudio/core/creator-resources", source: "packages/core/src/creator-resources.ts" },
  { name: "@toonstudio/core/reference-query-language", source: "packages/core/src/reference-query-language.ts" },
  { name: "@toonstudio/contracts/creator-resource-workflow", source: "packages/contracts/src/creator-resource-workflow.ts" },
  { name: "@toonstudio/contracts/reference-assets", source: "packages/contracts/src/reference-assets.ts" },
];

export const creatorResourcePackageSources = Object.fromEntries(
  RESOURCE_WORKSPACE_MODULES.map(({ name, source }) => [name, source]),
);

/** Explicit project works with the isolated CI compiler and the workspace compiler. */
export function compileCreatorResourceCases(output) {
  const project = path.join(output, "tsconfig.json");
  const isolatedModuleTypes = path.join(output, "isolated-module-types.d.ts");
  writeFileSync(isolatedModuleTypes, [
    'declare module "fast-xml-parser" {',
    '  export class XMLParser {',
    '    constructor(options?: Record<string, unknown>);',
    '    parse(value: string): unknown;',
    '  }',
    '}',
  ].join("\n"));
  writeFileSync(project, JSON.stringify({
    compilerOptions: {
      strict: true, skipLibCheck: true, target: "es2022", module: "commonjs",
      paths: Object.fromEntries(RESOURCE_WORKSPACE_MODULES.map(({ name, source }) => [
        name, [path.join(root, source)],
      ])),
      lib: ["es2023", "dom", "dom.iterable"], rootDir: root, outDir: output,
    },
    files: [
      isolatedModuleTypes,
      ...["tests/creator-resources-cases.ts", "tests/creator-resource-workflow-cases.ts",
        "tests/creator-workspace-persistence-cases.ts"].map((file) => path.join(root, file)),
    ],
  }));
  const result = spawnSync(process.execPath, [require.resolve("typescript/lib/tsc.js"),
    "--project", project], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Creator resource cases failed strict compilation");

  for (const packageName of ["@toonstudio/core", "@toonstudio/contracts"]) {
    const modules = RESOURCE_WORKSPACE_MODULES.filter(({ name }) => name.startsWith(`${packageName}/`));
    const directory = path.join(output, "node_modules", packageName);
    mkdirSync(directory, { recursive: true });
    const exports = {};
    for (const { name, source } of modules) {
      const subpath = name.slice(packageName.length + 1);
      const emitted = path.join(output, source.replace(/\.ts$/u, ".js"));
      accessSync(emitted);
      const target = path.relative(directory, emitted).split(path.sep).join("/");
      exports[`./${subpath}`] = `./${subpath}.cjs`;
      writeFileSync(path.join(directory, `${subpath}.cjs`), `module.exports = require(${JSON.stringify(target)});\n`);
    }
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: packageName, private: true, exports }));
  }
}
