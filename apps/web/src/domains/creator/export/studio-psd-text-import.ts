import type { Layer } from "ag-psd";
import type { El } from "../studio-element-model";
import type { PsdImportedElement } from "../studio-psd-import";

/** 글리프 외관은 원본 픽셀에 맡기고, 표현 가능한 단일 서식만 숨겨진 편집본으로 제공한다. */
export function planStudioPsdEditableText(
  layer: Layer,
  original: PsdImportedElement,
  scale: number,
  createId: () => string,
): El | null {
  const text = layer.text;
  if (!text?.text || text.orientation === "vertical" || text.textPath
    || (text.warp?.style && text.warp.style !== "none")
    || (text.styleRuns?.length ?? 0) > 1 || (text.paragraphStyleRuns?.length ?? 0) > 1) return null;
  const style = text.styleRuns?.[0]?.style ?? text.style;
  const color = style?.fillColor;
  if (!style?.fontSize || !Number.isFinite(style.fontSize) || style.fontSize <= 0
    || !color || !("r" in color) || !("g" in color) || !("b" in color)
    || style.strokeFlag || style.underline || style.strikethrough
    || style.baselineShift || style.fontCaps || style.fontBaseline) return null;
  const transform = text.transform ?? [1, 0, 0, 1, 0, 0];
  const [a = 1, b = 0, c = 0, d = 1] = transform;
  if (!transform.every(Number.isFinite) || b !== 0 || c !== 0 || a <= 0 || d <= 0 || a !== d) return null;
  const rgb = [color.r, color.g, color.b];
  if (rgb.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) return null;
  const fontSize = style.fontSize * scale * d;
  const paragraph = text.paragraphStyleRuns?.[0]?.style ?? text.paragraphStyle;
  const justification = paragraph?.justification;
  const align = justification === "center" || justification === "right" ? justification : "left";
  return {
    id: createId(), type: "text", name: `${original.name ?? "문자"} · 텍스트 편집본`,
    psdRasterSourceId: original.id,
    text: text.text.replace(/\r\n?/gu, "\n"),
    x: original.x, y: original.y, width: original.width, fontSize,
    fill: `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`,
    rotation: 0, hidden: true, align,
    ...(style.font?.name ? { font: style.font.name } : {}),
    ...(style.fauxBold || style.fauxItalic ? {
      fontStyle: style.fauxBold && style.fauxItalic ? "bold italic" : style.fauxBold ? "bold" : "italic",
    } : {}),
    ...(style.tracking ? { letterSpacing: style.tracking * fontSize / 1000 } : {}),
    ...(original.opacity !== undefined ? { opacity: original.opacity } : {}),
    ...(original.groupId ? {
      groupId: original.groupId, psdGroupId: original.psdGroupId, psdFolderPath: original.psdFolderPath,
    } : {}),
  };
}
