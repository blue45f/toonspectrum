import assert from "node:assert/strict";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

/** Inspect emitted CommonJS calls, not comments or example strings. */
export function runtimeSpecifiers(source, filename = "compiled.js") {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const specifiers = new Set();
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "require" && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return [...specifiers];
}

function compiledFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) return compiledFiles(filename);
    return entry.isFile() && entry.name.endsWith(".js") ? [filename] : [];
  }).sort();
}

/**
 * TypeScript paths do not rewrite emitted imports. Resolve local/workspace
 * dependencies with plain Node and require them to stay inside Vercel's dist
 * includeFiles boundary. A source file present in CI must not mask an omitted
 * production dependency. Third-party packages are traced separately by Vercel.
 */
export function verifyCompiledApiImports(directory) {
  const root = realpathSync(resolve(directory));
  const files = compiledFiles(root);
  assert.ok(files.length > 0, "API build contains no compiled JavaScript");
  const failures = [];
  let importsChecked = 0;
  for (const filename of files) {
    const requireFromFile = createRequire(filename);
    for (const specifier of runtimeSpecifiers(readFileSync(filename, "utf8"), filename)) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@toonspectrum/")) continue;
      importsChecked += 1;
      try {
        const target = realpathSync(requireFromFile.resolve(specifier));
        const targetRelative = relative(root, target);
        const outside = targetRelative === ".." || targetRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
          || isAbsolute(targetRelative);
        if (outside || [".ts", ".tsx", ".mts", ".cts"].includes(extname(target))) {
          failures.push(`${relative(root, filename)}: ${specifier} resolves outside compiled output (${target})`);
        }
      } catch (error) {
        failures.push(`${relative(root, filename)}: ${specifier} cannot resolve (${error.code ?? "unknown"})`);
      }
    }
  }
  assert.equal(failures.length, 0, `API runtime imports are not deployment-safe:\n${failures.join("\n")}`);
  return { filesChecked: files.length, importsChecked };
}

export function smokeCompiledCreatorResources(directory) {
  const filename = resolve(directory, "apps/api/src/modules/creator-resources/creator-resources.module.js");
  const requireFromFile = createRequire(filename);
  // Do not bootstrap Nest, run lifecycle hooks, contact providers, or open a DB.
  const loaded = requireFromFile(filename);
  assert.equal(typeof loaded.CreatorResourcesModule, "function");
  assert.equal(typeof loaded.CreatorResourcesController, "function");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const directory = fileURLToPath(new URL("../apps/api/dist/", import.meta.url));
  const result = verifyCompiledApiImports(directory);
  smokeCompiledCreatorResources(directory);
  console.log(`API runtime import guard passed: ${result.filesChecked} compiled files, ${result.importsChecked} local/workspace imports; native resource-module load passed.`);
}
