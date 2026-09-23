/**
 * Offered background-3D commands and plate capture over the real scene document.
 *
 * Camera, light, and prop placement share one StudioBg3dSceneDocument so undo and reload match.
 * The editor sidebar advertises these command ids; production hosts call applyStudio3dCommand
 * (or the patch helpers below) instead of a parallel fake scene.
 */

import {
  createDefaultStudioBg3dSceneDocument,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dLightingSettings,
  type StudioBg3dPrimitiveNode,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

export interface Studio3dCommandSpec {
  readonly id: "set-camera" | "set-light" | "place-prop";
  readonly label: string;
}

export type Studio3dScene = StudioBg3dSceneDocument;

export interface Studio3dHistory {
  readonly scene: Studio3dScene;
  readonly past: readonly Studio3dScene[];
}

export interface Studio3dPlates {
  readonly width: number;
  readonly height: number;
  readonly line: Uint8ClampedArray;
  readonly fill: Uint8ClampedArray;
}

export type Studio3dCommand =
  | { readonly id: "set-camera"; readonly yaw: number; readonly pitch: number; readonly fov: number }
  | { readonly id: "set-light"; readonly azimuth: number; readonly elevation: number; readonly intensity: number }
  | { readonly id: "place-prop"; readonly propId: string; readonly x: number; readonly y: number; readonly z: number };

export function listOfferedStudio3dCommands(): readonly Studio3dCommandSpec[] {
  return [
    { id: "set-camera", label: "카메라" },
    { id: "set-light", label: "라이트" },
    { id: "place-prop", label: "소품 배치" },
  ];
}

export function createStudio3dScene(): Studio3dScene {
  return createDefaultStudioBg3dSceneDocument();
}

export function createStudio3dHistory(scene: Studio3dScene = createStudio3dScene()): Studio3dHistory {
  return { scene, past: [] };
}

/** Editor lighting panel — same document applyStudio3dCommand mutates for set-light. */
export function applyStudio3dLightingSettings(
  scene: Studio3dScene,
  patch: Partial<StudioBg3dLightingSettings>,
): Studio3dScene {
  return normalizeStudioBg3dSceneDocument({
    ...scene,
    lighting: {
      ...scene.lighting,
      ...patch,
      ...(patch.key ? { key: { ...scene.lighting.key, ...patch.key } } : {}),
      ...(patch.fill ? { fill: { ...scene.lighting.fill, ...patch.fill } } : {}),
    },
  });
}


function orbitCamera(
  scene: Studio3dScene,
  yaw: number,
  pitch: number,
  fov: number,
): Studio3dScene {
  const target = scene.camera.target;
  const radius = Math.hypot(
    scene.camera.position[0] - target[0],
    scene.camera.position[1] - target[1],
    scene.camera.position[2] - target[2],
  ) || 8;
  const cp = Math.cos(pitch);
  const position = [
    target[0] + Math.sin(yaw) * cp * radius,
    target[1] + Math.sin(pitch) * radius,
    target[2] + Math.cos(yaw) * cp * radius,
  ] as const;
  return normalizeStudioBg3dSceneDocument({
    ...scene,
    camera: {
      ...scene.camera,
      position,
      fovDegrees: fov,
    },
  });
}

function lightFromSpherical(
  scene: Studio3dScene,
  azimuth: number,
  elevation: number,
  intensity: number,
): Studio3dScene {
  const direction = [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ] as const;
  return normalizeStudioBg3dSceneDocument({
    ...scene,
    lighting: {
      ...scene.lighting,
      key: {
        ...scene.lighting.key,
        direction,
        intensity,
      },
    },
  });
}

function upsertProp(
  scene: Studio3dScene,
  propId: string,
  x: number,
  y: number,
  z: number,
): Studio3dScene {
  const existing = scene.nodes.find((node) => node.id === propId);
  const node: StudioBg3dPrimitiveNode = {
    id: propId,
    name: existing?.name ?? propId,
    kind: "primitive",
    primitiveKind: existing && existing.kind === "primitive" ? existing.primitiveKind : "box",
    color: existing && existing.kind === "primitive" ? existing.color : "#c9a876",
    transform: {
      position: [x, y, z],
      rotation: existing?.transform.rotation ?? [0, 0, 0],
      scale: existing?.transform.scale ?? [1, 1, 1],
    },
    visible: existing?.visible ?? true,
    locked: existing?.locked ?? false,
    castsShadow: existing?.castsShadow ?? true,
    receivesShadow: existing?.receivesShadow ?? true,
    parentId: existing?.parentId ?? null,
  };
  const nodes = [...scene.nodes.filter((item) => item.id !== propId), node];
  return normalizeStudioBg3dSceneDocument({ ...scene, nodes });
}

/** Production lighting host calls this so offered light edits share the grade command document. */
export function patchStudio3dSceneLighting(
  scene: Studio3dScene,
  patch: {
    readonly azimuth?: number;
    readonly elevation?: number;
    readonly intensity?: number;
  },
): Studio3dScene {
  const current = scene.lighting.key.direction;
  const azimuth =
    patch.azimuth ??
    Math.atan2(current[0], current[2]);
  const elevation =
    patch.elevation ??
    Math.asin(Math.max(-1, Math.min(1, current[1])));
  const intensity = patch.intensity ?? scene.lighting.key.intensity;
  return lightFromSpherical(scene, azimuth, elevation, intensity);
}

/** Production camera host calls this for offered camera commands. */
export function patchStudio3dSceneCamera(
  scene: Studio3dScene,
  patch: { readonly yaw: number; readonly pitch: number; readonly fov: number },
): Studio3dScene {
  return orbitCamera(scene, patch.yaw, patch.pitch, patch.fov);
}

/** Production placement host calls this for offered prop placement. */
export function patchStudio3dSceneProp(
  scene: Studio3dScene,
  patch: { readonly propId: string; readonly x: number; readonly y: number; readonly z: number },
): Studio3dScene {
  return upsertProp(scene, patch.propId, patch.x, patch.y, patch.z);
}

export function applyStudio3dCommand(
  history: Studio3dHistory,
  command: Studio3dCommand,
): Studio3dHistory {
  const next =
    command.id === "set-camera"
      ? patchStudio3dSceneCamera(history.scene, command)
      : command.id === "set-light"
        ? patchStudio3dSceneLighting(history.scene, command)
        : patchStudio3dSceneProp(history.scene, command);
  return { scene: next, past: [...history.past, history.scene] };
}

export function undoStudio3d(history: Studio3dHistory): Studio3dHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return { scene: previous, past: history.past.slice(0, -1) };
}

