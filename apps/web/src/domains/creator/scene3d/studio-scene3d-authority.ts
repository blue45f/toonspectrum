import {
  normalizeStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
  type StudioBg3dSceneNode,
  type StudioBg3dTransform,
  type StudioBg3dVec3,
} from "../bg3d/studio-bg3d-scene-document";
import { studioBg3dFocalLengthToFovDegrees } from "../bg3d/studio-bg3d-lens";
import {
  type StudioShared3dCharacterSource,
  type StudioShared3dCharacterTransformUpdateRequest,
  type StudioShared3dSceneSession,
} from "../studio-shared-3d-scene-bridge";
import { sha256HexPortable } from "../studio-sha256";
import { serializeStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { projectStudioBg3dDocumentToScene3d } from "./studio-scene3d-bg3d-projection";
import {
  assertStudioScene3dDocument,
  type StudioScene3dAssetReference,
  type StudioScene3dCharacterEntity,
  type StudioScene3dDocumentV1,
  type StudioScene3dEntity,
  type StudioScene3dQuat,
  type StudioScene3dTransform,
} from "./studio-scene3d-document";

export const STUDIO_SCENE3D_AUTHORITY_KIND = "toonspectrum.scene3d-authority" as const;
export const STUDIO_SCENE3D_AUTHORITY_VERSION = 1 as const;

export type StudioScene3dAuthorityBinding =
  | {
      readonly kind: "bg3d-node";
      readonly entityId: string;
      readonly sourceNodeId: string;
    }
  | {
      readonly kind: "linked-vrm";
      readonly entityId: string;
      readonly elementId: string;
      readonly expectedRuntimeKey: string;
      readonly expectedPlacementHash: `sha256:${string}`;
    };

export interface StudioScene3dAuthoritySnapshot {
  readonly kind: typeof STUDIO_SCENE3D_AUTHORITY_KIND;
  readonly version: typeof STUDIO_SCENE3D_AUTHORITY_VERSION;
  readonly authorityId: string;
  readonly sourceHash: `sha256:${string}`;
  readonly document: StudioScene3dDocumentV1;
  readonly bg3d: StudioBg3dSceneDocument;
  readonly characters: readonly StudioShared3dCharacterSource[];
  readonly bindings: readonly StudioScene3dAuthorityBinding[];
}

export type StudioScene3dAuthorityIssueCode =
  | "unsupported-entity"
  | "unsupported-parent"
  | "linked-character-removal"
  | "linked-character-scale"
  | "missing-bg3d-attachment"
  | "unsafe-bg3d-node-id";

export interface StudioScene3dAuthorityIssue {
  readonly code: StudioScene3dAuthorityIssueCode;
  readonly entityId: string;
  readonly message: string;
}

export interface StudioScene3dAuthorityProjection {
  readonly bg3d: StudioBg3dSceneDocument;
  readonly characterTransformRequests: readonly StudioShared3dCharacterTransformUpdateRequest[];
  readonly changedEntityIds: readonly string[];
  readonly issues: readonly StudioScene3dAuthorityIssue[];
}

function hashText(value: string): `sha256:${string}` {
  return `sha256:${sha256HexPortable(new TextEncoder().encode(value))}`;
}

function canonicalAuthoritySourceText(
  bg3d: StudioBg3dSceneDocument,
  characters: readonly StudioShared3dCharacterSource[],
): string {
  const serialized = serializeStudioBg3dSceneDocument(bg3d);
  if (!serialized) throw new Error("canonical BG3D scene could not be serialized");
  return JSON.stringify({
    bg3d: serialized,
    characters: characters.map((character) => ({
      elementId: character.elementId,
      sourceHash: character.sourceHash,
      runtimeKey: character.runtimeKey,
      placementHash: character.placementHash,
      stageTransform: character.stageTransform,
    })),
  });
}

function characterEntityId(elementId: string): string {
  return `character:${elementId}`;
}

function yawQuaternion(yaw: number): StudioScene3dQuat {
  const half = yaw / 2;
  return Object.freeze([0, Math.sin(half), 0, Math.cos(half)] as const);
}

function characterAsset(character: StudioShared3dCharacterSource): StudioScene3dAssetReference {
  const serialized = serializeStudioVrmSceneDocument(character.scene);
  if (!serialized) throw new Error(`linked VRM ${character.elementId} is not canonical`);
  const contentSha256 = character.sourceHash.replace(/^sha256:/u, "");
  return Object.freeze({
    id: `character-asset:${character.elementId}`,
    kind: "character",
    version: contentSha256.slice(0, 12),
    contentSha256,
    uri: `character-source:${character.elementId}`,
    mime: "model/vrm",
    byteSize: Math.max(1, new TextEncoder().encode(serialized).byteLength),
    rights: Object.freeze({
      commercialUse: false,
      redistribution: false,
      derivativeUse: false,
      licenseName: "source-character-authority",
    }),
    quality: Object.freeze({
      accepted: false,
      score: 0,
      reportUri: "/assets/3d/quality/linked-character-unreviewed.json",
    }),
  });
}

function characterEntity(character: StudioShared3dCharacterSource): StudioScene3dCharacterEntity {
  return Object.freeze({
    id: characterEntityId(character.elementId),
    name: character.label,
    kind: "character",
    assetId: `character-asset:${character.elementId}`,
    characterDocumentId: character.sourceHash,
    characterRevision: 0,
    transform: Object.freeze({
      position: Object.freeze([...character.stageTransform.position] as [number, number, number]),
      rotation: yawQuaternion(character.stageTransform.rotationY),
      scale: Object.freeze([1, 1, 1] as const),
    }),
    visible: true,
    locked: false,
    castShadow: true,
    receiveShadow: false,
    parentId: null,
  });
}

export function createStudioScene3dAuthority(input: {
  readonly authorityId: string;
  readonly bg3d: StudioBg3dSceneDocument;
  readonly sharedSceneSession?: StudioShared3dSceneSession | null;
  readonly viewportAspectRatio?: number;
  readonly revision?: number;
  readonly now?: string;
}): StudioScene3dAuthoritySnapshot {
  const bg3d = normalizeStudioBg3dSceneDocument(input.bg3d);
  const characters = Object.freeze([...(input.sharedSceneSession?.characters ?? [])]);
  const base = projectStudioBg3dDocumentToScene3d({
    documentId: input.authorityId,
    source: bg3d,
    viewportAspectRatio: input.viewportAspectRatio,
    revision: input.revision,
    now: input.now,
  });
  const document = Object.freeze({
    ...base,
    assets: Object.freeze([...base.assets, ...characters.map(characterAsset)]),
    entities: Object.freeze([...base.entities, ...characters.map(characterEntity)]),
  });
  assertStudioScene3dDocument(document);
  const bindings: StudioScene3dAuthorityBinding[] = [
    ...bg3d.nodes.map((node) => Object.freeze({
      kind: "bg3d-node" as const,
      entityId: node.id,
      sourceNodeId: node.id,
    })),
    ...characters.map((character) => Object.freeze({
      kind: "linked-vrm" as const,
      entityId: characterEntityId(character.elementId),
      elementId: character.elementId,
      expectedRuntimeKey: character.runtimeKey,
      expectedPlacementHash: character.placementHash,
    })),
  ];
  return Object.freeze({
    kind: STUDIO_SCENE3D_AUTHORITY_KIND,
    version: STUDIO_SCENE3D_AUTHORITY_VERSION,
    authorityId: input.authorityId,
    sourceHash: hashText(canonicalAuthoritySourceText(bg3d, characters)),
    document,
    bg3d,
    characters,
    bindings: Object.freeze(bindings),
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Three.js-compatible intrinsic XYZ decomposition without importing an engine class. */
function quaternionToEulerXyz(quaternion: StudioScene3dQuat): StudioBg3dVec3 {
  const [x, y, z, w] = quaternion;
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const ry = Math.asin(clamp(m13, -1, 1));
  if (Math.abs(m13) < 0.9999999) {
    return Object.freeze([
      Math.atan2(-m23, m33),
      ry,
      Math.atan2(-m12, m11),
    ] as const);
  }
  return Object.freeze([Math.atan2(m32, m22), ry, 0] as const);
}

function quaternionYaw(quaternion: StudioScene3dQuat): number {
  const [x, y, z, w] = quaternion;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}

function projectTransform(transform: StudioScene3dTransform): StudioBg3dTransform {
  return Object.freeze({
    position: Object.freeze([...transform.position] as [number, number, number]),
    rotation: quaternionToEulerXyz(transform.rotation),
    scale: Object.freeze([...transform.scale] as [number, number, number]),
  });
}

function isSafeBg3dId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u.test(value)
    && !["constructor", "prototype", "__proto__"].includes(value.toLowerCase());
}

function issue(
  code: StudioScene3dAuthorityIssueCode,
  entityId: string,
  message: string,
): StudioScene3dAuthorityIssue {
  return Object.freeze({ code, entityId, message });
}

function createNodeFromUnboundEntity(
  entity: StudioScene3dEntity,
  assets: ReadonlyMap<string, StudioScene3dAssetReference>,
  existingIds: ReadonlySet<string>,
): { readonly node: StudioBg3dSceneNode | null; readonly issue: StudioScene3dAuthorityIssue | null } {
  if (!isSafeBg3dId(entity.id) || existingIds.has(entity.id)) {
    return { node: null, issue: issue(
      "unsafe-bg3d-node-id",
      entity.id,
      "새 Scene3D 객체 ID를 BG3D 문서에 안전하게 보존할 수 없습니다.",
    ) };
  }
  const base = {
    id: entity.id,
    name: entity.name,
    transform: projectTransform(entity.transform),
    visible: entity.visible,
    locked: entity.locked,
    castsShadow: entity.castShadow,
    receivesShadow: entity.receiveShadow,
    parentId: entity.parentId,
  } as const;
  if (entity.kind === "primitive") {
    return {
      node: Object.freeze({
        ...base,
        kind: "primitive" as const,
        primitiveKind: entity.primitiveKind,
        color: entity.color,
      }),
      issue: null,
    };
  }
  if (entity.kind === "model") {
    const asset = assets.get(entity.assetId);
    const attachmentId = asset?.uri.startsWith("attachment:")
      ? asset.uri.slice("attachment:".length)
      : null;
    if (!attachmentId) {
      return { node: null, issue: issue(
        "missing-bg3d-attachment",
        entity.id,
        "Scene3D 모델이 BG3D attachment를 참조하지 않아 가져오지 않았습니다.",
      ) };
    }
    return {
      node: Object.freeze({ ...base, kind: "model" as const, attachmentId }),
      issue: null,
    };
  }
  return { node: null, issue: issue(
    "unsupported-entity",
    entity.id,
    "이 Scene3D 객체 종류는 BG3D 원본으로 역투영할 수 없습니다.",
  ) };
}

function sameVec3(left: readonly number[], right: readonly number[], epsilon = 1e-6): boolean {
  return left.length === right.length && left.every((value, index) =>
    Math.abs(value - (right[index] ?? Number.NaN)) <= epsilon);
}

function projectBg3dPresentation(
  source: StudioBg3dSceneDocument,
  document: StudioScene3dDocumentV1,
): Pick<StudioBg3dSceneDocument, "camera" | "render" | "background" | "lighting" | "output"> {
  const camera = document.cameras.find((entry) => entry.id === document.activeCameraId)
    ?? document.cameras[0]!;
  const key = document.lights.find((light) => light.id === "light:key");
  const fill = document.lights.find((light) => light.id === "light:fill");
  const lightDirection = (light: typeof key, fallback: StudioBg3dVec3): StudioBg3dVec3 => {
    if (!light) return fallback;
    const raw = [
      light.position[0] - light.target[0],
      light.position[1] - light.target[1],
      light.position[2] - light.target[2],
    ] as const;
    const length = Math.hypot(...raw);
    return length > 1e-9
      ? Object.freeze(raw.map((value) => value / length) as [number, number, number])
      : fallback;
  };
  const backgroundMode = document.environment.mode === "transparent"
    ? "transparent"
    : document.environment.mode === "procedural-sky"
      ? "sky-preset"
      : document.environment.mode === "color"
        ? "color"
        : source.background.mode;
  return {
    camera: Object.freeze({
      position: Object.freeze([...camera.position] as [number, number, number]),
      target: Object.freeze([...camera.target] as [number, number, number]),
      fovDegrees: studioBg3dFocalLengthToFovDegrees(camera.focalLengthMm),
      projection: camera.projection,
      zoom: camera.projection === "orthographic" ? 5 / Math.max(0.001, camera.orthoScale) : 1,
      lensShift: Object.freeze([...camera.lensShift] as [number, number]),
      nearClip: camera.near,
      up: Object.freeze([...camera.up] as [number, number, number]),
    }),
    render: Object.freeze({
      ...source.render,
      antialias: document.render.antialiasing !== "none",
      shadows: document.render.shadows.enabled,
      exposure: document.render.exposure,
      toneMapping: document.render.toneMapping,
    }),
    background: Object.freeze({
      ...source.background,
      mode: backgroundMode,
      color: document.environment.color,
      panoramaRotation: document.environment.rotationDegrees,
      fogEnabled: document.environment.fog?.enabled ?? false,
      fogColor: document.environment.fog?.color ?? source.background.fogColor,
      fogNear: document.environment.fog?.near ?? source.background.fogNear,
      fogFar: document.environment.fog?.far ?? source.background.fogFar,
    }),
    lighting: Object.freeze({
      ...source.lighting,
      ambientIntensity: document.environment.intensity,
      key: Object.freeze({
        ...source.lighting.key,
        ...(key ? {
          color: key.color,
          intensity: key.intensity,
          castsShadow: key.castShadow,
          direction: lightDirection(key, source.lighting.key.direction),
        } : {}),
      }),
      fill: Object.freeze({
        ...source.lighting.fill,
        ...(fill ? {
          color: fill.color,
          intensity: fill.intensity,
          castsShadow: fill.castShadow,
          direction: lightDirection(fill, source.lighting.fill.direction),
        } : {}),
      }),
    }),
    output: Object.freeze({
      ...source.output,
      transparentBackground: document.output.transparent,
      exportHeight: document.output.height,
      exportAspectRatio: document.output.width / document.output.height,
      line: Object.freeze({
        ...source.output.line,
        enabled: document.render.toon.outline,
        widthPx: document.render.toon.outlineWidthPx,
      }),
      tone: Object.freeze({
        ...source.output.tone,
        mode: document.render.toon.enabled
          ? source.output.tone.mode === "none" ? "cel" : source.output.tone.mode
          : "none",
        levels: document.render.toon.rampSteps,
      }),
    }),
  };
}

export function projectStudioScene3dAuthorityToSources(
  authority: StudioScene3dAuthoritySnapshot,
  document: StudioScene3dDocumentV1,
): StudioScene3dAuthorityProjection {
  assertStudioScene3dDocument(document);
  if (document.documentId !== authority.document.documentId) {
    throw new Error("Scene3D authority document id mismatch");
  }
  if (document.revision < authority.document.revision) {
    throw new Error("Scene3D authority revision moved backwards");
  }
  const entityById = new Map(document.entities.map((entity) => [entity.id, entity] as const));
  const assetById = new Map(document.assets.map((asset) => [asset.id, asset] as const));
  const bgBindingByNodeId = new Map(
    authority.bindings
      .filter((binding): binding is Extract<StudioScene3dAuthorityBinding, { kind: "bg3d-node" }> =>
        binding.kind === "bg3d-node")
      .map((binding) => [binding.sourceNodeId, binding] as const),
  );
  const representedEntityIds = new Set(authority.bindings.map((binding) => binding.entityId));
  const issues: StudioScene3dAuthorityIssue[] = [];
  const changedEntityIds = new Set<string>();
  const existingIds = new Set(authority.bg3d.nodes.map((node) => node.id));

  const nodes = authority.bg3d.nodes.flatMap((sourceNode) => {
    const binding = bgBindingByNodeId.get(sourceNode.id);
    const entity = binding ? entityById.get(binding.entityId) : undefined;
    if (!entity) {
      changedEntityIds.add(sourceNode.id);
      return [];
    }
    if (entity.kind !== sourceNode.kind) {
      issues.push(issue(
        "unsupported-entity",
        entity.id,
        "Scene3D 객체 종류 변경은 원본 BG3D 노드에 적용하지 않았습니다.",
      ));
      return [sourceNode];
    }
    const parentId = entity.parentId && entityById.get(entity.parentId)?.kind === "character"
      ? null
      : entity.parentId;
    if (entity.parentId !== parentId) {
      issues.push(issue(
        "unsupported-parent",
        entity.id,
        "BG3D 노드를 연결 캐릭터 아래에 둘 수 없어 루트로 유지했습니다.",
      ));
    }
    const common = {
      ...sourceNode,
      name: entity.name,
      transform: projectTransform(entity.transform),
      visible: entity.visible,
      locked: entity.locked,
      castsShadow: entity.castShadow,
      receivesShadow: entity.receiveShadow,
      parentId,
    };
    const next = sourceNode.kind === "primitive" && entity.kind === "primitive"
      ? Object.freeze({ ...common, color: entity.color })
      : Object.freeze(common);
    if (JSON.stringify(next) !== JSON.stringify(sourceNode)) changedEntityIds.add(sourceNode.id);
    return [next as StudioBg3dSceneNode];
  });

  for (const entity of document.entities) {
    if (representedEntityIds.has(entity.id)) continue;
    const projected = createNodeFromUnboundEntity(entity, assetById, existingIds);
    if (projected.issue) issues.push(projected.issue);
    if (projected.node) {
      nodes.push(projected.node);
      existingIds.add(projected.node.id);
      changedEntityIds.add(projected.node.id);
    }
  }

  const characterTransformRequests: StudioShared3dCharacterTransformUpdateRequest[] = [];
  for (const binding of authority.bindings) {
    if (binding.kind !== "linked-vrm") continue;
    const entity = entityById.get(binding.entityId);
    const source = authority.characters.find((character) => character.elementId === binding.elementId);
    if (!source) continue;
    if (!entity || entity.kind !== "character") {
      issues.push(issue(
        "linked-character-removal",
        binding.entityId,
        "연결 캐릭터는 원본 레이어 권한을 유지하므로 Scene3D 문서에서 삭제할 수 없습니다.",
      ));
      continue;
    }
    if (!sameVec3(entity.transform.scale, [1, 1, 1])) {
      issues.push(issue(
        "linked-character-scale",
        entity.id,
        "연결 캐릭터 체형 배율은 VRM 원본에서 편집해야 하므로 Stage scale은 적용하지 않았습니다.",
      ));
    }
    const transform = Object.freeze({
      position: Object.freeze([...entity.transform.position] as [number, number, number]),
      rotationY: quaternionYaw(entity.transform.rotation),
    });
    if (
      !sameVec3(transform.position, source.stageTransform.position)
      || Math.abs(transform.rotationY - source.stageTransform.rotationY) > 1e-6
    ) {
      characterTransformRequests.push(Object.freeze({
        elementId: binding.elementId,
        expectedRuntimeKey: binding.expectedRuntimeKey,
        expectedPlacementHash: binding.expectedPlacementHash,
        transform,
      }));
      changedEntityIds.add(entity.id);
    }
  }

  const presentation = projectBg3dPresentation(authority.bg3d, document);
  const bg3d = normalizeStudioBg3dSceneDocument({
    ...authority.bg3d,
    ...presentation,
    nodes,
  });
  return Object.freeze({
    bg3d,
    characterTransformRequests: Object.freeze(characterTransformRequests),
    changedEntityIds: Object.freeze([...changedEntityIds].toSorted()),
    issues: Object.freeze(issues),
  });
}
