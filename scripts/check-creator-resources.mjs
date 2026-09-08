/** Run the same regression cases as Vitest without loading the unrelated Studio graph. */
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), "toonstudio-resources-"));
let failed = 0;
try {
  const tsc = require.resolve("typescript/lib/tsc.js");
  const result = spawnSync(process.execPath, [tsc, "--strict", "--skipLibCheck", "--target", "es2022", "--module", "commonjs", "--lib", "es2023,dom,dom.iterable", "--outDir", output, "tests/creator-resources-cases.ts", "tests/creator-resource-workflow-cases.ts", "tests/creator-workspace-persistence-cases.ts"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Creator resources typecheck failed");
  const { creatorResourceCases } = require(path.join(output, "tests/creator-resources-cases.js"));
  const { creatorResourceWorkflowCases } = require(path.join(output, "tests/creator-resource-workflow-cases.js"));
  const { creatorWorkspacePersistenceCases } = require(path.join(output, "tests/creator-workspace-persistence-cases.js"));
  const cases = [...creatorResourceCases, ...creatorResourceWorkflowCases, ...creatorWorkspacePersistenceCases];
  for (const testCase of cases) {
    try { await testCase.run(); console.log(`PASS ${testCase.name}`); }
    catch (error) { failed++; console.error(`FAIL ${testCase.name}`, error); }
  }
  console.log(`${cases.length - failed}/${cases.length} creator-resource cases passed.`);
} catch (error) { failed++; console.error(error); }
finally { rmSync(output, { recursive: true, force: true }); }
if (failed) process.exitCode = 1;
