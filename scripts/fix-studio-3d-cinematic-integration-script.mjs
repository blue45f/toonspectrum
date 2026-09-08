import { readFile, writeFile } from "node:fs/promises";

const TARGET_PATH = "scripts/apply-studio-3d-cinematic-assets.mjs";
const staleBlock = `
  source = replaceOnce(
    source,
    \`  label: "절차형 3D 무료 스타터",\\n  description: "외부 파일 없이 BG3D 기본 도형만으로 생성되는 오리지널 CC0 모듈",\`,
    \`  label: "절차형 3D 캐릭터·배경·소품",\\n  description: "외부 파일 없이 BG3D 기본 도형으로 생성되는 41종 오리지널 CC0 에셋",\`,
    "expanded pack identity",
  );
`;

let source = await readFile(TARGET_PATH, "utf8");
const first = source.indexOf(staleBlock);
if (first < 0) {
  throw new Error("Missing stale pack identity replacement block.");
}
if (source.indexOf(staleBlock, first + staleBlock.length) >= 0) {
  throw new Error("Stale pack identity replacement block is not unique.");
}
source = `${source.slice(0, first)}${source.slice(first + staleBlock.length)}`;
await writeFile(TARGET_PATH, source);
console.log("Removed stale Studio 3D pack identity patch anchor.");
