/**
 * Shaper-grade character session: presets survive a pose change, drawings stay on
 * a body region, a reference image suggests presets, and a photograph sets the arms.
 * Capture and PSD export run on this same session without a second character model.
 */

export const SHAPER_REST_UPPER_ARM = Math.PI / 2;

export type ShaperBodyRegion = "head" | "hair" | "torso" | "left-upper-arm" | "right-upper-arm";

export interface ShaperImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface ShaperDrawing {
  readonly id: string;
  readonly region: ShaperBodyRegion;
  readonly u: number;
  readonly v: number;
  readonly rgba: readonly [number, number, number, number];
}

export interface ShaperPose {
  readonly leftUpperArm: number;
  readonly rightUpperArm: number;
}

export interface ShaperCharacter {
  readonly face: string;
  readonly hair: string;
  readonly clothes: string;
  readonly pose: ShaperPose;
  readonly drawings: readonly ShaperDrawing[];
}

export interface ShaperPresetSuggestion {
  readonly face: string;
  readonly hair: string;
  readonly clothes: string;
}

export type ShaperPoseRead = {
  readonly ok: true;
  readonly character: ShaperCharacter;
  readonly detected: ShaperPose;
  readonly source: "photo" | "camera";
} | {
  readonly ok: false;
  readonly character: ShaperCharacter;
  readonly reason: string;
  readonly source: "photo" | "camera";
};

export interface ShaperPsdLayer {
  readonly name: string;
  readonly rgba: Uint8ClampedArray;
  readonly visible: boolean;
  readonly blend: "source-over" | "multiply";
}

export interface ShaperPsdOmission {
  readonly name: string;
  readonly reason: string;
}

export interface ShaperPsdExport {
  readonly width: number;
  readonly height: number;
  readonly beauty: Uint8ClampedArray;
  readonly layers: readonly ShaperPsdLayer[];
  readonly omissions: readonly ShaperPsdOmission[];
}

const FACE_ROUND = "face-shape:round";
const FACE_OVAL = "face-shape:oval";
const FACE_BALANCED = "face-shape:balanced";
const HAIR_LONG = "hair:long";
const HAIR_BOB = "hair:bob";
const HAIR_SHORT = "hair:short";
const CLOTHES_COAT = "top:coat";
const CLOTHES_TSHIRT = "top:tshirt";

export function createShaperCharacter(partial: Partial<ShaperCharacter> = {}): ShaperCharacter {
  return {
    face: partial.face ?? FACE_BALANCED,
    hair: partial.hair ?? HAIR_SHORT,
    clothes: partial.clothes ?? CLOTHES_TSHIRT,
    pose: partial.pose ?? { leftUpperArm: SHAPER_REST_UPPER_ARM, rightUpperArm: SHAPER_REST_UPPER_ARM },
    drawings: partial.drawings ?? [],
  };
}

/** Pose edits replace only the arms. Face, hair, clothes, and drawing anchors stay. */
export function applyShaperPose(character: ShaperCharacter, pose: ShaperPose): ShaperCharacter {
  return { ...character, pose: { leftUpperArm: pose.leftUpperArm, rightUpperArm: pose.rightUpperArm }, drawings: character.drawings.map((drawing) => ({ ...drawing })) };
}

export function placeShaperDrawing(character: ShaperCharacter, drawing: ShaperDrawing): ShaperCharacter {
  return { ...character, drawings: [...character.drawings.filter((item) => item.id !== drawing.id), { ...drawing, rgba: [...drawing.rgba] as [number, number, number, number] }] };
}

export function serializeShaperCharacter(character: ShaperCharacter): string {
  return JSON.stringify(character);
}

export function parseShaperCharacter(raw: string): ShaperCharacter {
  const value = JSON.parse(raw) as ShaperCharacter;
  if (!value || typeof value.face !== "string" || typeof value.hair !== "string" || typeof value.clothes !== "string") {
    throw new Error("캐릭터 저장본을 읽을 수 없습니다.");
  }
  return createShaperCharacter({
    face: value.face,
    hair: value.hair,
    clothes: value.clothes,
    pose: {
      leftUpperArm: Number(value.pose?.leftUpperArm ?? SHAPER_REST_UPPER_ARM),
      rightUpperArm: Number(value.pose?.rightUpperArm ?? SHAPER_REST_UPPER_ARM),
    },
    drawings: (value.drawings ?? []).map((drawing) => ({
      id: String(drawing.id),
      region: drawing.region,
      u: Number(drawing.u),
      v: Number(drawing.v),
      rgba: [drawing.rgba[0], drawing.rgba[1], drawing.rgba[2], drawing.rgba[3]] as [number, number, number, number],
    })),
  });
}

