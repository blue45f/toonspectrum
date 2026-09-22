/**
 * Background plates and the 3D commands the background editor offers.
 * Camera, light, and prop placement all go through one document so undo and reload match.
 */

export interface Studio3dCommandSpec {
  readonly id: "set-camera" | "set-light" | "place-prop";
  readonly label: string;
}

export interface Studio3dProp {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Studio3dScene {
  readonly camera: { readonly yaw: number; readonly pitch: number; readonly fov: number };
  readonly light: { readonly azimuth: number; readonly elevation: number; readonly intensity: number };
  readonly props: readonly Studio3dProp[];
}

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

export function listOfferedStudio3dCommands(): readonly Studio3dCommandSpec[] {
  return [
    { id: "set-camera", label: "카메라" },
    { id: "set-light", label: "라이트" },
    { id: "place-prop", label: "소품 배치" },
  ];
}

export function createStudio3dScene(): Studio3dScene {
  return {
    camera: { yaw: 0.2, pitch: 0.15, fov: 38 },
    light: { azimuth: 0.6, elevation: 0.8, intensity: 1 },
    props: [{ id: "desk", x: 0.15, y: 0, z: 0.4 }],
  };
}

export function createStudio3dHistory(scene: Studio3dScene = createStudio3dScene()): Studio3dHistory {
  return { scene, past: [] };
}

function cloneScene(scene: Studio3dScene): Studio3dScene {
  return {
    camera: { ...scene.camera },
    light: { ...scene.light },
    props: scene.props.map((prop) => ({ ...prop })),
  };
}

export type Studio3dCommand =
  | { readonly id: "set-camera"; readonly yaw: number; readonly pitch: number; readonly fov: number }
  | { readonly id: "set-light"; readonly azimuth: number; readonly elevation: number; readonly intensity: number }
  | { readonly id: "place-prop"; readonly propId: string; readonly x: number; readonly y: number; readonly z: number };

export function applyStudio3dCommand(history: Studio3dHistory, command: Studio3dCommand): Studio3dHistory {
  const scene = cloneScene(history.scene);
  const next = command.id === "set-camera"
    ? { ...scene, camera: { yaw: command.yaw, pitch: command.pitch, fov: command.fov } }
    : command.id === "set-light"
      ? { ...scene, light: { azimuth: command.azimuth, elevation: command.elevation, intensity: command.intensity } }
      : {
        ...scene,
        props: [...scene.props.filter((prop) => prop.id !== command.propId), { id: command.propId, x: command.x, y: command.y, z: command.z }],
      };
  return { scene: next, past: [...history.past, history.scene] };
}

export function undoStudio3d(history: Studio3dHistory): Studio3dHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return { scene: previous, past: history.past.slice(0, -1) };
}

export function serializeStudio3dScene(scene: Studio3dScene): string {
  return JSON.stringify(scene);
}

export function parseStudio3dScene(raw: string): Studio3dScene {
  const value = JSON.parse(raw) as Studio3dScene;
  return {
    camera: { yaw: Number(value.camera.yaw), pitch: Number(value.camera.pitch), fov: Number(value.camera.fov) },
    light: { azimuth: Number(value.light.azimuth), elevation: Number(value.light.elevation), intensity: Number(value.light.intensity) },
    props: value.props.map((prop) => ({ id: String(prop.id), x: Number(prop.x), y: Number(prop.y), z: Number(prop.z) })),
  };
}

function project(scene: Studio3dScene, prop: Studio3dProp, width: number, height: number) {
  const x = width * (0.5 + (prop.x + Math.sin(scene.camera.yaw) * prop.z) * 0.35);
  const y = height * (0.62 - prop.y * 0.2 - Math.sin(scene.camera.pitch) * prop.z * 0.15);
  const size = Math.max(8, width * 0.08 * (scene.camera.fov / 38));
  return { x, y, size };
}

export function captureStudio3dPlates(scene: Studio3dScene, width: number, height: number): Studio3dPlates {
  const fill = new Uint8ClampedArray(width * height * 4);
  const light = Math.max(0.25, Math.min(1.6, scene.light.intensity));
  const sky = [Math.round(168 * light), Math.round(188 * light), Math.round(214 * light)];
  const ground = [Math.round(92 * light), Math.round(78 * light), Math.round(64 * light)];
  const horizon = Math.round(height * (0.58 - scene.camera.pitch * 0.08));
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
  for (const prop of scene.props) {
    const placed = project(scene, prop, width, height);
    const shade = Math.round(40 + 50 * scene.light.elevation);
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
      const delta = Math.abs(fill[i] - fill[right]) + Math.abs(fill[i] - fill[below])
        + Math.abs(fill[i + 1] - fill[right + 1]) + Math.abs(fill[i + 1] - fill[below + 1]);
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

export function plateCoverage(plate: Uint8ClampedArray, width: number, height: number): { readonly width: number; readonly height: number } {
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
