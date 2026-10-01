/**
 * 앰비언트 장식물 (Track 4 · "살아있는 공간")
 *
 * 깃발·풍차·물레방아·분수·가로등·네온사인·건물·굴뚝·나무·덤불·랜턴·구름
 * 12종의 장식물 정의 + 프로시저럴 스프라이트. 외부 에셋 없이 코드로 그린다.
 *
 * 각 장식물은 `StudioAmbientAnimationKind`와 연결되어
 * `studio-virtual-space-ambient-animation.ts`의 프레임 값을 받아 움직인다.
 * (예: windmill → windmill-spin, fountain → fountain-spray + splash 파티클)
 */

import { defaultProceduralSheetDeps, type ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";
import type { StudioAmbientAnimationKind } from "./studio-virtual-space-ambient-animation";

/** 앰비언트 장식물 종류. */
export type StudioAmbientDecorKind =
  | "flag"
  | "windmill"
  | "waterwheel"
  | "fountain"
  | "streetlamp"
  | "neon-sign"
  | "building"
  | "chimney"
  | "tree"
  | "bush"
  | "lantern"
  | "cloud";

export const STUDIO_AMBIENT_DECOR_KINDS: readonly StudioAmbientDecorKind[] = Object.freeze([
  "flag", "windmill", "waterwheel", "fountain", "streetlamp", "neon-sign",
  "building", "chimney", "tree", "bush", "lantern", "cloud",
]);

export interface StudioAmbientDecorDef {
  readonly kind: StudioAmbientDecorKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 스프라이트 크기 (px). */
  readonly width: number;
  readonly height: number;
  /** 연결된 앰비언트 애니메이션 (null이면 정적). */
  readonly animation: StudioAmbientAnimationKind | null;
  /** 밤에 불이 켜지는지. */
  readonly nightGlow: boolean;
}

function def(definition: StudioAmbientDecorDef): StudioAmbientDecorDef {
  return Object.freeze(definition);
}

/** 앰비언트 장식물 12종. */
export const STUDIO_AMBIENT_DECOR_CATALOG: readonly StudioAmbientDecorDef[] = Object.freeze([
  def({ kind: "flag", labelKo: "깃발", labelEn: "Flag", descriptionKo: "바람에 펄럭이는 깃발이에요.", descriptionEn: "A flag waving in the wind.",
    width: 96, height: 128, animation: "flag-wave", nightGlow: false }),
  def({ kind: "windmill", labelKo: "풍차", labelEn: "Windmill", descriptionKo: "날개가 빙글빙글 도는 풍차예요.", descriptionEn: "A windmill with spinning blades.",
    width: 128, height: 160, animation: "windmill-spin", nightGlow: false }),
  def({ kind: "waterwheel", labelKo: "물레방아", labelEn: "Waterwheel", descriptionKo: "물을 퍼 올리는 물레방아예요.", descriptionEn: "A waterwheel scooping water.",
    width: 128, height: 128, animation: "waterwheel-spin", nightGlow: false }),
  def({ kind: "fountain", labelKo: "분수", labelEn: "Fountain", descriptionKo: "물줄기가 솟는 분수예요.", descriptionEn: "A fountain with water jets.",
    width: 128, height: 128, animation: "fountain-spray", nightGlow: true }),
  def({ kind: "streetlamp", labelKo: "가로등", labelEn: "Streetlamp", descriptionKo: "밤이 되면 켜지는 가로등이에요.", descriptionEn: "A streetlamp that lights up at night.",
    width: 64, height: 160, animation: "lamp-glow", nightGlow: true }),
  def({ kind: "neon-sign", labelKo: "네온사인", labelEn: "Neon sign", descriptionKo: "밤에 반짝이는 네온사인이에요.", descriptionEn: "A neon sign glowing at night.",
    width: 128, height: 64, animation: "neon-flicker", nightGlow: true }),
  def({ kind: "building", labelKo: "건물", labelEn: "Building", descriptionKo: "밤이 되면 창문에 불이 켜져요.", descriptionEn: "Windows light up at night.",
    width: 160, height: 192, animation: "building-glow", nightGlow: true }),
  def({ kind: "chimney", labelKo: "굴뚝", labelEn: "Chimney", descriptionKo: "연기가 모락모락 피어올라요.", descriptionEn: "Smoke rises gently.",
    width: 64, height: 128, animation: "smoke-rise", nightGlow: false }),
  def({ kind: "tree", labelKo: "나무", labelEn: "Tree", descriptionKo: "나뭇잎이 살랑이는 나무예요.", descriptionEn: "A tree with swaying leaves.",
    width: 128, height: 160, animation: "leaf-sway", nightGlow: false }),
  def({ kind: "bush", labelKo: "덤불", labelEn: "Bush", descriptionKo: "바람에 흔들리는 덤불이에요.", descriptionEn: "A bush swaying in the wind.",
    width: 96, height: 64, animation: "leaf-sway", nightGlow: false }),
  def({ kind: "lantern", labelKo: "랜턴", labelEn: "Lantern", descriptionKo: "밤에 은은하게 빛나는 랜턴이에요.", descriptionEn: "A lantern glowing softly at night.",
    width: 48, height: 96, animation: "lantern-sway", nightGlow: true }),
  def({ kind: "cloud", labelKo: "구름", labelEn: "Cloud", descriptionKo: "하늘을 천천히 흘러가는 구름이에요.", descriptionEn: "A cloud drifting across the sky.",
    width: 160, height: 80, animation: "cloud-drift", nightGlow: false }),
]);

const DEF_BY_KIND = new Map<StudioAmbientDecorKind, StudioAmbientDecorDef>(
  STUDIO_AMBIENT_DECOR_CATALOG.map((item) => [item.kind, item]),
);

/** 장식물 정의 조회. */
export function studioAmbientDecorDef(kind: string): StudioAmbientDecorDef | null {
  return DEF_BY_KIND.get(kind as StudioAmbientDecorKind) ?? null;
}

/* ---------------- 프로시저럴 스프라이트 ---------------- */

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function windows(ctx: CanvasRenderingContext2D, x: number, y: number, cols: number, rows: number, w: number, h: number, gapX: number, gapY: number): void {
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      rect(ctx, x + col * (w + gapX), y + row * (h + gapY), w, h, "#ffe9a8");
    }
  }
}

