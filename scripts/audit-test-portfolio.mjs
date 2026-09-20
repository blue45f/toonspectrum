#!/usr/bin/env node
/** Read-only census. Similarity and source-contract flags are review candidates, not deletion decisions. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.(?:py|go|rs)$)/u;
const JS_TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const printer = ts.createPrinter({ removeComments: true });
function callRoot(node) {
  while (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) node = node.expression;
  return ts.isIdentifier(node) ? node.text : "";
}
function hasModifier(node, modifier) {
  while (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node) && node.name.text === modifier) return true;
    node = node.expression;
  }
  return false;
}
export function inspectTestSource(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = []; const cases = []; const matchers = new Set();
  let skippedDeclarations = 0; let exclusiveDeclarations = 0; let conditionalDeclarations = 0; let sourceReads = 0;
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause?.isTypeOnly) imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      const root = callRoot(node.expression);
      if (["it", "test", "describe"].includes(root) &&
          !["beforeEach", "afterEach", "beforeAll", "afterAll", "step", "use", "extend"].some((name) => hasModifier(node.expression, name))) {
        const callback = node.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
        if (!callback && hasModifier(node.expression, "todo")) skippedDeclarations++;
        if (callback) {
          if (["skipIf", "runIf"].some((name) => hasModifier(node.expression, name))) conditionalDeclarations++;
          if (hasModifier(node.expression, "skip") || hasModifier(node.expression, "todo")) skippedDeclarations++;
          if (hasModifier(node.expression, "only")) exclusiveDeclarations++;
          if (root !== "describe" && !hasModifier(node.expression, "describe")) {
            const label = node.arguments[0];
            const body = printer.printNode(ts.EmitHint.Unspecified, callback.body, source);
            cases.push({ title: ts.isStringLiteralLike(label) ? label.text : "<dynamic>",
              line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              bodyHash: sha256(body), bodyLength: body.length });
          }
        }
      }
      if (ts.isPropertyAccessExpression(node.expression) && /^(?:to|not)/u.test(node.expression.name.text)) matchers.add(node.expression.name.text);
      if (/^(?:readFileSync|readFile|readStudio.*Source)$/u.test(root)) sourceReads++;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const localImports = imports.filter((name) => name.startsWith(".") || name.startsWith("@/") || name.startsWith("@toonspectrum/"));
  return { file, lines: text.split("\n").length, bytes: Buffer.byteLength(text),
    fileHash: sha256(text), imports, localImports, caseDeclarations: cases.length,
    skippedDeclarations, exclusiveDeclarations, conditionalDeclarations, sourceReads, matchers: [...matchers].sort(), cases,
    environment: /@(?:vitest|jest)-environment\s+(\S+)/u.exec(text)?.[1] ?? "node",
    sourceContractCandidate: sourceReads > 0 &&
      (matchers.has("toContain") || matchers.has("toMatch")) &&
      localImports.every((name) => /read.*source|repo-paths|lib\/.*source/iu.test(name)),
    parseErrors: source.parseDiagnostics.length };
}
function duplicates(entries, key) {
  const groups = new Map();
  for (const entry of entries) {
    const id = entry[key]; const group = groups.get(id) ?? [];
    group.push(entry); groups.set(id, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
export function auditPortfolio(root = ROOT) {
  const files = [...new Set(execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean))];
  const tests = files.filter((file) => TEST_FILE.test(file)).sort();
  const inspected = tests.filter((file) => JS_TEST.test(file)).map((file) => inspectTestSource(file, readFileSync(resolve(root, file), "utf8")));
  const cases = inspected.flatMap((entry) => entry.cases.filter((item) => item.bodyLength >= 120)
    .map((item) => ({ file: entry.file, ...item })));
  const bodyCandidates = duplicates(cases, "bodyHash").filter((group) => new Set(group.map((item) => item.file)).size > 1);
  const bucket = (file) => file.startsWith("apps/web/src/domains/creator/") ? "Studio" :
    file.startsWith("apps/web/") ? "Web outside Studio" : file.startsWith("apps/api/") ? "API" : file.split("/")[0];
  const domains = {};
  for (const entry of inspected) {
    const name = bucket(entry.file);
    const group = domains[name] ??= { files: 0, lines: 0, caseDeclarations: 0, sourceContractCandidates: 0 };
    group.files++; group.lines += entry.lines; group.caseDeclarations += entry.caseDeclarations;
    group.sourceContractCandidates += Number(entry.sourceContractCandidate);
  }
  return { generatedAt: new Date().toISOString(),
    headSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    scope: "Tracked and non-ignored working-tree files; static declarations are not runtime case counts.",
    limitations: ["Source-contract classification is conservative and heuristic.",
      "Identical callback bodies may depend on different imports, fixtures or mocks; review before consolidation.",
      "Skipped declarations do not expand describe.skip descendants or parameterized cases.",
      "Python/Go/Rust files are inventoried, not parsed. Runtime coverage and mutation scores are not inferred."],
    summary: { allTestFiles: tests.length, parsedJsTsFiles: inspected.length,
      otherTestFiles: tests.filter((file) => !JS_TEST.test(file)),
      testLines: inspected.reduce((total, entry) => total + entry.lines, 0),
      staticCaseDeclarations: inspected.reduce((total, entry) => total + entry.caseDeclarations, 0),
      sourceContractCandidates: inspected.filter((entry) => entry.sourceContractCandidate).length,
      skippedDeclarations: inspected.reduce((total, entry) => total + entry.skippedDeclarations, 0),
      exclusiveDeclarations: inspected.reduce((total, entry) => total + entry.exclusiveDeclarations, 0),
      conditionalDeclarations: inspected.reduce((total, entry) => total + entry.conditionalDeclarations, 0),
      parseErrors: inspected.reduce((total, entry) => total + entry.parseErrors, 0), domains },
    exactFileDuplicates: duplicates(inspected, "fileHash").map((group) => group.map((entry) => entry.file)),
    bodySimilarityCandidates: bodyCandidates, files: inspected };
}
export function renderAudit(report) {
  const { summary } = report;
  return ["# Test portfolio census", "", `HEAD: ${report.headSha}`, report.scope, "",
    `JS/TS files: ${summary.parsedJsTsFiles}; lines: ${summary.testLines}; static case declarations: ${summary.staticCaseDeclarations}.`,
    `Source-contract candidates: ${summary.sourceContractCandidates}; exact duplicate file groups: ${report.exactFileDuplicates.length}; cross-file body candidate groups: ${report.bodySimilarityCandidates.length}.`, "",
    "| Area | Files | Lines | Static cases | Source-contract candidates |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...Object.entries(summary.domains).map(([name, group]) => `| ${name} | ${group.files} | ${group.lines} | ${group.caseDeclarations} | ${group.sourceContractCandidates} |`),
    "", "## Limitations", ...report.limitations.map((item) => `- ${item}`), "",
    "## Largest files", ...[...report.files].sort((a, b) => b.lines - a.lines).slice(0, 20)
      .map((entry) => `- ${entry.file}: ${entry.lines} lines / ${entry.caseDeclarations} declarations`), "",
    "Full per-file evidence, skips and candidate locations are in the adjacent JSON report.", ""].join("\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1) throw new Error("Usage: node scripts/audit-test-portfolio.mjs [output.json]");
    const target = resolve(args[0] ?? resolve(ROOT, "artifacts/ci-test-audit/portfolio.json"));
    if (!target.endsWith(".json")) throw new Error("Output path must end with .json");
    const report = auditPortfolio();
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(target.replace(/\.json$/u, ".md"), renderAudit(report));
    console.log(renderAudit(report));
    if (report.summary.parseErrors > 0) process.exitCode = 1;
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
