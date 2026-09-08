import { readFile, writeFile } from "node:fs/promises";

const PACK_PATH =
  "apps/web/src/domains/creator/bg3d/studio-bg3d-procedural-starter-pack.ts";
const PANEL_PATH =
  "apps/web/src/domains/creator/bg3d/StudioBg3dProceduralStarterPanel.tsx";
const PACK_TEST_PATH =
  "apps/web/src/domains/creator/bg3d/studio-bg3d-procedural-starter-pack.test.ts";
const PANEL_TEST_PATH =
  "apps/web/src/domains/creator/bg3d/StudioBg3dProceduralStarterPanel.test.tsx";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

async function patchPack() {
  let source = await readFile(PACK_PATH, "utf8");

  source = replaceOnce(
    source,
    `import type {\n  BgPrimitive,\n  BgPrimitiveKind,\n} from "../studio-background-3d-metadata";\nimport type { StudioBg3dComplexityBudget } from "./studio-bg3d-scene-document";`,
    `import type {\n  BgPrimitive,\n  BgPrimitiveKind,\n} from "../studio-background-3d-metadata";\n\nimport { STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS } from "./studio-bg3d-cinematic-asset-blueprints";\nimport type { StudioBg3dComplexityBudget } from "./studio-bg3d-scene-document";`,
    "cinematic blueprint import",
  );

  source = replaceOnce(
    source,
    `export type StudioBg3dProceduralStarterCategory =\n  | "architecture"\n  | "opening"\n  | "furniture"\n  | "street"\n  | "nature";`,
    `export type StudioBg3dProceduralStarterCategory =\n  | "character"\n  | "scene"\n  | "prop"\n  | "architecture"\n  | "opening"\n  | "furniture"\n  | "street"\n  | "nature";`,
    "starter categories",
  );

  source = replaceOnce(
    source,
    `export const STUDIO_BG3D_PROCEDURAL_STARTER_CATEGORY_LABELS = Object.freeze({\n  architecture: "건축 모듈",\n  opening: "문·창호",\n  furniture: "가구",\n  street: "거리",\n  nature: "자연",`,
    `export const STUDIO_BG3D_PROCEDURAL_STARTER_CATEGORY_LABELS = Object.freeze({\n  character: "캐릭터 포즈",\n  scene: "완성 배경",\n  prop: "상세 소품",\n  architecture: "건축 모듈",\n  opening: "문·창호",\n  furniture: "가구",\n  street: "거리",\n  nature: "자연",`,
    "starter category labels",
  );

  source = replaceOnce(
    source,
    `  /**\n   * All starter parts are authored with X/Z rotation at zero. This lets the lightweight runtime\n   * apply an asset yaw by adding it to Euler Y without importing Three.js for quaternion math.\n   */\n  readonly rotation: readonly [0, number, 0];`,
    `  /** Euler XYZ radians. Character poses may use every axis; insertion composes whole-asset yaw. */\n  readonly rotation: readonly [number, number, number];`,
    "full XYZ starter rotations",
  );

  source = replaceOnce(
    source,
    `    rotation: Object.freeze([0, yaw, 0]) as readonly [0, number, 0],`,
    `    rotation: Object.freeze([0, yaw, 0]) as readonly [number, number, number],`,
    "starter yaw tuple",
  );

  source = replaceOnce(
    source,
    `function buildStraightStairParts(): readonly StudioBg3dProceduralStarterPart[] {`,
    `function starterPosedPart(\n  id: string,\n  name: string,\n  kind: BgPrimitiveKind,\n  offset: readonly [number, number, number],\n  scale: readonly [number, number, number],\n  color: string,\n  rotation: readonly [number, number, number],\n): StudioBg3dProceduralStarterPart {\n  return Object.freeze({\n    id,\n    name,\n    kind,\n    offset: Object.freeze([...offset]) as readonly [number, number, number],\n    rotation: Object.freeze([...rotation]) as readonly [number, number, number],\n    scale: Object.freeze([...scale]) as readonly [number, number, number],\n    color,\n  });\n}\n\nconst STUDIO_BG3D_CINEMATIC_ASSETS = Object.freeze(\n  STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS.map((blueprint) =>\n    defineStarterAsset({\n      id: blueprint.id,\n      category: blueprint.category,\n      label: blueprint.label,\n      description: blueprint.description,\n      tags: blueprint.tags,\n      bounds: blueprint.bounds,\n      parts: blueprint.parts.map((item) =>\n        starterPosedPart(\n          item.id,\n          item.name,\n          item.kind,\n          item.offset,\n          item.scale,\n          item.color,\n          item.rotation,\n        ),\n      ),\n    }),\n  ),\n);\n\nfunction buildStraightStairParts(): readonly StudioBg3dProceduralStarterPart[] {`,
    "cinematic asset materialization",
  );

  source = replaceOnce(
    source,
    `] satisfies readonly StudioBg3dProceduralStarterAsset[]);`,
    `  ...STUDIO_BG3D_CINEMATIC_ASSETS,\n] satisfies readonly StudioBg3dProceduralStarterAsset[]);`,
    "cinematic catalog spread",
  );

  source = replaceOnce(
    source,
    `function normalizedYaw(value: number): number {\n  const twoPi = Math.PI * 2;\n  const wrapped = ((value + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;\n  return Object.is(wrapped, -0) ? 0 : wrapped;\n}`,
    `function normalizedYaw(value: number): number {\n  const twoPi = Math.PI * 2;\n  const wrapped = ((value + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;\n  return Object.is(wrapped, -0) ? 0 : wrapped;\n}\n\n/** Premultiplies a local XYZ Euler rotation by world-space yaw without importing a renderer. */\nfunction rotateStudioBg3dEulerByYaw(\n  rotation: readonly [number, number, number],\n  yaw: number,\n): [number, number, number] {\n  const halfX = rotation[0] / 2;\n  const halfY = rotation[1] / 2;\n  const halfZ = rotation[2] / 2;\n  const cx = Math.cos(halfX);\n  const cy = Math.cos(halfY);\n  const cz = Math.cos(halfZ);\n  const sx = Math.sin(halfX);\n  const sy = Math.sin(halfY);\n  const sz = Math.sin(halfZ);\n\n  const localX = sx * cy * cz + cx * sy * sz;\n  const localY = cx * sy * cz - sx * cy * sz;\n  const localZ = cx * cy * sz + sx * sy * cz;\n  const localW = cx * cy * cz - sx * sy * sz;\n\n  const yawSin = Math.sin(yaw / 2);\n  const yawCos = Math.cos(yaw / 2);\n  const qx = yawCos * localX + yawSin * localZ;\n  const qy = yawCos * localY + yawSin * localW;\n  const qz = yawCos * localZ - yawSin * localX;\n  const qw = yawCos * localW - yawSin * localY;\n\n  const m11 = 1 - 2 * (qy * qy + qz * qz);\n  const m12 = 2 * (qx * qy - qz * qw);\n  const m13 = 2 * (qx * qz + qy * qw);\n  const m22 = 1 - 2 * (qx * qx + qz * qz);\n  const m23 = 2 * (qy * qz - qx * qw);\n  const m32 = 2 * (qy * qz + qx * qw);\n  const m33 = 1 - 2 * (qx * qx + qy * qy);\n  const nextY = Math.asin(Math.max(-1, Math.min(1, m13)));\n  const nearGimbalLock = Math.abs(m13) >= 0.9999999;\n  const nextX = nearGimbalLock ? Math.atan2(m32, m22) : Math.atan2(-m23, m33);\n  const nextZ = nearGimbalLock ? 0 : Math.atan2(-m12, m11);\n\n  return [normalizedYaw(nextX), normalizedYaw(nextY), normalizedYaw(nextZ)];\n}`,
    "world yaw quaternion composition",
  );

  source = replaceOnce(
    source,
    `      rotation: [0, normalizedYaw(part.rotation[1] + yaw), 0],`,
    `      rotation: rotateStudioBg3dEulerByYaw(part.rotation, yaw),`,
    "runtime posed rotation",
  );

  source = replaceOnce(
    source,
    `  label: "절차형 3D 무료 스타터",\n  description: "외부 파일 없이 BG3D 기본 도형만으로 생성되는 오리지널 CC0 모듈",`,
    `  label: "절차형 3D 캐릭터·배경·소품",\n  description: "외부 파일 없이 BG3D 기본 도형으로 생성되는 41종 오리지널 CC0 에셋",`,
    "expanded pack identity",
  );

  await writeFile(PACK_PATH, source);
}

