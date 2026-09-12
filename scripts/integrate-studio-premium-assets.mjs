#!/usr/bin/env node
/** Idempotent, exact-match integration for this source-bound asset release. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../apps/web/src/domains/creator/', import.meta.url);
async function patch(name, edits) {
  const file = new URL(name, root);
  let text = await readFile(file, 'utf8');
  for (const [before, after] of edits) {
    if (text.includes(after)) continue;
    if (text.split(before).length !== 2) throw new Error(`Expected one unmodified integration anchor in ${fileURLToPath(file)}: ${before.slice(0, 80)}`);
    text = text.replace(before, after);
  }
  await writeFile(file, text);
}

await patch('studio-cc0-asset-delivery.ts', [
  ['export type StudioCc0AssetKind = "model" | "effect-mask" | "surface-texture";',
   'export type StudioCc0AssetKind = "model" | "effect-mask" | "surface-texture" | "background" | "prop-image";'],
  ['  "surface-material": "표면 재질",',
   '  "surface-material": "표면 재질",\n  "background-street": "거리 · 골목 · 건축 배경",\n  "background-nature": "숲 · 정원 · 해안 배경",\n  "background-interior": "실내 · 홀 · 창고 배경",\n  "rendered-prop": "2D 투명 소품 · 3D 원본 렌더",'],
  ['!["model", "effect-mask", "surface-texture"].includes(String(asset.kind))',
   '!["model", "effect-mask", "surface-texture", "background", "prop-image"].includes(String(asset.kind))'],
  ['    studioCc0AssetUrl(asset.path);\n    const kind',
   '    studioCc0AssetUrl(asset.path);\n    if (asset.previewPath !== undefined) {\n      if (typeof asset.previewPath !== "string") throw new TypeError("에셋 미리보기 경로가 올바르지 않습니다.");\n      studioCc0AssetUrl(asset.previewPath);\n    }\n    const kind'],
]);
await patch('studio-cc0-curation.ts', [
  ['  if (asset.kind !== "model") return asset.kind === "effect-mask" ? "투명 효과" : "원본 표면 재질";',
   '  if (asset.kind === "background") return "실사 레퍼런스 배경";\n  if (asset.kind === "prop-image") return "투명 2D 소품 · 3D 원본의 렌더";\n  if (asset.kind !== "model") return asset.kind === "effect-mask" ? "투명 효과" : "원본 표면 재질";'],
]);
await patch('StudioCc0AssetLibraryPanel.tsx', [
  ['  {id: "all", label: "전체"}, {id: "model", label: "3D 소품"},',
   '  {id: "all", label: "전체"}, {id: "model", label: "3D 소품"},\n  {id: "background", label: "2D 배경"}, {id: "prop-image", label: "2D 투명 소품"},'],
  ['CC0 원본 에셋 라이브러리 {selectableCount', 'CC0 에셋 라이브러리 {selectableCount'],
  ['질감이 있는 PBR 원본과 스타일라이즈 소품을 구분해서 찾습니다. 3D는 GLB를 받은 뒤 모델 가져오기를 사용하세요. 효과·재질 이미지는 캔버스에 바로 삽입합니다.',
   '배경·투명 소품·PBR 모델·재질을 종류별로 찾습니다. 2D 배경과 소품은 캔버스에 바로 삽입하고, 3D는 GLB를 받은 뒤 모델 가져오기를 사용하세요. 실사 배경은 사진 레퍼런스이며, 투명 소품은 표시된 3D 원본에서 렌더한 파생 소재입니다.'],
  ['placeholder="가구, 음식, 나무, chair, tree…"', 'placeholder="골목, 정원, 실내, 의자, 조명, chair…"'],
  ['src={studioCc0AssetUrl(preview.previewPath ?? preview.path)}',
   'src={studioCc0AssetUrl(preview.kind === "model" ? preview.previewPath ?? preview.path : preview.path)}'],
]);
console.log('Integrated image kinds and native-resolution enlargement with legacy URLs preserved.');
