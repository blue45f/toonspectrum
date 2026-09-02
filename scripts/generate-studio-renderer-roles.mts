/**
 * Generates docs/engines/renderer-roles.md from the machine-checked ledger in
 * packages/studio-engine-registry/src/renderer-roles.ts.
 *
 * The document is never edited by hand: engine roles change in the ledger, and
 * the doc is a projection of it. A drift guard in
 * packages/studio-engine-registry/src/__tests__/renderer-roles.test.ts compares
 * the on-disk file against the same renderer, so a stale doc fails `pnpm test`.
 *
 * Usage:
 *   pnpm generate:studio-renderer-roles   # write
 *   pnpm verify:studio-renderer-roles     # --check, exit 1 when stale
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RENDERER_ROLES_DOC_PATH,
  STUDIO_RENDERER_ROLE_LEDGER,
  renderRendererRoleLedgerMarkdown,
  rendererRoleLedgerInvariants,
} from "../packages/studio-engine-registry/src/renderer-roles";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DOC_ABSOLUTE_PATH = join(REPO_ROOT, RENDERER_ROLES_DOC_PATH);

/** First differing line, so a stale doc says where — not just "differs". */
function summarizeDrift(actual: string, expected: string): string {
  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  const max = Math.max(actualLines.length, expectedLines.length);
  for (let index = 0; index < max; index += 1) {
    const actualLine = actualLines[index];
    const expectedLine = expectedLines[index];
    if (actualLine === expectedLine) continue;
    return [
      `first difference at line ${index + 1}:`,
      `  on disk : ${actualLine === undefined ? "<missing line>" : JSON.stringify(actualLine)}`,
      `  expected: ${expectedLine === undefined ? "<missing line>" : JSON.stringify(expectedLine)}`,
      `(${actualLines.length} lines on disk, ${expectedLines.length} expected)`,
    ].join("\n");
  }
  return "content matches line-by-line but byte lengths differ";
}

function main(): void {
  const checkOnly = process.argv.slice(2).includes("--check");

  const issues = rendererRoleLedgerInvariants(STUDIO_RENDERER_ROLE_LEDGER);
  if (issues.length > 0) {
    console.error("renderer role ledger invariants failed:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }

  const expected = renderRendererRoleLedgerMarkdown(STUDIO_RENDERER_ROLE_LEDGER);

  if (checkOnly) {
    if (!existsSync(DOC_ABSOLUTE_PATH)) {
      console.error(
        `${RENDERER_ROLES_DOC_PATH} is missing. Run: pnpm generate:studio-renderer-roles`,
      );
      process.exitCode = 1;
      return;
    }
    const actual = readFileSync(DOC_ABSOLUTE_PATH, "utf-8");
    if (actual !== expected) {
      console.error(`${RENDERER_ROLES_DOC_PATH} is stale.`);
      console.error(summarizeDrift(actual, expected));
      console.error("Run: pnpm generate:studio-renderer-roles");
      process.exitCode = 1;
      return;
    }
    console.log(
      `${RENDERER_ROLES_DOC_PATH} is up to date `
      + `(${STUDIO_RENDERER_ROLE_LEDGER.length} engines).`,
    );
    return;
  }

  mkdirSync(dirname(DOC_ABSOLUTE_PATH), { recursive: true });
  const unchanged =
    existsSync(DOC_ABSOLUTE_PATH)
    && readFileSync(DOC_ABSOLUTE_PATH, "utf-8") === expected;
  if (!unchanged) writeFileSync(DOC_ABSOLUTE_PATH, expected, "utf-8");
  console.log(
    `${unchanged ? "unchanged" : "wrote"} ${RENDERER_ROLES_DOC_PATH} `
    + `(${STUDIO_RENDERER_ROLE_LEDGER.length} engines).`,
  );
}

main();
