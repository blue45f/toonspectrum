import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

const SOURCE_WIDTH = 800;
const MAX_PREVIEW_HEIGHT = 3_000;

function drawPath(context: CanvasRenderingContext2D, element: Extract<El, { type: "draw" }>) {
  const points = element.points;
  if (points.length < 4) return;
  context.lineWidth = element.strokeWidth;
  context.strokeStyle = element.stroke;
  context.fillStyle = element.fill && element.fill !== "transparent" ? element.fill : "transparent";
  context.beginPath();
  if (element.kind === "rect" || element.kind === "ellipse") {
    const [x1, y1, x2, y2] = points;
    const width = x2! - x1!;
    const height = y2! - y1!;
    if (element.kind === "rect") context.rect(x1!, y1!, width, height);
    else context.ellipse(x1! + width / 2, y1! + height / 2, Math.abs(width / 2), Math.abs(height / 2), 0, 0, Math.PI * 2);
  } else {
    context.moveTo(points[0]!, points[1]!);
    for (let index = 2; index < points.length; index += 2) context.lineTo(points[index]!, points[index + 1]!);
  }
  if (context.fillStyle !== "transparent") context.fill();
  context.stroke();
}

function lines(text: string, maximum: number): string[] {
  const output: string[] = [];
  let current = "";
  for (const character of text) {
    if (current.length >= maximum || character === "\n") {
      output.push(current);
      current = character === "\n" ? "" : character;
    } else current += character;
  }
  if (current) output.push(current);
  return output.slice(0, 8);
}
function drawElement(context: CanvasRenderingContext2D, element: El) {
  context.save();
  if (element.type === "draw") drawPath(context, element);
  else if (element.type === "frame") {
    context.strokeStyle = element.stroke ?? "#35303c";
    context.lineWidth = element.strokeWidth ?? 2;
    context.strokeRect(element.x, element.y, element.width, element.height);
  } else if (element.type === "text") {
    context.fillStyle = element.fill;
    context.font = `${element.fontStyle?.includes("bold") ? "700 " : ""}${element.fontSize}px sans-serif`;
    const rowHeight = element.fontSize * (element.lineHeight ?? 1.25);
    lines(element.text, Math.max(3, Math.floor(element.width / Math.max(8, element.fontSize * 0.58))))
      .forEach((row, index) => context.fillText(row, element.x, element.y + element.fontSize + index * rowHeight, element.width));
  } else if (element.type === "bubble") {
    context.fillStyle = element.fill;
    context.strokeStyle = element.stroke ?? "#35303c";
    context.lineWidth = element.strokeWidth ?? 2;
    context.beginPath();
    context.roundRect(element.x, element.y, element.width, element.height, Math.min(28, element.height / 3));
    context.fill();
    context.stroke();
    const fontSize = element.fontSize ?? 24;
    context.fillStyle = element.textFill;
    context.font = `${element.fontStyle?.includes("bold") ? "700 " : ""}${fontSize}px sans-serif`;
    context.textAlign = element.align ?? "center";
    const centerX = element.align === "left" ? element.x + 14 : element.align === "right" ? element.x + element.width - 14 : element.x + element.width / 2;
    lines(element.text, Math.max(3, Math.floor((element.width - 28) / Math.max(8, fontSize * 0.58))))
      .forEach((row, index) => context.fillText(row, centerX, element.y + 34 + index * fontSize * 1.15, element.width - 28));
  }
  context.restore();
}
export function renderEcosystemPreview(page: PageState, maximumWidth = 420): string {
  if (typeof document === "undefined") throw new Error("미리보기는 브라우저에서 생성할 수 있습니다.");
  const scale = Math.min(1, maximumWidth / SOURCE_WIDTH, MAX_PREVIEW_HEIGHT / page.canvasH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(SOURCE_WIDTH * scale));
  canvas.height = Math.max(1, Math.round(page.canvasH * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("미리보기 캔버스를 만들지 못했습니다.");
  context.fillStyle = page.bg;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  for (const element of page.elements) drawElement(context, element);
  const dataUrl = canvas.toDataURL("image/webp", 0.82);
  if (dataUrl.length > 600_000) throw new Error("미리보기가 너무 큽니다. 페이지 수나 크기를 줄여 주세요.");
  return dataUrl;
}

export function downloadEcosystemJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[^A-Za-z0-9._-]+/gu, "-").slice(0, 120);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function readEcosystemJson(file: File): Promise<unknown> {
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("JSON 파일은 5MiB 이하만 불러올 수 있습니다.");
  return JSON.parse(await file.text()) as unknown;
}
