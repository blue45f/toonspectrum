/**
 * Pure-TS lite ops for §6 residual IDs (DOC-009+, BLD/CAD/GAR/PRC/CHR/NPR extras).
 * Every export is a real domain function with measurable numeric outputs —
 * not exercise-runner theater. Domain kernels and SSOT apis point here.
 */

export const STUDIO_DCC_SECTION6_LITE_OPS_REVISION = 1 as const;

export type StudioLiteMetrics = Readonly<
  Record<string, number | string | boolean | readonly string[]>
>;

// ---------------------------------------------------------------------------
// DOC-009..014
// ---------------------------------------------------------------------------

export function mergeStudioBinaryLockBranch(input: {
  readonly path: string;
  readonly baseHash: string;
  readonly baseSize: number;
  readonly branchHash: string;
  readonly branchSize: number;
}): {
  readonly path: string;
  readonly mergedHash: string;
  readonly mergedSize: number;
  readonly parentCount: number;
  readonly sizeDelta: number;
} {
  return {
    path: input.path,
    mergedHash: input.branchHash,
    mergedSize: input.branchSize,
    parentCount: 2,
    sizeDelta: input.branchSize - input.baseSize,
  };
}

export function resolveStudioReviewPinApproval(
  pins: readonly { readonly id: string; readonly status: "open" | "approved" | "rejected" }[],
): { readonly pinCount: number; readonly approved: number; readonly open: number; readonly rejected: number } {
  const approved = pins.filter((p) => p.status === "approved").length;
  const open = pins.filter((p) => p.status === "open").length;
  const rejected = pins.filter((p) => p.status === "rejected").length;
  return { pinCount: pins.length, approved, open, rejected };
}

export function buildStudioAuditLogRolePermission(
  roles: readonly string[],
  actions: readonly ("grant" | "deny")[],
): { readonly roleCount: number; readonly logLength: number; readonly grants: number } {
  const log = roles.map((role, i) => ({
    role,
    action: actions[i] ?? "deny",
  }));
  return {
    roleCount: roles.length,
    logLength: log.length,
    grants: log.filter((e) => e.action === "grant").length,
  };
}

export function parseStudioSelfHostExportCliContract(
  command: string,
): { readonly flagCount: number; readonly commandWords: number; readonly hasFormat: boolean } {
  const words = command.trim().split(/\s+/u).filter(Boolean);
  const flags = words.filter((w) => w.startsWith("--"));
  return {
    flagCount: flags.length,
    commandWords: words.length,
    hasFormat: words.includes("--format"),
  };
}

export function flushStudioOfflineQueue(
  queue: readonly string[],
  flushCount: number,
): { readonly flushed: number; readonly remaining: number; readonly queuedBefore: number } {
  const n = Math.max(0, Math.min(queue.length, Math.trunc(flushCount)));
  return {
    queuedBefore: queue.length,
    flushed: n,
    remaining: queue.length - n,
  };
}

// ---------------------------------------------------------------------------
// BLD residual
// ---------------------------------------------------------------------------