async function patchPanel() {
  let source = await readFile(PANEL_PATH, "utf8");

  source = replaceOnce(
    source,
    `  Leaf,\n  Route,`,
    `  Leaf,\n  PersonStanding,\n  Route,`,
    "character icon import",
  );
  source = replaceOnce(
    source,
    `> = {\n  architecture: Building2,`,
    `> = {\n  character: PersonStanding,\n  scene: Building2,\n  prop: Box,\n  architecture: Building2,`,
    "new category icons",
  );
  source = replaceOnce(
    source,
    `            구도용 블록아웃`,
    `            3D 캐릭터·배경·소품`,
    "panel heading",
  );
  source = replaceOnce(
    source,
    `            기본 도형으로 공간의 비율과 배치를 잡는 프리셋입니다. 파츠별로 편집해 세부 형태를 다듬을 수 있습니다.`,
    `            포즈 캐릭터, 완성 배경, 상세 소품을 한 번에 삽입합니다. 모든 파츠를 개별 편집·재색상·재배치할 수 있습니다.`,
    "panel description",
  );
  source = replaceOnce(
    source,
    `          aria-label="블록아웃 프리셋 검색"\n          placeholder="방, 계단, 가구, 거리…"`,
    `          aria-label="3D 에셋 검색"\n          placeholder="캐릭터, 교실, 카페, 카메라…"`,
    "asset search language",
  );
  source = replaceOnce(
    source,
    `        {filteredAssets.length}개 블록아웃 · 파츠별 편집`,
    `        {filteredAssets.length}개 3D 에셋 · 파츠별 편집`,
    "catalog count language",
  );
  source = replaceOnce(
    source,
    `          검색과 카테고리에 맞는 블록아웃이 없습니다.`,
    `          검색과 카테고리에 맞는 3D 에셋이 없습니다.`,
    "empty state language",
  );
  source = replaceOnce(
    source,
    `          블록아웃 {hiddenCount}개 더 보기`,
    `          3D 에셋 {hiddenCount}개 더 보기`,
    "pagination language",
  );

  await writeFile(PANEL_PATH, source);
}