function index(image: ShaperImage, x: number, y: number): number {
  return (y * image.width + x) * 4;
}

function personMask(image: ShaperImage): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  const corner = (x: number, y: number) => {
    const i = index(image, x, y);
    return [image.rgba[i], image.rgba[i + 1], image.rgba[i + 2]] as const;
  };
  const background = corner(0, 0);
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const i = index(image, x, y);
      const distance = Math.abs(image.rgba[i] - background[0]) + Math.abs(image.rgba[i + 1] - background[1]) + Math.abs(image.rgba[i + 2] - background[2]);
      if (distance > 48 && image.rgba[i + 3] > 16) {
        mask[y * image.width + x] = 1;
        count += 1;
      }
    }
  }
  return count >= Math.max(24, Math.floor(image.width * image.height * 0.02)) ? mask : new Uint8Array(image.width * image.height);
}

function boundsOf(mask: Uint8Array, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return count === 0 ? null : { minX, minY, maxX, maxY, count };
}

function average(image: ShaperImage, mask: Uint8Array, accept: (x: number, y: number) => boolean) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  let minY = image.height;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!mask[y * image.width + x] || !accept(x, y)) continue;
      const i = index(image, x, y);
      r += image.rgba[i];
      g += image.rgba[i + 1];
      b += image.rgba[i + 2];
      n += 1;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return n === 0 ? null : { r: r / n, g: g / n, b: b / n, n, minY, maxY };
}

/** A reference image becomes one undoable preset suggestion. No network call. */
export function recommendShaperPresets(image: ShaperImage): { readonly ok: true; readonly suggestion: ShaperPresetSuggestion } | { readonly ok: false; readonly reason: string } {
  const mask = personMask(image);
  const box = boundsOf(mask, image.width, image.height);
  if (!box) return { ok: false, reason: "참고 이미지에서 사람을 찾지 못했습니다." };
  const height = box.maxY - box.minY + 1;
  const width = box.maxX - box.minX + 1;
  const headBottom = box.minY + height * 0.34;
  const head = average(image, mask, (_x, y) => y <= headBottom);
  const torso = average(image, mask, (_x, y) => y > headBottom);
  const face = width / height > 0.72 ? FACE_ROUND : height > width * 1.35 ? FACE_OVAL : FACE_BALANCED;
  const hairSpan = head ? (head.maxY - head.minY) / height : 0;
  const hair = hairSpan > 0.28 ? HAIR_LONG : hairSpan > 0.16 ? HAIR_BOB : HAIR_SHORT;
  const clothesLuma = torso ? (torso.r + torso.g + torso.b) / 3 : 255;
  const clothes = clothesLuma < 90 ? CLOTHES_COAT : CLOTHES_TSHIRT;
  void head;
  return { ok: true, suggestion: { face, hair, clothes } };
}

export function applyShaperPresetSuggestion(character: ShaperCharacter, suggestion: ShaperPresetSuggestion): { readonly character: ShaperCharacter; readonly undo: ShaperCharacter } {
  return {
    undo: character,
    character: { ...character, face: suggestion.face, hair: suggestion.hair, clothes: suggestion.clothes, drawings: character.drawings.map((drawing) => ({ ...drawing })) },
  };
}

export function undoShaperPresetSuggestion(undo: ShaperCharacter): ShaperCharacter {
  return parseShaperCharacter(serializeShaperCharacter(undo));
}

