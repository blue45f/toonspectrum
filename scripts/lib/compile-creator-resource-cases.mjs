import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));

/** Explicit project works with the isolated CI compiler (TS 5) and the workspace compiler (TS 6). */
export function compileCreatorResourceCases(output) {
  const project = path.join(output, "tsconfig.json");
  writeFileSync(project, JSON.stringify({
    compilerOptions: {
      strict: true, skipLibCheck: true, target: "es2022", module: "commonjs",
      lib: ["es2023", "dom", "dom.iterable"], rootDir: root, outDir: output,
    },
    files: ["tests/creator-resources-cases.ts", "tests/creator-resource-workflow-cases.ts",
      "tests/creator-workspace-persistence-cases.ts"].map((file) => path.join(root, file)),
  }));
  const result = spawnSync(process.execPath, [require.resolve("typescript/lib/tsc.js"),
    "--project", project], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Creator resource cases failed strict compilation");
}