async function patchPackTest() {
  let source = await readFile(PACK_TEST_PATH, "utf8");

  source = replaceOnce(
    source,
    `expect(STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS.length).toBeGreaterThanOrEqual(12);`,
    `expect(STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS.length).toBeGreaterThanOrEqual(41);`,
    "expanded catalog assertion",
  );
  source = replaceOnce(
    source,
    `        expect(part.rotation[0]).toBe(0);\n        expect(part.rotation[2]).toBe(0);`,
    `        expect(\n          part.rotation.every(\n            (value) => Number.isFinite(value) && Math.abs(value) <= Math.PI,\n          ),\n        ).toBe(true);`,
    "full rotation assertions",
  );
  source = replaceOnce(
    source,
    `      expect(asset.budget.triangles).toBeLessThanOrEqual(1_000);`,
    `      expect(asset.budget.triangles).toBeLessThanOrEqual(3_000);`,
    "enhanced geometry budget",
  );

  const oldRoundTrip = `  it("round-trips the complete pack through the real scene runtime adapter", () => {\n    let currentUsage = EMPTY_USAGE;\n    let occupiedNodeIds: string[] = [];\n    const primitives: BgPrimitive[] = [];\n\n    for (const asset of STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS) {\n      const plan = planStudioBg3dProceduralStarterInsertion({\n        assetId: asset.id,\n        occupiedNodeIds,\n        currentUsage,\n        limits: DEFAULT_LIMITS,\n      });\n      expect(plan.ok).toBe(true);\n      if (!plan.ok) continue;\n      primitives.push(...plan.primitives);\n      occupiedNodeIds = primitives.map((primitive) => primitive.id);\n      currentUsage = plan.nextUsage;\n    }`;
  const newRoundTrip = `  it("round-trips the complete catalog through the real scene runtime adapter", () => {\n    let occupiedNodeIds: string[] = [];\n    const primitives: BgPrimitive[] = [];\n\n    for (const asset of STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS) {\n      const plan = planStudioBg3dProceduralStarterInsertion({\n        assetId: asset.id,\n        occupiedNodeIds,\n        currentUsage: EMPTY_USAGE,\n        limits: DEFAULT_LIMITS,\n      });\n      expect(plan.ok).toBe(true);\n      if (!plan.ok) continue;\n      primitives.push(...plan.primitives);\n      occupiedNodeIds = primitives.map((primitive) => primitive.id);\n    }`;
  source = replaceOnce(source, oldRoundTrip, newRoundTrip, "catalog round-trip budget semantics");

  await writeFile(PACK_TEST_PATH, source);
}

async function patchPanelTest() {
  let source = await readFile(PANEL_TEST_PATH, "utf8");

  const replacements = [
    ["구도용 블록아웃", "3D 캐릭터·배경·소품", "panel test heading"],
    ["17개 블록아웃 · 파츠별 편집", "41개 3D 에셋 · 파츠별 편집", "panel test count"],
    ["블록아웃 11개 더 보기", "3D 에셋 35개 더 보기", "panel test pagination"],
    ["toHaveLength(17)", "toHaveLength(41)", "panel test full catalog"],
    ["블록아웃 프리셋 검색", "3D 에셋 검색", "panel test search label"],
    ["0개 블록아웃 · 파츠별 편집", "0개 3D 에셋 · 파츠별 편집", "panel test empty count"],
    [
      "검색과 카테고리에 맞는 블록아웃이 없습니다.",
      "검색과 카테고리에 맞는 3D 에셋이 없습니다.",
      "panel test empty state",
    ],
  ];
  for (const [before, after, label] of replacements) {
    source = replaceOnce(source, before, after, label);
  }

  await writeFile(PANEL_TEST_PATH, source);
}

await patchPack();
await patchPanel();
await patchPackTest();
await patchPanelTest();

console.log("Applied Studio 3D cinematic asset pack integration.");
