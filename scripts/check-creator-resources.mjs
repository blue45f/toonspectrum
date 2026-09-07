/** Run the same regression cases as Vitest without loading the unrelated Studio graph. */
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileCreatorResourceCases } from "./lib/compile-creator-resource-cases.mjs";

const require = createRequire(import.meta.url);
const output = mkdtempSync(path.join(tmpdir(), "toonstudio-resources-"));
let failed = 0;
try {
  compileCreatorResourceCases(output);
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
