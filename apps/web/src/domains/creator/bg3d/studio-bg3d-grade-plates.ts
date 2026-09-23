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

export type Studio3dOfferedCommandId =
  | "set-camera"
  | "set-light"
  | "place-prop"
  | "set-fill-light"
  | "set-background"
  | "remove-prop";

export interface Studio3dCommandSpec {
  readonly id: Studio3dOfferedCommandId;
  readonly label: string;
}

export type Studio3dScene = StudioBg3dSceneDocument;

export interface Studio3dHistory {
  readonly scene: Studio3dScene;
  readonly past: readonly Studio3dScene[];
  readonly future: readonly Studio3dScene[];
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
  | { readonly id: "place-prop"; readonly propId: string; readonly x: number; readonly y: number; readonly z: number }
  | { readonly id: "set-fill-light"; readonly azimuth: number; readonly elevation: number; readonly intensity: number }
  | {
      readonly id: "set-background";
      readonly mode?: Studio3dScene["background"]["mode"];
      readonly color?: string;
      readonly skyPresetId?: Studio3dScene["background"]["skyPresetId"];
    }
  | { readonly id: "remove-prop"; readonly propId: string };

export function listOfferedStudio3dCommands(): readonly Studio3dCommandSpec[] {
  return [
    { id: "set-camera", label: "카메라" },
    { id: "set-light", label: "키 라이트" },
    { id: "set-fill-light", label: "필 라이트" },
    { id: "set-background", label: "배경" },
    { id: "place-prop", label: "소품 배치" },
    { id: "remove-prop", label: "소품 제거" },
  ];
}

export function createStudio3dScene(): Studio3dScene {
  return createDefaultStudioBg3dSceneDocument();
}

export function createStudio3dHistory(scene: Studio3dScene = createStudio3dScene()): Studio3dHistory {
  return {
    scene: normalizeStudioBg3dSceneDocument(scene),
    past: [],
    future: [],
  };
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

function fillLightFromSpherical(
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
      fill: {
        ...scene.lighting.fill,
        direction,
        intensity,
      },
    },
  });
}

function patchBackground(
  scene: Studio3dScene,
  patch: {
    readonly mode?: Studio3dScene["background"]["mode"];
    readonly color?: string;
    readonly skyPresetId?: Studio3dScene["background"]["skyPresetId"];
  },
): Studio3dScene {
  return normalizeStudioBg3dSceneDocument({
    ...scene,
    background: {
      ...scene.background,
      ...(patch.mode ? { mode: patch.mode } : {}),
      ...(patch.color ? { color: patch.color } : {}),
      ...(patch.skyPresetId ? { skyPresetId: patch.skyPresetId } : {}),
    },
  });
}

function removeProp(scene: Studio3dScene, propId: string): Studio3dScene {
  return normalizeStudioBg3dSceneDocument({
    ...scene,
    nodes: scene.nodes.filter((node) => node.id !== propId),
  });
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

/** Production fill-light edits share the grade command document. */
export function patchStudio3dSceneFillLight(
  scene: Studio3dScene,
  patch: {
    readonly azimuth?: number;
    readonly elevation?: number;
    readonly intensity?: number;
  },
): Studio3dScene {
  const current = scene.lighting.fill.direction;
  const azimuth = patch.azimuth ?? Math.atan2(current[0], current[2]);
  const elevation = patch.elevation ?? Math.asin(Math.max(-1, Math.min(1, current[1])));
  const intensity = patch.intensity ?? scene.lighting.fill.intensity;
  return fillLightFromSpherical(scene, azimuth, elevation, intensity);
}

/** Production background panel calls this for offered background commands. */
export function patchStudio3dSceneBackground(
  scene: Studio3dScene,
  patch: {
    readonly mode?: Studio3dScene["background"]["mode"];
    readonly color?: string;
    readonly skyPresetId?: Studio3dScene["background"]["skyPresetId"];
  },
): Studio3dScene {
  return patchBackground(scene, patch);
}

/** Production placement host calls this to remove an offered prop. */
export function patchStudio3dSceneRemoveProp(scene: Studio3dScene, propId: string): Studio3dScene {
  return removeProp(scene, propId);
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
        : command.id === "set-fill-light"
          ? patchStudio3dSceneFillLight(history.scene, command)
          : command.id === "set-background"
            ? patchStudio3dSceneBackground(history.scene, command)
            : command.id === "remove-prop"
              ? patchStudio3dSceneRemoveProp(history.scene, command.propId)
              : patchStudio3dSceneProp(history.scene, command);
  return { scene: next, past: [...history.past, history.scene], future: [] };
}

export function undoStudio3d(history: Studio3dHistory): Studio3dHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    scene: previous,
    past: history.past.slice(0, -1),
    future: [history.scene, ...history.future],
  };
}

