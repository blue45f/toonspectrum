import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function walk(directory, result = []) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, result);
    else result.push(path);
  }
  return result;
}

function relativeImport(fromFile, toFile) {
  let value = relative(dirname(fromFile), toFile).split(sep).join("/");
  value = value.replace(/\.(?:tsx?|jsx?)$/u, "");
  return value.startsWith(".") ? value : `./${value}`;
}

function addImport(source, statement) {
  if (source.includes(statement)) return source;
  const directive = source.match(/^(?:\s*["'][^"']+["'];\s*)+/u)?.[0] ?? "";
  return `${directive}${statement}\n${source.slice(directive.length)}`;
}

function openingElementEnd(source, start) {
  let index = start;
  let quote = null;
  let escaped = false;
  let braceDepth = 0;
  while (index < source.length) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      index += 1;
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (character === ">" && braceDepth === 0) return index + 1;
    index += 1;
  }
  return -1;
}

function insertIntoLastReturn(source, jsx, marker) {
  if (source.includes(marker)) return source;
  const matches = [...source.matchAll(/\breturn\s*\(/gu)];
  for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex -= 1) {
    const match = matches[matchIndex];
    let cursor = (match.index ?? 0) + match[0].length;
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    if (source.startsWith("<>", cursor)) {
      return `${source.slice(0, cursor + 2)}\n      ${jsx}\n${source.slice(cursor + 2)}`;
    }
    if (source[cursor] !== "<" || source.startsWith("</", cursor)) continue;
    const end = openingElementEnd(source, cursor);
    if (end < 0) continue;
    const lineStart = source.lastIndexOf("\n", cursor) + 1;
    const indentation = source.slice(lineStart, cursor).match(/^\s*/u)?.[0] ?? "";
    return `${source.slice(0, end)}\n${indentation}  ${jsx}\n${source.slice(end)}`;
  }
  throw new Error(`Could not find a JSX return root for marker ${marker}`);
}

function integrate(file, importStatement, jsx, marker) {
  invariant(existsSync(file), `Missing integration target: ${relative(root, file)}`);
  const before = readFileSync(file, "utf8");
  const after = insertIntoLastReturn(addImport(before, importStatement), jsx, marker);
  if (after !== before) writeFileSync(file, after);
  return after !== before;
}

const publishPage = resolve(root, "src/domains/market/pages/MarketPublishPage.tsx");
const workshop = resolve(root, "src/domains/market/components/MarketplaceAuthoringWorkshop.tsx");
invariant(existsSync(workshop), "MarketplaceAuthoringWorkshop.tsx was not committed");

const publishChanged = integrate(
  publishPage,
  `import { MarketplaceAuthoringWorkshop } from "${relativeImport(publishPage, workshop)}";`,
  "<MarketplaceAuthoringWorkshop />",
  "marketplace-authoring-workshop",
);

const creatorRoot = resolve(root, "src/domains/creator");
const brushCandidates = walk(creatorRoot).filter((path) => /StudioBrushStudio\.tsx$/u.test(path));
invariant(brushCandidates.length === 1, `Expected one StudioBrushStudio.tsx, found ${brushCandidates.length}`);
const brushStudio = brushCandidates[0];
const bridge = resolve(root, "src/domains/creator/MarketplaceBrushStudioBridge.tsx");
invariant(existsSync(bridge), "MarketplaceBrushStudioBridge.tsx was not committed");

const brushChanged = integrate(
  brushStudio,
  `import { MarketplaceBrushStudioBridge } from "${relativeImport(brushStudio, bridge)}";`,
  "<MarketplaceBrushStudioBridge />",
  "brush-studio-marketplace-shortcut",
);

const report = {
  publishPage: relative(root, publishPage),
  publishChanged,
  brushStudio: relative(root, brushStudio),
  brushChanged,
};
writeFileSync(
  resolve(root, "marketplace-authoring-integration-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
