import { UnsupportedSceneFeatureError } from "@toonspectrum/studio-project-model";

import type {
  BlendModeIR,
  ColorIR,
  FillPathNodeIR,
  PaintIR,
  PathIR,
  SceneIR,
  SceneNodeIR,
  StrokePathNodeIR,
  TextNodeIR,
} from "@toonspectrum/studio-project-model";
import type {
  BlendMode,
  Canvas,
  CanvasKit,
  ImageInfo,
  Path,
  Shader,
  StrokeCap,
  StrokeJoin,
  Surface,
  Typeface,
} from "canvaskit-wasm";

/**
 * CanvasKit (Skia) SceneIR renderer — CPU raster lane of the skia-canvaskit
 * provider. All CanvasKit objects are engine caches: they are created from the
 * IR per call and deleted before returning (WASM heap has no GC).
 */

export interface RenderOptions {
  /**
   * Font bytes (TTF/WOFF/WOFF2) used for text nodes. canvaskit-wasm ships no
   * bundled fonts, so rendering a scene that contains text without this asset
   * throws UnsupportedSceneFeatureError instead of drawing tofu or skipping.
   */
  fontData?: Uint8Array;
}

const PROVIDER_ID = "skia-canvaskit";
const RGBA_BYTES_PER_PIXEL = 4;

type GroupNodeIR = Extract<SceneNodeIR, { kind: "group" }>;
type GradientPaintIR = Exclude<PaintIR, { kind: "solid" }>;

interface RenderContext {
  readonly ck: CanvasKit;
  readonly canvas: Canvas;
  readonly options: RenderOptions;
  /** Lazily decoded from options.fontData; owned (and deleted) per render. */
  typeface: Typeface | null;
}

function rasterImageInfo(ck: CanvasKit, width: number, height: number): ImageInfo {
  return {
    width,
    height,
    colorType: ck.ColorType.RGBA_8888,
    alphaType: ck.AlphaType.Unpremul,
    colorSpace: ck.ColorSpace.SRGB,
  };
}

function colorToFloat4(color: ColorIR, opacity: number): Float32Array {
  return Float32Array.of(color.r, color.g, color.b, color.a * opacity);
}

function toBlendMode(ck: CanvasKit, blend: BlendModeIR): BlendMode {
  switch (blend) {
    case "src-over":
      return ck.BlendMode.SrcOver;
    case "multiply":
      return ck.BlendMode.Multiply;
    case "screen":
      return ck.BlendMode.Screen;
    case "darken":
      return ck.BlendMode.Darken;
    case "lighten":
      return ck.BlendMode.Lighten;
  }
}

function toStrokeCap(ck: CanvasKit, cap: StrokePathNodeIR["cap"]): StrokeCap {
  switch (cap) {
    case "butt":
      return ck.StrokeCap.Butt;
    case "round":
      return ck.StrokeCap.Round;
    case "square":
      return ck.StrokeCap.Square;
  }
}

function toStrokeJoin(ck: CanvasKit, join: StrokePathNodeIR["join"]): StrokeJoin {
  switch (join) {
    case "miter":
      return ck.StrokeJoin.Miter;
    case "round":
      return ck.StrokeJoin.Round;
    case "bevel":
      return ck.StrokeJoin.Bevel;
  }
}

/**
 * CanvasKit 0.41 paths are immutable; verbs are recorded through PathBuilder
 * and detached into a Path (M/L/Q/C/Z maps 1:1, no resampling).
 */
function buildPath(ck: CanvasKit, pathIR: PathIR): Path {
  const builder = new ck.PathBuilder();
  try {
    for (const verb of pathIR.verbs) {
      switch (verb.v) {
        case "M":
          builder.moveTo(verb.x, verb.y);
          break;
        case "L":
          builder.lineTo(verb.x, verb.y);
          break;
        case "Q":
          builder.quadTo(verb.cx, verb.cy, verb.x, verb.y);
          break;
        case "C":
          builder.cubicTo(verb.c1x, verb.c1y, verb.c2x, verb.c2y, verb.x, verb.y);
          break;
        case "Z":
          builder.close();
          break;
      }
    }
    return builder.detach();
  } finally {
    builder.delete();
  }
}

