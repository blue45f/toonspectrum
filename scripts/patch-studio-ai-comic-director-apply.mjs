import { readFile, writeFile } from "node:fs/promises";

const path = "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx";
const source = await readFile(path, "utf8");

const importAnchor = 'import { createStudioScenarioImageGenerationExecutors } from "./ai/studio-scenario-image-generation";';
const importLine = 'import { compileStudioAiComicDirectorApplyElements } from "./ai/studio-ai-comic-director-apply-elements";';
let next = source;
if (!next.includes(importLine)) {
  if (!next.includes(importAnchor)) throw new Error("scenario image executor import anchor not found");
  next = next.replace(importAnchor, `${importLine}\n${importAnchor}`);
}

const start = '    const newEls: El[] = [];\n    for (const item of scenarioResult.items) {';
const end = '    if (newEls.length === 0) return;';
const startIndex = next.indexOf(start);
const endIndex = next.indexOf(end, startIndex);
if (startIndex < 0 || endIndex < 0) {
  if (!next.includes("compileStudioAiComicDirectorApplyElements({")) {
    throw new Error("scenario apply loop anchors not found");
  }
} else {
  const replacement = `    const { elements: newEls } = compileStudioAiComicDirectorApplyElements({\n      items: scenarioResult.items,\n      createId: uid,\n      textAiProvenance: scenarioResult.textAiProvenance,\n    });\n`;
  next = `${next.slice(0, startIndex)}${replacement}${next.slice(endIndex)}`;
}

if (next === source) {
  console.log("AI Comic Director layer apply path already installed.");
} else {
  await writeFile(path, next, "utf8");
  console.log("Installed AI Comic Director layer apply compiler.");
}
