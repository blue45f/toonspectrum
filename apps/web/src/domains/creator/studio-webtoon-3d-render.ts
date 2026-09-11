export const STUDIO_WEBTOON_3D_PASSES = [
  "color",
  "line",
  "shadow",
  "material-id",
  "depth",
  "normal",
  "object-mask",
] as const;

export type StudioWebtoon3dPass = (typeof STUDIO_WEBTOON_3D_PASSES)[number];
export type StudioWebtoon3dRightsStatus = "allowed" | "warning" | "blocked";

export interface StudioWebtoon3dAsset {
  readonly id: string;
  readonly title: string;
  readonly triangles: number;
  readonly materials: number;
  readonly hasNormals: boolean;
  readonly hasUv: boolean;
  readonly rightsStatus: StudioWebtoon3dRightsStatus;
}

export interface StudioWebtoon3dScene {
  readonly id: string;
  readonly cameraId: string | null;
  readonly lightRigId: string | null;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly transparentBackground: boolean;
  readonly assets: readonly StudioWebtoon3dAsset[];
}

export interface StudioWebtoon3dRenderRequest {
  readonly passes: readonly StudioWebtoon3dPass[];
  readonly output: "psd" | "png-set" | "document-layers";
  readonly lineStyleId: string | null;
  readonly preserveEditableScene: boolean;
}

export interface StudioWebtoon3dRenderLayer {
  readonly pass: StudioWebtoon3dPass;
  readonly name: string;
  readonly blendMode: string;
}

export interface StudioWebtoon3dRenderPlan {
  readonly status: "ready" | "review" | "blocked";
  readonly mode: "full" | "proxy";
  readonly layers: readonly StudioWebtoon3dRenderLayer[];
  readonly findings: readonly string[];
  readonly preserveEditableScene: boolean;
}

const PASS_LAYER: Readonly<Record<StudioWebtoon3dPass, { name: string; blendMode: string }>> = {
  color: { name: "01_Color", blendMode: "normal" },
  line: { name: "02_Line", blendMode: "multiply" },
  shadow: { name: "03_Shadow", blendMode: "multiply" },
  "material-id": { name: "04_Material_ID", blendMode: "normal" },
  depth: { name: "05_Depth", blendMode: "normal" },
  normal: { name: "06_Normal", blendMode: "normal" },
  "object-mask": { name: "07_Object_Mask", blendMode: "normal" },
};

export function planStudioWebtoon3dRender(
  scene: StudioWebtoon3dScene,
  request: StudioWebtoon3dRenderRequest,
): StudioWebtoon3dRenderPlan {
  if (
    !scene.id.trim()
    || !Number.isSafeInteger(scene.widthPx)
    || !Number.isSafeInteger(scene.heightPx)
    || scene.widthPx <= 0
    || scene.heightPx <= 0
    || scene.assets.length === 0
    || request.passes.length === 0
  ) {
    throw new Error("A valid 3D scene and at least one render pass are required.");
  }
  if (new Set(request.passes).size !== request.passes.length) {
    throw new Error("Render passes must be unique.");
  }
  const findings: string[] = [];
  if (!scene.cameraId?.trim()) findings.push("camera-missing");
  if (!scene.lightRigId?.trim() && request.passes.some((pass) => ["color", "shadow"].includes(pass))) {
    findings.push("light-rig-missing");
  }
  if (request.passes.includes("line") && !request.lineStyleId?.trim()) {
    findings.push("line-style-missing");
  }
  if (request.passes.includes("normal") && scene.assets.some((asset) => !asset.hasNormals)) {
    findings.push("normal-data-missing");
  }
  if (request.passes.includes("material-id") && scene.assets.some((asset) => asset.materials === 0)) {
    findings.push("material-data-missing");
  }
  if (scene.assets.some((asset) => asset.rightsStatus === "blocked")) {
    findings.push("asset-rights-blocked");
  }
  if (scene.assets.some((asset) => asset.rightsStatus === "warning")) {
    findings.push("asset-rights-review");
  }
  for (const asset of scene.assets) {
    if (
      !asset.id.trim()
      || !asset.title.trim()
      || !Number.isSafeInteger(asset.triangles)
      || asset.triangles < 0
      || !Number.isSafeInteger(asset.materials)
      || asset.materials < 0
    ) {
      throw new Error("3D asset metrics are invalid.");
    }
  }
  const triangles = scene.assets.reduce((sum, asset) => sum + asset.triangles, 0);
  const mode = triangles > 800_000 || scene.widthPx * scene.heightPx > 16_000_000
    ? "proxy"
    : "full";
  if (mode === "proxy") findings.push("proxy-preview-recommended");
  const blockingCodes = new Set([
    "camera-missing",
    "light-rig-missing",
    "line-style-missing",
    "normal-data-missing",
    "material-data-missing",
    "asset-rights-blocked",
  ]);
  const blocked = findings.some((code) => blockingCodes.has(code));
  const layers = request.passes.map((pass) => Object.freeze({
    pass,
    ...PASS_LAYER[pass],
  }));
  return Object.freeze({
    status: blocked ? "blocked" : findings.length > 0 ? "review" : "ready",
    mode,
    layers: Object.freeze(layers),
    findings: Object.freeze(findings),
    preserveEditableScene: request.preserveEditableScene,
  });
}
