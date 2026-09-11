import { readFileSync, writeFileSync } from "node:fs";

const path = "apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.tsx";
const source = readFileSync(path, "utf8");

function replaceOnce(from, to) {
  const occurrences = source.split(from).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${path}: expected one target, found ${occurrences}`);
  }
  return source.replace(from, to);
}

let next = replaceOnce(
  'import { StudioProjectReadinessPanel } from "./StudioProjectReadinessPanel";',
  'import { StudioProjectDiagnosticsBridge } from "./StudioProjectDiagnosticsBridge";\nimport { StudioProjectReadinessPanel } from "./StudioProjectReadinessPanel";',
);

const mountTarget = '      <StudioProjectReadinessPanel\n        projectId={displayProjectId}\n        locale={locale}\n        compact={section !== "overview"}\n      />';
const mountReplacement = '      <StudioProjectDiagnosticsBridge projectId={displayProjectId} />\n      <StudioProjectReadinessPanel\n        projectId={displayProjectId}\n        locale={locale}\n        compact={section !== "overview"}\n      />';
const mountOccurrences = next.split(mountTarget).length - 1;
if (mountOccurrences !== 1) {
  throw new Error(`${path}: expected one readiness panel target, found ${mountOccurrences}`);
}
next = next.replace(mountTarget, mountReplacement);
writeFileSync(path, next);
console.log("Mounted Studio project diagnostics bridge.");