export function serializeStudio3dScene(scene: Studio3dScene): string {
  const raw = serializeStudioBg3dSceneDocument(scene);
  if (!raw) throw new Error("배경 3D 장면을 직렬화할 수 없습니다.");
  return raw;
}

export function parseStudio3dScene(raw: string): Studio3dScene {
  const parsed = parseStudioBg3dSceneDocument(raw);
  if (!parsed) throw new Error("배경 3D 장면을 읽을 수 없습니다.");
  return parsed;
}

function projectNode(
  scene: Studio3dScene,
  position: readonly [number, number, number],
  width: number,
  height: number,
): { x: number; y: number; size: number } {
  const [px, py, pz] = scene.camera.position;
  const [tx, ty, tz] = scene.camera.target;
  const forward = [tx - px, ty - py, tz - pz] as const;
  const fl = Math.hypot(forward[0], forward[1], forward[2]) || 1;
  const f = [forward[0] / fl, forward[1] / fl, forward[2] / fl] as const;
  const rel = [position[0] - px, position[1] - py, position[2] - pz] as const;
  const depth = rel[0] * f[0] + rel[1] * f[1] + rel[2] * f[2];
  const fov = (scene.camera.fovDegrees * Math.PI) / 180;
  const scale = height / (2 * Math.tan(fov / 2) * Math.max(0.35, depth));
  const right = [f[2], 0, -f[0]] as const;
  const rl = Math.hypot(right[0], right[2]) || 1;
  const r = [right[0] / rl, 0, right[2] / rl] as const;
  const up = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ] as const;
  const x = width * 0.5 + (rel[0] * r[0] + rel[1] * r[1] + rel[2] * r[2]) * scale;
  const y = height * 0.55 - (rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2]) * scale;
  const size = Math.max(6, 28 * (scale / height) * width * 0.04);
  return { x, y, size };
}

export function captureStudio3dPlates(
  scene: Studio3dScene,
  width: number,
  height: number,
): Studio3dPlates {
  const fill = new Uint8ClampedArray(width * height * 4);
  const light = Math.max(0.25, Math.min(1.6, scene.lighting.key.intensity));
  const sky = [
    Math.round(168 * light),
    Math.round(188 * light),
    Math.round(214 * light),
  ] as const;
  const ground = [
    Math.round(92 * light),
    Math.round(78 * light),
    Math.round(64 * light),
  ] as const;
  const pitch = Math.asin(
    Math.max(
      -1,
      Math.min(
        1,
        (scene.camera.position[1] - scene.camera.target[1]) /
          (Math.hypot(
            scene.camera.position[0] - scene.camera.target[0],
            scene.camera.position[1] - scene.camera.target[1],
            scene.camera.position[2] - scene.camera.target[2],
          ) || 1),
      ),
    ),
  );
  const horizon = Math.round(height * (0.58 - pitch * 0.08));
  for (let y = 0; y < height; y += 1) {
    const color = y < horizon ? sky : ground;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      fill[i] = color[0];
      fill[i + 1] = color[1];
      fill[i + 2] = color[2];
      fill[i + 3] = 255;
    }
  }

  const shade = Math.round(40 + 50 * Math.max(0, scene.lighting.key.direction[1]));
  for (const node of scene.nodes) {
    if (!node.visible) continue;
    const placed = projectNode(scene, node.transform.position, width, height);
    for (let y = Math.round(placed.y); y < placed.y + placed.size * 1.4; y += 1) {
      for (let x = Math.round(placed.x); x < placed.x + placed.size; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = (y * width + x) * 4;
        fill[i] = shade;
        fill[i + 1] = shade - 8;
        fill[i + 2] = shade - 16;
        fill[i + 3] = 255;
      }
    }
  }

  const line = new Uint8ClampedArray(width * height * 4);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const right = (y * width + x + 1) * 4;
      const below = ((y + 1) * width + x) * 4;
      const delta =
        Math.abs(fill[i] - fill[right]) +
        Math.abs(fill[i] - fill[below]) +
        Math.abs(fill[i + 1] - fill[right + 1]) +
        Math.abs(fill[i + 1] - fill[below + 1]);
      if (delta > 12) {
        line[i] = 20;
        line[i + 1] = 16;
        line[i + 2] = 16;
        line[i + 3] = 255;
      }
    }
  }
  return { width, height, line, fill };
}

export function plateCoverage(
  plate: Uint8ClampedArray,
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (plate[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return { width: 0, height: 0 };
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function linePlateIsStroke(line: Uint8ClampedArray): boolean {
  let ink = 0;
  let clear = 0;
  for (let i = 3; i < line.length; i += 4) {
    if (line[i] > 16) ink += 1;
    else clear += 1;
  }
  return ink > 8 && clear > ink;
}