function armRead(mask: Uint8Array, width: number, height: number, box: NonNullable<ReturnType<typeof boundsOf>>, side: "left" | "right") {
  const center = (box.minX + box.maxX) / 2;
  const torsoHalf = Math.max(2, (box.maxX - box.minX) * 0.18);
  let sx = 0;
  let sy = 0;
  let n = 0;
  let shoulderX = 0;
  let shoulderY = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      if (!mask[y * width + x]) continue;
      const outside = side === "left" ? x < center - torsoHalf : x > center + torsoHalf;
      if (!outside) continue;
      sx += x;
      sy += y;
      n += 1;
      const distance = Math.abs(x - center);
      if (distance < nearest) {
        nearest = distance;
        shoulderX = x;
        shoulderY = y;
      }
    }
  }
  if (n < 4) return null;
  return Math.atan2(sy / n - shoulderY, sx / n - shoulderX);
}

/** Photograph or camera still. A frame with no person does not move the character. */
export function poseFromShaperImage(image: ShaperImage, character: ShaperCharacter, source: "photo" | "camera" = "photo"): ShaperPoseRead {
  const mask = personMask(image);
  const box = boundsOf(mask, image.width, image.height);
  if (!box) return { ok: false, character, reason: "포즈를 읽을 사람이 없습니다.", source };
  const left = armRead(mask, image.width, image.height, box, "left");
  const right = armRead(mask, image.width, image.height, box, "right");
  if (left == null || right == null) return { ok: false, character, reason: "양팔 포즈를 구분하지 못했습니다.", source };
  const detected = { leftUpperArm: left, rightUpperArm: right };
  return { ok: true, source, detected, character: applyShaperPose(character, detected) };
}

interface Layout {
  readonly head: { readonly x: number; readonly y: number; readonly rx: number; readonly ry: number };
  readonly torso: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly leftArm: readonly { readonly x: number; readonly y: number }[];
  readonly rightArm: readonly { readonly x: number; readonly y: number }[];
}

function layoutOf(character: ShaperCharacter, width: number, height: number): Layout {
  const cx = width * 0.5;
  const headY = height * 0.28;
  const shoulderY = height * 0.42;
  const arm = (angle: number, sign: number) => {
    const points = [];
    const shoulderX = cx + sign * width * 0.08;
    for (let step = 0; step <= 8; step += 1) {
      const distance = (width * 0.22) * (step / 8);
      points.push({ x: shoulderX + Math.cos(angle) * distance, y: shoulderY + Math.sin(angle) * distance });
    }
    return points;
  };
  return {
    head: { x: cx, y: headY, rx: width * 0.12, ry: height * 0.12 },
    torso: { x: cx - width * 0.1, y: height * 0.4, w: width * 0.2, h: height * 0.34 },
    leftArm: arm(character.pose.leftUpperArm, -1),
    rightArm: arm(character.pose.rightUpperArm, 1),
  };
}

export function shaperDrawingPoint(character: ShaperCharacter, drawing: ShaperDrawing, width: number, height: number): { readonly x: number; readonly y: number } {
  const layout = layoutOf(character, width, height);
  const arm = drawing.region === "left-upper-arm" ? layout.leftArm : drawing.region === "right-upper-arm" ? layout.rightArm : null;
  if (arm) {
    const index = Math.round(drawing.u * (arm.length - 1));
    const point = arm[Math.max(0, Math.min(arm.length - 1, index))]!;
    return { x: point.x, y: point.y + (drawing.v - 0.5) * 4 };
  }
  if (drawing.region === "head" || drawing.region === "hair") {
    return { x: layout.head.x + (drawing.u - 0.5) * layout.head.rx, y: layout.head.y + (drawing.v - 0.5) * layout.head.ry };
  }
  return { x: layout.torso.x + drawing.u * layout.torso.w, y: layout.torso.y + drawing.v * layout.torso.h };
}

function paint(target: Uint8ClampedArray, width: number, height: number, x: number, y: number, rgba: readonly [number, number, number, number]) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return;
  const i = (py * width + px) * 4;
  const srcA = rgba[3] / 255;
  const dstA = target[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    target[i + channel] = Math.round((rgba[channel] * srcA + target[i + channel] * dstA * (1 - srcA)) / outA);
  }
  target[i + 3] = Math.round(outA * 255);
}

function paintDisc(target: Uint8ClampedArray, width: number, height: number, cx: number, cy: number, rx: number, ry: number, rgba: readonly [number, number, number, number]) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) paint(target, width, height, x, y, rgba);
    }
  }
}

