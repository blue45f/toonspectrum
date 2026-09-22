import type { SkiaDocumentPanel } from "./document-contract";
import type { Canvas, CanvasKit, Paint, Path } from "canvaskit-wasm";

function buildPanelPath(
  ck: CanvasKit,
  panel: SkiaDocumentPanel,
  inset = 0,
): Path {
  const builder = new ck.PathBuilder();
  try {
    if (panel.points) {
      builder.moveTo(panel.points[0]!, panel.points[1]!);
      for (let i = 2; i < panel.points.length; i += 2) {
        builder.lineTo(panel.points[i]!, panel.points[i + 1]!);
      }
      builder.close();
    } else {
      const width = Math.max(0, panel.width - inset * 2);
      const height = Math.max(0, panel.height - inset * 2);
      const radius = inset > 0
        ? Math.min(Math.max(0, panel.radius - inset), width / 2, height / 2)
        : 0;
      builder.addRRect(ck.RRectXY([inset, inset, inset + width, inset + height], radius, radius));
    }
    return builder.detach();
  } finally {
    builder.delete();
  }
}

function applyPanelStroke(
  ck: CanvasKit,
  canvas: Canvas,
  panel: SkiaDocumentPanel,
  path: Path,
  paint: Paint,
): void {
  const dash = panel.dashed ? ck.PathEffect.MakeDash([10, 5], 0) : null;
  try {
    paint.setStyle(ck.PaintStyle.Stroke);
    paint.setStrokeWidth(panel.strokeWidth);
    paint.setStrokeJoin(ck.StrokeJoin.Miter);
    paint.setStrokeCap(ck.StrokeCap.Butt);
    if (dash) paint.setPathEffect(dash);
    if (panel.shadow && panel.shadow.opacity > 0 && panel.shadow.blur > 0) {
      const filter = ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, panel.shadow.blur / 2, true);
      canvas.save();
      try {
        canvas.translate(panel.shadow.x, panel.shadow.y);
        paint.setColorComponents(0, 0, 0, panel.shadow.opacity);
        paint.setMaskFilter(filter);
        canvas.drawPath(path, paint);
      } finally {
        paint.setMaskFilter(null);
        canvas.restore();
        filter.delete();
      }
    }
    paint.setColorComponents(panel.stroke.r, panel.stroke.g, panel.stroke.b, panel.stroke.a);
    canvas.drawPath(path, paint);
  } finally {
    paint.setPathEffect(null);
    if (dash) dash.delete();
  }
}

/** Mirrors the static frame paint while leaving interaction on the existing hit graph. */
export function drawSkiaDocumentPanel(
  ck: CanvasKit,
  canvas: Canvas,
  panel: SkiaDocumentPanel,
): void {
  const shape = buildPanelPath(ck, panel);
  const paint = new ck.Paint();
  canvas.save();
  try {
    canvas.translate(panel.x, panel.y);
    canvas.clipPath(shape, ck.ClipOp.Intersect, true);
    paint.setAntiAlias(true);
    paint.setStyle(ck.PaintStyle.Fill);
    paint.setColorComponents(panel.fill.r, panel.fill.g, panel.fill.b, panel.fill.a);
    canvas.drawPath(shape, paint);
    if (panel.strokeWidth <= 0 || panel.stroke.a <= 0) return;
    const border = buildPanelPath(ck, panel, panel.points ? 0 : panel.strokeWidth / 2);
    try {
      applyPanelStroke(ck, canvas, panel, border, paint);
    } finally {
      border.delete();
    }
  } finally {
    canvas.restore();
    paint.delete();
    shape.delete();
  }
}
