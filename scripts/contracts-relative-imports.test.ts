import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../packages/contracts/src", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const references = sourceFiles(root).flatMap((file) => {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
    const module = statement.moduleSpecifier;
    return module && ts.isStringLiteral(module) ? [{ file, specifier: module.text }] : [];
  });
});

describe("중립 계약 이전 경로 회귀", () => {
  it("모든 상대 import와 re-export가 실제 파일로 연결된다", () => {
    const missing = references.filter(({ file, specifier }) => {
      if (!specifier.startsWith(".")) return false;
      const target = resolve(dirname(file), specifier);
      const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}.json`, resolve(target, "index.ts")];
      if (target.endsWith(".js")) candidates.push(target.slice(0, -3) + ".ts");
      return !candidates.some((candidate) => existsSync(candidate));
    }).map(({ file, specifier }) => `${relative(root, file)} -> ${specifier}`);
    expect(missing).toEqual([]);
  });

  it("자기 자신으로 연결되는 패키지 별칭 재내보내기를 금지한다", () => {
    const selfReferences = references.filter(({ file, specifier }) =>
      specifier === `@toonstudio/contracts/${relative(root, file).replace(/\.ts$/u, "")}`,
    );
    expect(selfReferences).toEqual([]);
  });
});