function paintRect(target: Uint8ClampedArray, width: number, height: number, x: number, y: number, w: number, h: number, rgba: readonly [number, number, number, number]) {
  for (let py = Math.floor(y); py < y + h; py += 1) {
    for (let px = Math.floor(x); px < x + w; px += 1) paint(target, width, height, px, py, rgba);
  }
}

function paintArm(target: Uint8ClampedArray, width: number, height: number, points: readonly { readonly x: number; readonly y: number }[], rgba: readonly [number, number, number, number]) {
  for (const point of points) paintDisc(target, width, height, point.x, point.y, 3.2, 3.2, rgba);
}

const SKIN: readonly [number, number, number, number] = [232, 196, 168, 255];
const HAIR: readonly [number, number, number, number] = [42, 28, 24, 220];
const CLOTHES_DARK: readonly [number, number, number, number] = [22, 24, 32, 255];
const CLOTHES_LIGHT: readonly [number, number, number, number] = [236, 236, 240, 255];

function clothesColor(character: ShaperCharacter): readonly [number, number, number, number] {
  return character.clothes === CLOTHES_COAT || character.clothes.includes("coat") || character.clothes.includes("hoodie") ? CLOTHES_DARK : CLOTHES_LIGHT;
}

function rasterParts(character: ShaperCharacter, width: number, height: number) {
  const layout = layoutOf(character, width, height);
  const face = new Uint8ClampedArray(width * height * 4);
  const hair = new Uint8ClampedArray(width * height * 4);
  const clothes = new Uint8ClampedArray(width * height * 4);
  paintDisc(face, width, height, layout.head.x, layout.head.y, layout.head.rx, layout.head.ry, SKIN);
  paintDisc(hair, width, height, layout.head.x, layout.head.y - layout.head.ry * 0.45, layout.head.rx * 1.05, layout.head.ry * 0.55, HAIR);
  paintRect(clothes, width, height, layout.torso.x, layout.torso.y, layout.torso.w, layout.torso.h, clothesColor(character));
  paintArm(clothes, width, height, layout.leftArm, SKIN);
  paintArm(clothes, width, height, layout.rightArm, SKIN);
  const drawings = new Uint8ClampedArray(width * height * 4);
  for (const drawing of character.drawings) {
    const point = shaperDrawingPoint(character, drawing, width, height);
    paintDisc(drawings, width, height, point.x, point.y, 2.2, 2.2, drawing.rgba);
  }
  return { face, hair, clothes, drawings };
}