export function redoStudio3d(history: Studio3dHistory): Studio3dHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    scene: next,
    past: [...history.past, history.scene],
    future: history.future.slice(1),
  };
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
  const keyIntensity = Number.isFinite(scene.lighting.key.intensity) ? scene.lighting.key.intensity : 1;
  const fillIntensity = Number.isFinite(scene.lighting.fill.intensity) ? scene.lighting.fill.intensity : 0.35;
  const light = Math.max(0.2, Math.min(1.8, keyIntensity * 0.72 + fillIntensity * 0.28));
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
  const bgMode = scene.background.mode;
  const bgRgb = parseCssHexColor(scene.background.color);
  for (let y = 0; y < height; y += 1) {
    let color: readonly [number, number, number];
    if (bgMode === "color" && bgRgb) {
      color = [
        Math.round(bgRgb[0] * Math.min(1.4, light)),
        Math.round(bgRgb[1] * Math.min(1.4, light)),
        Math.round(bgRgb[2] * Math.min(1.4, light)),
      ] as const;
    } else if (bgMode === "transparent") {
      color = [0, 0, 0];
    } else {
      color = y < horizon ? sky : ground;
    }
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      fill[i] = color[0];
      fill[i + 1] = color[1];
      fill[i + 2] = color[2];
      fill[i + 3] = bgMode === "transparent" ? 0 : 255;
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

  const lineSettings = scene.output.line;
  const lineEnabled = lineSettings.enabled !== false;
  const lineWidth = Math.max(1, Math.round(lineSettings.widthPx || 1));
  const lineStrength = Math.max(0, Math.min(1, lineSettings.strength ?? 0.8));
  const lineRgb = parseCssHexColor(lineSettings.color) ?? ([20, 16, 16] as const);
  const lineAlpha = Math.round(255 * lineStrength);
  const edge = new Uint8ClampedArray(width * height);
  if (lineEnabled && lineStrength > 0) {
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
        if (delta > 12) edge[y * width + x] = 1;
      }
    }
  }
  const line = new Uint8ClampedArray(width * height * 4);
  const radius = Math.max(0, lineWidth - 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!edge[y * width + x]) continue;
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const i = (ny * width + nx) * 4;
          line[i] = lineRgb[0];
          line[i + 1] = lineRgb[1];
          line[i + 2] = lineRgb[2];
          line[i + 3] = Math.max(line[i + 3], lineAlpha);
        }
      }
    }
  }
  return { width, height, line, fill };
}

function parseCssHexColor(color: string | undefined): readonly [number, number, number] | null {
  if (!color || typeof color !== "string") return null;
  const raw = color.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u.exec(raw);
  if (!match) return null;
  const hex = match[1]!;
  if (hex.length === 3) {
    return [
      Number.parseInt(hex[0]! + hex[0]!, 16),
      Number.parseInt(hex[1]! + hex[1]!, 16),
      Number.parseInt(hex[2]! + hex[2]!, 16),
    ] as const;
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ] as const;
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