function drawDecor(ctx: CanvasRenderingContext2D, kind: StudioAmbientDecorKind, width: number, height: number): void {
  switch (kind) {
    case "flag": {
      rect(ctx, 18, 8, 6, height - 16, "#8a8f98"); // 기둥
      circle(ctx, 21, 6, 5, "#ffd166"); // 꼭대기 장식
      ctx.fillStyle = "#4d96ff"; // 깃발 (펄럭임은 애니메이션 프레임이 담당)
      ctx.beginPath();
      ctx.moveTo(24, 14);
      ctx.quadraticCurveTo(52, 20, width - 12, 14);
      ctx.quadraticCurveTo(52, 34, 24, 44);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      circle(ctx, 48, 29, 7, "#ffffff"); // 엠블럼
      break;
    }
    case "windmill": {
      rect(ctx, width / 2 - 14, 60, 28, height - 60, "#b08968"); // 몸통
      triangleRoof(ctx, width / 2 - 20, 60, width / 2 + 20, 60, width / 2, 34, "#7f5539");
      // 날개 (회전은 애니메이션 프레임이 담당 — 기본 자세)
      ctx.strokeStyle = "#e9e4d8";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      const cx = width / 2, cy = 34;
      for (let blade = 0; blade < 4; blade += 1) {
        const angle = (blade / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * 44, cy + Math.sin(angle) * 44);
        ctx.stroke();
      }
      circle(ctx, cx, cy, 7, "#5c5c66");
      break;
    }
    case "waterwheel": {
      circle(ctx, width / 2, height / 2, 44, "#8a5a33"); // 바퀴
      circle(ctx, width / 2, height / 2, 34, "#a9744f");
      ctx.strokeStyle = "#5b3a22";
      ctx.lineWidth = 5;
      for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = (spoke / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(width / 2, height / 2);
        ctx.lineTo(width / 2 + Math.cos(angle) * 42, height / 2 + Math.sin(angle) * 42);
        ctx.stroke();
      }
      circle(ctx, width / 2, height / 2, 8, "#3d3d46");
      rect(ctx, width / 2 - 6, 8, 12, 30, "#7f5539"); // 지지대
      break;
    }
    case "fountain": {
      ellipse(ctx, width / 2, height - 22, 52, 16, "#9db8c9"); // 수반
      ellipse(ctx, width / 2, height - 26, 44, 11, "#cfe8fa");
      rect(ctx, width / 2 - 8, 44, 16, height - 66, "#b8c4cc"); // 기둥
      ellipse(ctx, width / 2, 40, 26, 8, "#9db8c9"); // 윗 수반
      // 물줄기 (파티클은 애니메이션 프레임이 담당)
      ctx.strokeStyle = "rgba(150, 205, 250, 0.8)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(width / 2, 40);
      ctx.quadraticCurveTo(width / 2 - 20, 20, width / 2 - 26, 8);
      ctx.moveTo(width / 2, 40);
      ctx.quadraticCurveTo(width / 2 + 20, 20, width / 2 + 26, 8);
      ctx.stroke();
      break;
    }
    case "streetlamp": {
      rect(ctx, width / 2 - 4, 30, 8, height - 30, "#3d3d46");
      rect(ctx, width / 2 - 14, height - 12, 28, 12, "#2b2b32"); // 받침
      circle(ctx, width / 2, 22, 12, "#ffe9a8"); // 전구
      ctx.strokeStyle = "#3d3d46";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 12, 22);
      ctx.lineTo(width / 2 + 12, 22);
      ctx.stroke();
      break;
    }
    case "neon-sign": {
      rect(ctx, 4, 4, width - 8, height - 8, "#1d1d26"); // 간판
      ctx.strokeStyle = "#ff5fa2";
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, width - 20, height - 20);
      ctx.fillStyle = "#7ef0ff";
      ctx.font = `bold ${Math.floor(height * 0.42)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TOON", width / 2, height / 2 + 2);
      break;
    }
    case "building": {
      rect(ctx, 8, 30, width - 16, height - 30, "#8d8fa3"); // 외벽
      triangleRoof(ctx, 2, 30, width - 2, 30, width / 2, 6, "#5c5e70");
      windows(ctx, 24, 48, 3, 4, 26, 20, 16, 14); // 창문 (밤 불빛은 intensity로 틴트)
      rect(ctx, width / 2 - 14, height - 34, 28, 34, "#4a4c5e"); // 문
      break;
    }
    case "chimney": {
      rect(ctx, width / 2 - 12, 30, 24, height - 30, "#a0665a"); // 굴뚝 몸통
      rect(ctx, width / 2 - 16, 22, 32, 12, "#7c4a40"); // 윗 테두리
      for (let row = 0; row < 4; row += 1) rect(ctx, width / 2 - 12, 44 + row * 20, 24, 3, "rgba(0,0,0,0.15)");
      break;
    }
    case "tree": {
      rect(ctx, width / 2 - 7, height - 60, 14, 60, "#7c5233"); // 줄기
      circle(ctx, width / 2, 74, 44, "#5da85f"); // 수관
      circle(ctx, width / 2 - 30, 92, 30, "#4c9950");
      circle(ctx, width / 2 + 30, 92, 30, "#4c9950");
      circle(ctx, width / 2 - 14, 60, 9, "#7fbf6a"); // 하이라이트
      circle(ctx, width / 2 + 18, 78, 7, "#7fbf6a");
      break;
    }
    case "bush": {
      circle(ctx, 26, height - 22, 20, "#4c9950");
      circle(ctx, 50, height - 28, 24, "#5da85f");
      circle(ctx, 74, height - 22, 19, "#4c9950");
      circle(ctx, 44, height - 38, 8, "#7fbf6a");
      break;
    }
    case "lantern": {
      ctx.strokeStyle = "#3d3d46";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, 14);
      ctx.stroke();
      ellipse(ctx, width / 2, 48, 14, 26, "#ffdf9e"); // 등불
      ellipse(ctx, width / 2, 48, 9, 19, "#fff3d0");
      rect(ctx, width / 2 - 10, 12, 20, 8, "#3d3d46");
      rect(ctx, width / 2 - 10, 70, 20, 8, "#3d3d46");
      break;
    }
    case "cloud": {
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ellipse(ctx, width / 2, height / 2 + 6, 62, 24, "rgba(255,255,255,0.92)");
      circle(ctx, width / 2 - 34, height / 2, 22, "rgba(255,255,255,0.92)");
      circle(ctx, width / 2 + 6, height / 2 - 8, 28, "rgba(255,255,255,0.92)");
      circle(ctx, width / 2 + 38, height / 2 + 2, 20, "rgba(255,255,255,0.92)");
      break;
    }
  }
}

function triangleRoof(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

export interface StudioAmbientDecorSprite {
  readonly kind: StudioAmbientDecorKind;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

/**
 * 장식물 프로시저럴 스프라이트를 만든다.
 * 움직임은 애니메이션 프레임(회전·위상·강도)이 담당하므로 단일 정지 이미지다.
 */
export function buildStudioAmbientDecorSprite(
  kind: StudioAmbientDecorKind,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioAmbientDecorSprite {
  const definition = studioAmbientDecorDef(kind);
  if (!definition) throw new Error(`알 수 없는 앰비언트 장식물: ${kind}`);
  const canvas = deps.createCanvas(definition.width, definition.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  ctx.clearRect(0, 0, definition.width, definition.height);
  drawDecor(ctx, kind, definition.width, definition.height);
  return Object.freeze({
    kind,
    dataUrl: canvas.toDataURL("image/png"),
    width: definition.width,
    height: definition.height,
  });
}
