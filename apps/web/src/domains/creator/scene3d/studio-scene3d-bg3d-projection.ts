import type {
  StudioBg3dCameraSettings,
  StudioBg3dModelAttachment,
  StudioBg3dSceneDocument,
  StudioBg3dTransform,
} from "../bg3d/studio-bg3d-scene-document";
import { studioBg3dFovDegreesToFocalLength } from "../bg3d/studio-bg3d-lens";
import {
  assertStudioScene3dDocument,
  type StudioScene3dAssetReference,
  type StudioScene3dCamera,
  type StudioScene3dDocumentV1,
  type StudioScene3dEntity,
  type StudioScene3dLight,
  type StudioScene3dQuat,
  type StudioScene3dTransform,
} from "./studio-scene3d-document";

const OUTPUT_MIN_HEIGHT = 2160;
const OUTPUT_MAX_EDGE = 4096;
const DEFAULT_FAR = 5000;

type Scene3dShadowMapSize = 512 | 1024 | 2048 | 4096;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function eulerXyzToQuaternion(rotation: readonly [number, number, number]): StudioScene3dQuat {
  const [x, y, z] = rotation;
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);
  return Object.freeze([
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ] as const);
}

function projectTransform(source: StudioBg3dTransform): StudioScene3dTransform {
  return Object.freeze({
    position: Object.freeze([...source.position] as [number, number, number]),
    rotation: eulerXyzToQuaternion(source.rotation),
    scale: Object.freeze([...source.scale] as [number, number, number]),
  });
}

function projectAttachment(source: StudioBg3dModelAttachment): StudioScene3dAssetReference {
  const contentSha256 = source.hash.replace(/^sha256:/u, "");
  const publicDomain = source.rights.status === "public-domain";
  const owned = source.rights.status === "owned";
  return Object.freeze({
    id: `bg3d:${source.id}`,
    kind: "mesh",
    version: contentSha256.slice(0, 12),
    contentSha256,
    uri: `attachment:${source.id}`,
    mime: source.mime,
    byteSize: source.byteSize,
    rights: Object.freeze({
      commercialUse: source.rights.commercialUse,
      redistribution: publicDomain || owned,
      derivativeUse: publicDomain || owned,
      licenseName: source.rights.licenseName ?? source.rights.status,
    }),
    // Legacy/user assets remain editable but never become production catalogue entries
    // until the new visual admission pipeline produces evidence for their exact hash.
    quality: Object.freeze({
      accepted: false,
      score: 0,
      reportUri: "/assets/3d/quality/legacy-unreviewed.json",
    }),
  });
}

function projectCamera(
  source: StudioBg3dCameraSettings,
  id: string,
  name: string,
): StudioScene3dCamera {
  return Object.freeze({
    id,
    name,
    projection: source.projection ?? "perspective",
    position: Object.freeze([...source.position] as [number, number, number]),
    target: Object.freeze([...source.target] as [number, number, number]),
    up: Object.freeze([...(source.up ?? [0, 1, 0])] as [number, number, number]),
    focalLengthMm: studioBg3dFovDegreesToFocalLength(source.fovDegrees),
    orthoScale: Math.max(0.001, 5 / Math.max(0.001, source.zoom ?? 1)),
    near: Math.max(0.001, source.nearClip ?? 0.03),
    far: DEFAULT_FAR,
    lensShift: Object.freeze([...(source.lensShift ?? [0, 0])] as [number, number]),
  });
}

function resolveProjectionOutputSize(
  exportHeight: number,
  exportAspectRatio: number,
): { readonly width: number; readonly height: number } {
  const requestedHeight = clamp(Math.round(exportHeight), OUTPUT_MIN_HEIGHT, OUTPUT_MAX_EDGE);
  const aspect = clamp(exportAspectRatio, 0.1, 10);
  const requestedWidth = requestedHeight * aspect;
  const fitScale = Math.min(1, OUTPUT_MAX_EDGE / Math.max(requestedWidth, requestedHeight));
  return Object.freeze({
    width: Math.max(64, Math.round(requestedWidth * fitScale)),
    height: Math.max(64, Math.round(requestedHeight * fitScale)),
  });
}

function projectShadowMapSize(
  source: StudioBg3dSceneDocument["quality"]["desktop"]["shadowMapSize"],
): Scene3dShadowMapSize {
  // BG3D still accepts a 256px legacy preview tier. Scene3D starts at 512px, so projection must
  // upgrade it rather than create a document that violates the Scene3D type contract.
  if (source >= 4096) return 4096;
  if (source >= 2048) return 2048;
  if (source >= 1024) return 1024;
  return 512;
}

function projectDirectionalLight(
  id: string,
  name: string,
  light: StudioBg3dSceneDocument["lighting"]["key"],
): StudioScene3dLight {
  const target = Object.freeze([0, 1, 0] as const);
  return Object.freeze({
    id,
    name,
    kind: "directional",
    color: light.color,
    intensity: light.intensity,
    position: Object.freeze([
      target[0] + light.direction[0] * 10,
      target[1] + light.direction[1] * 10,
      target[2] + light.direction[2] * 10,
    ] as const),
    target,
    castShadow: light.castsShadow,
  });
}

