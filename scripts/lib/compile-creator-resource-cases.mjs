import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));

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
      paths: {
        "@toonspectrum/core/creator-resources": [
          path.join(root, "packages/core/src/creator-resources.ts"),
        ],
      },
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

  const coreRuntime = path.join(output, "node_modules/@toonspectrum/core");
  mkdirSync(coreRuntime, { recursive: true });
  writeFileSync(path.join(coreRuntime, "package.json"), JSON.stringify({
    name: "@toonspectrum/core",
    private: true,
    exports: { "./creator-resources": "./creator-resources.cjs" },
  }));
  writeFileSync(
    path.join(coreRuntime, "creator-resources.cjs"),
    'module.exports = require("../../../packages/core/src/creator-resources.js");\n',
  );
}