function makeGradientShader(ck: CanvasKit, paintIR: GradientPaintIR): Shader {
  const colors = paintIR.stops.map((stop) => colorToFloat4(stop.color, 1));
  const positions = paintIR.stops.map((stop) => stop.offset);
  if (paintIR.kind === "linear-gradient") {
    return ck.Shader.MakeLinearGradient(
      [paintIR.from[0], paintIR.from[1]],
      [paintIR.to[0], paintIR.to[1]],
      colors,
      positions,
      ck.TileMode.Clamp,
    );
  }
  return ck.Shader.MakeRadialGradient(
    [paintIR.center[0], paintIR.center[1]],
    paintIR.radius,
    colors,
    positions,
    ck.TileMode.Clamp,
  );
}

function drawPathNode(
  ctx: RenderContext,
  node: FillPathNodeIR | StrokePathNodeIR,
): void {
  const { ck, canvas } = ctx;
  const path = buildPath(ck, node.path);
  const paint = new ck.Paint();
  let shader: Shader | null = null;
  let layered = false;
  try {
    paint.setAntiAlias(true);
    if (node.kind === "fill-path") {
      path.setFillType(
        node.fillRule === "evenodd" ? ck.FillType.EvenOdd : ck.FillType.Winding,
      );
      paint.setStyle(ck.PaintStyle.Fill);
    } else {
      paint.setStyle(ck.PaintStyle.Stroke);
      paint.setStrokeWidth(node.strokeWidth);
      paint.setStrokeCap(toStrokeCap(ck, node.cap));
      paint.setStrokeJoin(toStrokeJoin(ck, node.join));
      paint.setStrokeMiter(node.miterLimit);
    }
    if (node.paint.kind === "solid") {
      const { r, g, b, a } = node.paint.color;
      paint.setColorComponents(r, g, b, a * node.opacity);
      paint.setBlendMode(toBlendMode(ck, node.blend));
    } else {
      shader = makeGradientShader(ck, node.paint);
      paint.setShader(shader);
      if (node.opacity < 1) {
        // Gradient stops carry their own alphas, so node opacity cannot be
        // folded into one paint color; composite the draw through a layer
        // whose restore paint applies both the opacity and the blend mode.
        const layerPaint = new ck.Paint();
        try {
          layerPaint.setAlphaf(node.opacity);
          layerPaint.setBlendMode(toBlendMode(ck, node.blend));
          canvas.saveLayer(layerPaint);
          layered = true;
        } finally {
          layerPaint.delete();
        }
      } else {
        paint.setBlendMode(toBlendMode(ck, node.blend));
      }
    }
    canvas.drawPath(path, paint);
  } finally {
    if (layered) canvas.restore();
    if (shader) shader.delete();
    paint.delete();
    path.delete();
  }
}