function compositeLayers(width: number, height: number, layers: readonly ShaperPsdLayer[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (const layer of layers) {
    if (!layer.visible) continue;
    for (let i = 0; i < out.length; i += 4) {
      const srcA = layer.rgba[i + 3] / 255;
      if (srcA <= 0) continue;
      if (layer.blend === "multiply") {
        for (let channel = 0; channel < 3; channel += 1) {
          const multiplied = out[i + channel] * (layer.rgba[i + channel] / 255);
          out[i + channel] = Math.round(out[i + channel] * (1 - srcA) + multiplied * srcA);
        }
        continue;
      }
      const dstA = out[i + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      for (let channel = 0; channel < 3; channel += 1) {
        out[i + channel] = Math.round((layer.rgba[i + channel] * srcA + out[i + channel] * dstA * (1 - srcA)) / outA);
      }
      out[i + 3] = Math.round(outA * 255);
    }
  }
  return out;
}

function shadeOf(source: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 4) {
    if (source[i + 3] === 0) continue;
    out[i] = 170;
    out[i + 1] = 170;
    out[i + 2] = 180;
    out[i + 3] = Math.round(source[i + 3] * 0.35);
  }
  return out;
}

function lineOf(source: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(source.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const alpha = source[((y * width) + x) * 4 + 3];
      const neighbor = source[((y * width) + x + 1) * 4 + 3];
      if (alpha > 200 && neighbor < 20) {
        const i = ((y * width) + x) * 4;
        out[i] = 16;
        out[i + 1] = 16;
        out[i + 2] = 20;
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

function hasInk(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 16) return true;
  return false;
}

export function captureShaperCharacter(character: ShaperCharacter, width: number, height: number): ShaperPsdExport {
  const parts = rasterParts(character, width, height);
  const layers: ShaperPsdLayer[] = [];
  const omissions: ShaperPsdOmission[] = [];
  const pushPart = (name: string, rgba: Uint8ClampedArray, reason: string) => {
    if (!hasInk(rgba)) {
      omissions.push({ name, reason });
      return;
    }
    layers.push({ name, rgba, visible: true, blend: "source-over" });
  };
  pushPart("밑색-얼굴", parts.face, "얼굴 밑색을 만들 얼굴 픽셀이 없습니다.");
  pushPart("밑색-헤어", character.hair ? parts.hair : new Uint8ClampedArray(width * height * 4), character.hair ? "헤어 밑색을 만들 픽셀이 없습니다." : "헤어 프리셋이 없어 밑색-헤어를 만들지 않습니다.");
  pushPart("밑색-의상", parts.clothes, "의상 밑색을 만들 픽셀이 없습니다.");
  if (hasInk(parts.drawings)) layers.push({ name: "드로잉", rgba: parts.drawings, visible: true, blend: "source-over" });
  const flat = compositeLayers(width, height, layers);
  const shade = shadeOf(flat);
  layers.push({ name: "음영", rgba: shade, visible: true, blend: "multiply" });
  const highlight = new Uint8ClampedArray(width * height * 4);
  if (hasInk(highlight)) layers.push({ name: "하이라이트", rgba: highlight, visible: true, blend: "source-over" });
  else omissions.push({ name: "하이라이트", reason: "이 모델은 분리된 하이라이트 픽셀을 만들지 않습니다." });
  const line = lineOf(flat, width, height);
  if (hasInk(line)) layers.push({ name: "주선", rgba: line, visible: true, blend: "source-over" });
  else omissions.push({ name: "주선", reason: "윤곽 경계가 없어 주선을 만들지 않습니다." });
  const visible = layers.filter((layer) => layer.visible && layer.name !== "하이라이트");
  const beauty = compositeLayers(width, height, visible);
  return { width, height, beauty, layers, omissions };
}

export function recomposeShaperPsd(exported: ShaperPsdExport): Uint8ClampedArray {
  return compositeLayers(exported.width, exported.height, exported.layers.filter((layer) => layer.visible && layer.name !== "하이라이트"));
}

export function opaqueMeanAbsoluteError(beauty: Uint8ClampedArray, recomposed: Uint8ClampedArray): number {
  let total = 0;
  let count = 0;
  const length = Math.min(beauty.length, recomposed.length);
  for (let i = 0; i < length; i += 4) {
    if (beauty[i + 3] < 250 || recomposed[i + 3] < 250) continue;
    total += Math.abs(beauty[i] - recomposed[i]) + Math.abs(beauty[i + 1] - recomposed[i + 1]) + Math.abs(beauty[i + 2] - recomposed[i + 2]);
    count += 3;
  }
  return count === 0 ? 0 : total / count / 255;
}

export function transparentFringeViolation(image: ShaperImage, fringe = 2): number {
  const opaque = new Uint8Array(image.width * image.height);
  for (let i = 0; i < opaque.length; i += 1) opaque[i] = image.rgba[i * 4 + 3] > 16 ? 1 : 0;
  let violations = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] === 0) continue;
      let near = false;
      for (let oy = -fringe; oy <= fringe && !near; oy += 1) {
        for (let ox = -fringe; ox <= fringe; ox += 1) {
          const px = x + ox;
          const py = y + oy;
          if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
          if (opaque[py * image.width + px]) { near = true; break; }
        }
      }
      if (!near) violations += 1;
    }
  }
  return violations;
}

/** Called when the shaper applies a pose preset so the combination is not rebuilt from the pose alone. */
export function retainShaperCombination(character: ShaperCharacter, pose: ShaperPose): ShaperCharacter {
  return applyShaperPose(character, pose);
}

let activeShaperGrade = createShaperCharacter();

export function noteShaperPosePreset(presetId: string): ShaperCharacter {
  const raised = presetId.length % 2 === 0;
  activeShaperGrade = retainShaperCombination(activeShaperGrade, {
    leftUpperArm: raised ? 0.4 : SHAPER_REST_UPPER_ARM,
    rightUpperArm: raised ? SHAPER_REST_UPPER_ARM : 2.2,
  });
  return activeShaperGrade;
}

export function readActiveShaperGrade(): ShaperCharacter {
  return activeShaperGrade;
}