export function projectStudioBg3dDocumentToScene3d(input: {
  readonly documentId: string;
  readonly source: StudioBg3dSceneDocument;
  readonly revision?: number;
  readonly now?: string;
}): StudioScene3dDocumentV1 {
  const { source } = input;
  const now = input.now ?? new Date().toISOString();
  const sourceShots = source.shots ?? [];
  const activeSourceShot = source.activeShotId
    ? sourceShots.find((shot) => shot.id === source.activeShotId)
    : undefined;
  const assets = source.attachments.map(projectAttachment);
  const entities: StudioScene3dEntity[] = source.nodes.map((node) => {
    const base = {
      id: node.id,
      name: node.name,
      transform: projectTransform(node.transform),
      visible: node.visible,
      locked: node.locked,
      castShadow: node.castsShadow,
      receiveShadow: node.receivesShadow,
      parentId: node.parentId ?? null,
    } as const;
    if (node.kind === "primitive") {
      return Object.freeze({
        ...base,
        kind: "primitive" as const,
        primitiveKind: node.primitiveKind,
        color: node.color,
      });
    }
    return Object.freeze({
      ...base,
      kind: "model" as const,
      assetId: `bg3d:${node.attachmentId}`,
      materialVariantId: null,
    });
  });

  const mainCamera = projectCamera(source.camera, "camera:main", "메인 카메라");
  const shotCameras = sourceShots.map((shot) => projectCamera(
    { ...source.camera, ...(shot.camera ?? {}) },
    `camera:shot:${shot.id}`,
    `${shot.name} 카메라`,
  ));
  const { width, height } = resolveProjectionOutputSize(
    source.output.exportHeight,
    source.output.exportAspectRatio ?? 1,
  );
  const mode = source.background.mode === "transparent"
    ? "transparent"
    : source.background.mode === "color"
      ? "color"
      : "procedural-sky";

  const document: StudioScene3dDocumentV1 = Object.freeze({
    kind: "toonspectrum.scene3d",
    version: 1,
    documentId: input.documentId,
    revision: input.revision ?? 0,
    coordinateSystem: Object.freeze({ unit: "meter", handedness: "right", upAxis: "Y", forwardAxis: "-Z" }),
    assets: Object.freeze(assets),
    entities: Object.freeze(entities),
    cameras: Object.freeze([mainCamera, ...shotCameras]),
    activeCameraId: activeSourceShot ? `camera:shot:${activeSourceShot.id}` : mainCamera.id,
    lights: Object.freeze([
      projectDirectionalLight("light:key", "키 라이트", source.lighting.key),
      projectDirectionalLight("light:fill", "필 라이트", source.lighting.fill),
    ]),
    environment: Object.freeze({
      mode,
      color: source.background.color,
      assetId: null,
      rotationDegrees: source.background.panoramaRotation,
      intensity: source.lighting.ambientIntensity,
      groundEnabled: true,
      groundHeight: 0,
      groundShadowOpacity: source.render.shadows ? 0.22 : 0,
    }),
    render: Object.freeze({
      profile: "webtoon",
      colorSpace: "srgb",
      toneMapping: source.render.toneMapping === "aces" ? "aces" : "neutral",
      exposure: source.render.exposure,
      antialiasing: source.render.antialias ? "msaa" : "ssaa",
      shadows: Object.freeze({
        enabled: source.render.shadows,
        mode: "csm",
        cascades: 3,
        mapSize: projectShadowMapSize(source.quality.desktop.shadowMapSize),
      }),
      effects: Object.freeze({
        ssgi: false,
        sss: false,
        contactShadows: source.render.shadows,
        bloom: false,
        depthOfField: false,
      }),
      toon: Object.freeze({
        enabled: source.output.tone.mode !== "none",
        rampSteps: Math.max(2, source.output.tone.levels),
        outline: source.output.line.enabled,
        outlineWidthPx: source.output.line.widthPx,
        semanticLines: source.output.line.enabled,
      }),
    }),
    output: Object.freeze({
      width,
      height,
      pixelRatio: 1,
      transparent: source.output.transparentBackground || source.background.mode === "transparent",
      preserveAlpha: true,
      smartLayer: true,
      semanticPasses: Object.freeze(["beauty", "line", "shadow", "depth", "normal", "object-id", "material-id"] as const),
    }),
    shots: Object.freeze(sourceShots.map((shot) => Object.freeze({
      id: shot.id,
      name: shot.name,
      cameraId: `camera:shot:${shot.id}`,
      hiddenEntityIds: Object.freeze((shot.nodeVisibility ?? []).filter((entry) => !entry.visible).map((entry) => entry.nodeId)),
      renderProfileOverride: null,
    }))),
    createdAt: now,
    updatedAt: now,
  });
  assertStudioScene3dDocument(document);
  return document;
}