function drawGroupNode(ctx: RenderContext, node: GroupNodeIR): void {
  const { ck, canvas } = ctx;
  // Clip first (its own save/restore pair), then the opacity/blend layer, so
  // children composite inside the clipped region — mirrors the vello lane's
  // push_layer(clip, blend, opacity).
  let clipSaved = false;
  if (node.clip !== null) {
    const clipPath = buildPath(ck, node.clip);
    try {
      canvas.save();
      clipSaved = true;
      canvas.clipPath(clipPath, ck.ClipOp.Intersect, true);
    } finally {
      clipPath.delete();
    }
  }
  try {
    const layerPaint = new ck.Paint();
    try {
      layerPaint.setAlphaf(node.opacity);
      layerPaint.setBlendMode(toBlendMode(ck, node.blend));
      // saveLayer copies the paint into the layer record, so the paint can be
      // deleted immediately after.
      canvas.saveLayer(layerPaint);
    } finally {
      layerPaint.delete();
    }
    try {
      renderNodes(ctx, node.children);
    } finally {
      canvas.restore();
    }
  } finally {
    if (clipSaved) canvas.restore();
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function resolveTypeface(ctx: RenderContext): Typeface {
  if (ctx.typeface) return ctx.typeface;
  const { fontData } = ctx.options;
  if (!fontData) {
    throw new UnsupportedSceneFeatureError(PROVIDER_ID, ["render.text.paragraph"]);
  }
  const typeface = ctx.ck.Typeface.MakeFreeTypeFaceFromData(toArrayBuffer(fontData));
  if (!typeface) {
    throw new Error(
      `${PROVIDER_ID} could not decode RenderOptions.fontData as a font (expected TTF/WOFF/WOFF2 bytes)`,
    );
  }
  ctx.typeface = typeface;
  return typeface;
}

function drawTextNode(ctx: RenderContext, node: TextNodeIR): void {
  const { ck, canvas } = ctx;
  const typeface = resolveTypeface(ctx);
  const font = new ck.Font(typeface, node.fontSizePx);
  const paint = new ck.Paint();
  try {
    paint.setAntiAlias(true);
    const { r, g, b, a } = node.color;
    paint.setColorComponents(r, g, b, a * node.opacity);
    paint.setBlendMode(toBlendMode(ck, node.blend));
    canvas.drawText(node.text, node.x, node.y, paint, font);
  } finally {
    paint.delete();
    font.delete();
  }
}

function renderNodes(ctx: RenderContext, nodes: SceneNodeIR[]): void {
  for (const node of nodes) {
    switch (node.kind) {
      case "fill-path":
      case "stroke-path":
        drawPathNode(ctx, node);
        break;
      case "text":
        drawTextNode(ctx, node);
        break;
      case "group":
        drawGroupNode(ctx, node);
        break;
    }
  }
}

function renderScene(
  ck: CanvasKit,
  canvas: Canvas,
  scene: SceneIR,
  options: RenderOptions,
): void {
  const ctx: RenderContext = { ck, canvas, options, typeface: null };
  try {
    canvas.clear(colorToFloat4(scene.background, 1));
    renderNodes(ctx, scene.nodes);
  } finally {
    ctx.typeface?.delete();
  }
}

function makeRasterSurface(ck: CanvasKit, width: number, height: number): Surface {
  const surface = ck.MakeSurface(width, height);
  if (!surface) {
    throw new Error(
      `${PROVIDER_ID} could not allocate a ${width}x${height} CPU raster surface`,
    );
  }
  return surface;
}

/**
 * Renders the scene on a CPU raster surface and returns unpremultiplied
 * RGBA8888 pixels (width * height * 4 bytes, sRGB, row-major from top-left).
 */
export function renderSceneToPixels(
  ck: CanvasKit,
  scene: SceneIR,
  options: RenderOptions = {},
): Uint8Array {
  const surface = makeRasterSurface(ck, scene.width, scene.height);
  try {
    renderScene(ck, surface.getCanvas(), scene, options);
    surface.flush();
    const pixels = surface
      .getCanvas()
      .readPixels(0, 0, rasterImageInfo(ck, scene.width, scene.height));
    if (!(pixels instanceof Uint8Array)) {
      throw new Error(
        `${PROVIDER_ID} readPixels(RGBA_8888, Unpremul) failed on the ${scene.width}x${scene.height} raster surface`,
      );
    }
    const expectedLength = scene.width * scene.height * RGBA_BYTES_PER_PIXEL;
    if (pixels.length !== expectedLength) {
      throw new Error(
        `${PROVIDER_ID} readPixels returned ${pixels.length} bytes, expected ${expectedLength}`,
      );
    }
    return pixels;
  } finally {
    surface.delete();
  }
}

/** Renders the scene and returns PNG-encoded bytes (export.png capability). */
export function renderSceneToPng(
  ck: CanvasKit,
  scene: SceneIR,
  options: RenderOptions = {},
): Uint8Array {
  const surface = makeRasterSurface(ck, scene.width, scene.height);
  try {
    renderScene(ck, surface.getCanvas(), scene, options);
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      const bytes = image.encodeToBytes(ck.ImageFormat.PNG, 100);
      if (!bytes) {
        throw new Error(`${PROVIDER_ID} PNG encode failed (encodeToBytes returned null)`);
      }
      return bytes;
    } finally {
      image.delete();
    }
  } finally {
    surface.delete();
  }
}

/**
 * Encodes externally produced unpremultiplied RGBA8888 pixels as PNG — used to
 * persist golden images from other renderer lanes through the same codec.
 */
export function encodeRgbaToPng(
  ck: CanvasKit,
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`${PROVIDER_ID} encodeRgbaToPng needs positive integer dimensions, got ${width}x${height}`);
  }
  const expectedLength = width * height * RGBA_BYTES_PER_PIXEL;
  if (pixels.length !== expectedLength) {
    throw new Error(
      `${PROVIDER_ID} encodeRgbaToPng got ${pixels.length} bytes for ${width}x${height}, expected ${expectedLength}`,
    );
  }
  const image = ck.MakeImage(
    rasterImageInfo(ck, width, height),
    pixels,
    width * RGBA_BYTES_PER_PIXEL,
  );
  if (!image) {
    throw new Error(`${PROVIDER_ID} MakeImage failed for the RGBA pixel upload`);
  }
  try {
    const bytes = image.encodeToBytes(ck.ImageFormat.PNG, 100);
    if (!bytes) {
      throw new Error(`${PROVIDER_ID} PNG encode failed (encodeToBytes returned null)`);
    }
    return bytes;
  } finally {
    image.delete();
  }
}