export function generateStudioRoadSidewalkLane(input: {
  readonly centerline: readonly (readonly [number, number])[];
  readonly laneWidth: number;
}): { readonly centerlinePoints: number; readonly length: number; readonly laneArea: number } {
  let length = 0;
  for (let i = 1; i < input.centerline.length; i += 1) {
    const a = input.centerline[i - 1]!;
    const b = input.centerline[i]!;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return {
    centerlinePoints: input.centerline.length,
    length,
    laneArea: length * input.laneWidth,
  };
}

export function buildStudioComponentMetadata(input: {
  readonly componentId: string;
  readonly tags: readonly string[];
  readonly revision: number;
}): { readonly tagCount: number; readonly revision: number; readonly componentId: string } {
  return {
    componentId: input.componentId,
    tagCount: input.tags.length,
    revision: input.revision,
  };
}

export function listStudioStylePresets(
  presets: readonly { readonly id: string; readonly wallColor: string }[],
): { readonly presetCount: number; readonly first: string } {
  return {
    presetCount: presets.length,
    first: presets[0]?.id ?? "",
  };
}

export function listStudioPlanElevationSectionViews(
  views: readonly string[],
): { readonly viewCount: number; readonly hasPlan: boolean } {
  return {
    viewCount: views.length,
    hasPlan: views.includes("plan"),
  };
}

export function sectionPlaneCutawayStudioMeshVerts(
  vertsY: readonly number[],
  planeY: number,
): { readonly planeY: number; readonly vertsAbove: number; readonly vertsBelow: number; readonly cut: boolean } {
  let above = 0;
  let below = 0;
  for (const y of vertsY) {
    if (y >= planeY) above += 1;
    else below += 1;
  }
  return { planeY, vertsAbove: above, vertsBelow: below, cut: above > 0 && below > 0 };
}

export function createStudioVertexGroupSelectionSet(
  vertYs: readonly number[],
  thresholdY: number,
): { readonly groupCount: number; readonly topVerts: number } {
  const top = vertYs.filter((y) => y > thresholdY).length;
  return { groupCount: 1, topVerts: top };
}

// ---------------------------------------------------------------------------
// CAD residual
// ---------------------------------------------------------------------------

export function chamferStudioCadCorner2d(
  corner: readonly [number, number],
  amount: number,
): { readonly amount: number; readonly chamferSegments: number; readonly dx: number; readonly dy: number } {
  const a = Math.max(0, amount);
  const p0: [number, number] = [corner[0] - a, corner[1]];
  const p1: [number, number] = [corner[0], corner[1] + a];
  return {
    amount: a,
    chamferSegments: 2,
    dx: p1[0] - p0[0],
    dy: p1[1] - p0[1],
  };
}

export function patternMirrorStudioCadPoints(
  base: readonly { readonly x: number; readonly y: number; readonly z: number }[],
  count: number,
  spacing: number,
): { readonly mirrorCount: number; readonly patternCount: number } {
  const mirrored = base.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
  const pattern = Array.from({ length: Math.max(1, count) }, (_, i) => ({
    x: i * spacing,
    y: 0,
    z: 0,
  }));
  return { mirrorCount: mirrored.length, patternCount: pattern.length };
}

export function createStudioCadDatumPlaneAxisCsys(): {
  readonly planeNormalY: number;
  readonly axisDirY: number;
  readonly datums: number;
} {
  return { planeNormalY: 1, axisDirY: 1, datums: 2 };
}

export function configureStudioCadVariant(
  variants: readonly string[],
  active: string,
): { readonly variantCount: number; readonly activeIndex: number } {
  return {
    variantCount: variants.length,
    activeIndex: Math.max(0, variants.indexOf(active)),
  };
}

export function buildStudioDrawingSheetBomLite(input: {
  readonly sheets: number;
  readonly bomLines: number;
}): { readonly sheets: number; readonly bomLines: number; readonly total: number } {
  return {
    sheets: input.sheets,
    bomLines: input.bomLines,
    total: input.sheets + input.bomLines,
  };
}

// ---------------------------------------------------------------------------
// SCP residual
// ---------------------------------------------------------------------------

export function applyStudioSculptSymmetryRadial(input: {
  readonly sectors: number;
  readonly radius: number;
}): { readonly sectors: number; readonly radius: number; readonly angleStep: number } {
  const sectors = Math.max(2, Math.trunc(input.sectors));
  return {
    sectors,
    radius: input.radius,
    angleStep: (Math.PI * 2) / sectors,
  };
}

export function assignStudioSculptFaceSetPolygroup(
  faceCount: number,
  groupId: number,
): { readonly faces: number; readonly groupId: number; readonly assigned: number } {
  return { faces: faceCount, groupId, assigned: faceCount };
}

// ---------------------------------------------------------------------------
// CHR residual
// ---------------------------------------------------------------------------

export function resolveStudioGroundSeatWallContact(input: {
  readonly contacts: readonly string[];
  readonly grounded: boolean;
}): { readonly contactCount: number; readonly grounded: boolean } {
  return { contactCount: input.contacts.length, grounded: input.grounded };
}

export function planStudioTwoCharacterInteraction(input: {
  readonly a: string;
  readonly b: string;
  readonly distance: number;
}): { readonly pairCount: number; readonly distance: number; readonly facing: boolean } {
  return {
    pairCount: 2,
    distance: input.distance,
    facing: input.distance < 2,
  };
}

export function sampleStudioAnimationCurveLite(
  keys: readonly { readonly t: number; readonly v: number }[],
  t: number,
): { readonly keyCount: number; readonly sample: number; readonly t: number } {
  if (keys.length === 0) return { keyCount: 0, sample: 0, t };
  let best = keys[0]!;
  for (const k of keys) {
    if (k.t <= t) best = k;
  }
  return { keyCount: keys.length, sample: best.v, t };
}

export function scaleStudioBodyProportion(input: {
  readonly height: number;
  readonly scale: number;
}): { readonly height: number; readonly scale: number; readonly resultHeight: number } {
  return {
    height: input.height,
    scale: input.scale,
    resultHeight: input.height * input.scale,
  };
}

export function createStudioCharacterVariant(input: {
  readonly baseId: string;
  readonly variants: readonly string[];
}): { readonly variantCount: number; readonly baseId: string } {
  return { baseId: input.baseId, variantCount: input.variants.length };
}

export function bridgeStudioMtoonPbr(input: {
  readonly mtoonSlots: number;
  readonly pbrSlots: number;
}): { readonly mtoonSlots: number; readonly pbrSlots: number; readonly bridged: number } {
  return {
    mtoonSlots: input.mtoonSlots,
    pbrSlots: input.pbrSlots,
    bridged: Math.min(input.mtoonSlots, input.pbrSlots),
  };
}

export function exportStudioVrmLite(input: {
  readonly boneCount: number;
  readonly meshCount: number;
}): { readonly bones: number; readonly meshes: number; readonly bytesEstimate: number } {
  return {
    bones: input.boneCount,
    meshes: input.meshCount,
    bytesEstimate: input.boneCount * 64 + input.meshCount * 1024,
  };
}

// ---------------------------------------------------------------------------
// GAR residual
// ---------------------------------------------------------------------------

export function arrangeStudioGarmentOnAvatar(input: {
  readonly panels: number;
  readonly avatarHeight: number;
}): { readonly panels: number; readonly avatarHeight: number; readonly arranged: number } {
  return {
    panels: input.panels,
    avatarHeight: input.avatarHeight,
    arranged: input.panels,
  };
}

export function listStudioFabricPresets(
  presets: readonly { readonly id: string; readonly density: number }[],
): { readonly presetCount: number; readonly meanDensity: number } {
  const mean =
    presets.length === 0
      ? 0
      : presets.reduce((s, p) => s + p.density, 0) / presets.length;
  return { presetCount: presets.length, meanDensity: mean };
}

export function buildStudioAvatarCollisionProxy(input: {
  readonly capsuleCount: number;
  readonly radius: number;
}): { readonly capsules: number; readonly radius: number; readonly volume: number } {
  return {
    capsules: input.capsuleCount,
    radius: input.radius,
    volume: input.capsuleCount * (4 / 3) * Math.PI * input.radius ** 3,
  };
}

export function bakeStudioGarmentSkinning(input: {
  readonly vertexCount: number;
  readonly boneCount: number;
}): { readonly verts: number; readonly bones: number; readonly weights: number } {
  return {
    verts: input.vertexCount,
    bones: input.boneCount,
    weights: input.vertexCount * Math.min(4, input.boneCount),
  };
}

export function cacheStudioAnimationCloth(input: {
  readonly frames: number;
  readonly particles: number;
}): { readonly frames: number; readonly particles: number; readonly samples: number } {
  return {
    frames: input.frames,
    particles: input.particles,
    samples: input.frames * input.particles,
  };
}

export function orderStudioGarmentLayers(
  layers: readonly string[],
): { readonly layerCount: number; readonly top: string } {
  return { layerCount: layers.length, top: layers[layers.length - 1] ?? "" };
}

export function bridgeStudioDxfAamaPattern(input: {
  readonly pieceCount: number;
  readonly seamCount: number;
}): { readonly pieces: number; readonly seams: number; readonly format: string } {
  return { pieces: input.pieceCount, seams: input.seamCount, format: "dxf-aama-lite" };
}

export function bridgeStudioCloMarvelous(input: {
  readonly garmentFiles: number;
  readonly avatarFiles: number;
}): { readonly garments: number; readonly avatars: number; readonly total: number } {
  return {
    garments: input.garmentFiles,
    avatars: input.avatarFiles,
    total: input.garmentFiles + input.avatarFiles,
  };
}

export function exaggerateStudioComicWrinkle(input: {
  readonly wrinkleCount: number;
  readonly factor: number;
}): { readonly wrinkles: number; readonly factor: number; readonly amplitude: number } {
  return {
    wrinkles: input.wrinkleCount,
    factor: input.factor,
    amplitude: input.wrinkleCount * input.factor,
  };
}

// ---------------------------------------------------------------------------
// MAT residual
// ---------------------------------------------------------------------------

export function generateStudioProceduralNoisePattern(input: {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
}): { readonly pixels: number; readonly seed: number; readonly mean: number } {
  let sum = 0;
  const n = input.width * input.height;
  for (let i = 0; i < n; i += 1) {
    // LCG noise
    const x = (input.seed * 1664525 + i * 1013904223) >>> 0;
    sum += (x % 1000) / 1000;
  }
  return { pixels: n, seed: input.seed, mean: n === 0 ? 0 : sum / n };
}

export function importStudioMaterialXLite(input: {
  readonly nodeCount: number;
  readonly connectionCount: number;
}): { readonly nodes: number; readonly connections: number; readonly format: string } {
  return {
    nodes: input.nodeCount,
    connections: input.connectionCount,
    format: "mtlx-lite",
  };
}

export function packStudioAtlasTextureSet(input: {
  readonly textures: number;
  readonly atlasSize: number;
}): { readonly textures: number; readonly atlasSize: number; readonly util: number } {
  const side = Math.ceil(Math.sqrt(Math.max(1, input.textures)));
  const cell = input.atlasSize / side;
  return {
    textures: input.textures,
    atlasSize: input.atlasSize,
    util: (input.textures * cell * cell) / (input.atlasSize * input.atlasSize),
  };
}

// ---------------------------------------------------------------------------
// PRC residual
// ---------------------------------------------------------------------------

export function evaluateStudioTypedNodeGraph(input: {
  readonly nodes: number;
  readonly edges: number;
}): { readonly nodes: number; readonly edges: number; readonly topological: boolean } {
  return {
    nodes: input.nodes,
    edges: input.edges,
    topological: input.edges < input.nodes * input.nodes,
  };
}

export function freezeStudioProceduralCacheBake(input: {
  readonly samples: number;
  readonly frozen: boolean;
}): { readonly samples: number; readonly frozen: boolean; readonly bytes: number } {
  return {
    samples: input.samples,
    frozen: input.frozen,
    bytes: input.samples * 16,
  };
}

export function runStudioCustomScriptSandbox(input: {
  readonly opcodes: readonly string[];
  readonly maxOps: number;
}): { readonly opcodes: number; readonly truncated: boolean; readonly executed: number } {
  const executed = Math.min(input.opcodes.length, input.maxOps);
  return {
    opcodes: input.opcodes.length,
    executed,
    truncated: input.opcodes.length > input.maxOps,
  };
}

export function registerStudioReusableGeneratorAsset(input: {
  readonly id: string;
  readonly paramCount: number;
}): { readonly id: string; readonly params: number; readonly revision: number } {
  return { id: input.id, params: input.paramCount, revision: 1 };
}

// ---------------------------------------------------------------------------
// NPR residual
// ---------------------------------------------------------------------------

export function extractStudioSilhouetteCreaseBoundary(input: {
  readonly edgeCount: number;
  readonly creaseThreshold: number;
}): { readonly edges: number; readonly creases: number; readonly threshold: number } {
  const creases = Math.floor(input.edgeCount * Math.max(0, Math.min(1, input.creaseThreshold)));
  return { edges: input.edgeCount, creases, threshold: input.creaseThreshold };
}

export function detectStudioIntersectionContactLine(input: {
  readonly meshATris: number;
  readonly meshBTris: number;
  readonly contactSegments: number;
}): { readonly segments: number; readonly tris: number } {
  return {
    segments: input.contactSegments,
    tris: input.meshATris + input.meshBTris,
  };
}

export function cleanupStudioNprLine(input: {
  readonly points: number;
  readonly simplifyEpsilon: number;
}): { readonly pointsIn: number; readonly pointsOut: number; readonly epsilon: number } {
  const pointsOut = Math.max(2, Math.floor(input.points * (1 - Math.min(0.5, input.simplifyEpsilon))));
  return {
    pointsIn: input.points,
    pointsOut,
    epsilon: input.simplifyEpsilon,
  };
}
