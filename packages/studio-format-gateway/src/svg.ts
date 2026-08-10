import { pathBounds, sceneIRSchema } from "@toonspectrum/studio-project-model";

import type {
  BlendModeIR,
  ColorIR,
  GradientStopIR,
  PaintIR,
  PathIR,
  PathVerbIR,
  SceneIR,
  SceneNodeIR,
} from "@toonspectrum/studio-project-model";

/**
 * SVG subset importer (V12 gate matrix, vello_svg-role lane).
 *
 * Maps decorations, speech balloons, brush tips and icon assets into SceneIR
 * with all transforms baked into path coordinates (SceneIR carries none) and
 * every non-representable feature surfaced through `unsupported`/`warnings`
 * instead of silently dropped (§ absolute rule: zero silent data loss). The
 * XML front-end is self-contained: well-formed SVG is assumed, only the five
 * predefined entities are decoded, DOCTYPE/CDATA are skipped.
 */

export class SvgParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "SvgParseError";
  }
}

export interface SvgImportOptions {
  /** Resolves `currentColor`; defaults to opaque black. */
  currentColor?: ColorIR;
  /** Scene background; defaults to fully transparent. */
  background?: ColorIR;
}

export interface SvgImportResult {
  scene: SceneIR;
  warnings: string[];
  unsupported: string[];
}

// ---------------------------------------------------------------------------
// Mini XML parser (elements + attributes; text content is never rendered)
// ---------------------------------------------------------------------------

interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  offset: number;
}

function lineColOf(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const end = Math.min(offset, text.length);
  for (let index = 0; index < end; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function xmlError(text: string, offset: number, message: string): never {
  const { line, column } = lineColOf(text, offset);
  throw new SvgParseError(message, line, column);
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);
}

const NAME_CHAR = /[A-Za-z0-9_.:-]/;

function isWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

class XmlCursor {
  index = 0;
  constructor(readonly text: string) {}

  fail(message: string, at = this.index): never {
    return xmlError(this.text, at, message);
  }

  skipWhitespace(): void {
    while (isWhitespace(this.text[this.index])) this.index += 1;
  }

  readName(): string {
    const start = this.index;
    while (this.index < this.text.length && NAME_CHAR.test(this.text[this.index] ?? "")) {
      this.index += 1;
    }
    if (this.index === start) this.fail("expected an XML name", start);
    return this.text.slice(start, this.index);
  }

  /** Skips past `terminator`, failing at `from` when it never appears. */
  skipUntil(terminator: string, description: string, from: number): void {
    const at = this.text.indexOf(terminator, this.index);
    if (at < 0) this.fail(`unterminated ${description}`, from);
    this.index = at + terminator.length;
  }
}

function parseAttributes(cursor: XmlCursor, attrs: Record<string, string>): void {
  for (;;) {
    cursor.skipWhitespace();
    const ch = cursor.text[cursor.index];
    if (ch === undefined) cursor.fail("unexpected end of input inside a tag");
    if (ch === ">" || ch === "/" || ch === "?") return;
    const nameStart = cursor.index;
    const name = cursor.readName();
    cursor.skipWhitespace();
    if (cursor.text[cursor.index] !== "=") {
      cursor.fail(`attribute "${name}" is missing "="`, nameStart);
    }
    cursor.index += 1;
    cursor.skipWhitespace();
    const quote = cursor.text[cursor.index];
    if (quote !== '"' && quote !== "'") {
      cursor.fail(`attribute "${name}" value must be quoted`, cursor.index);
    }
    cursor.index += 1;
    const valueStart = cursor.index;
    const valueEnd = cursor.text.indexOf(quote, valueStart);
    if (valueEnd < 0) cursor.fail(`unterminated value for attribute "${name}"`, nameStart);
    attrs[name] = decodeEntities(cursor.text.slice(valueStart, valueEnd));
    cursor.index = valueEnd + 1;
  }
}

function skipDoctype(cursor: XmlCursor, from: number): void {
  // `<!DOCTYPE ... [internal subset]>` — track bracket depth so a `>` inside
  // the internal subset does not terminate early.
  let depth = 0;
  while (cursor.index < cursor.text.length) {
    const ch = cursor.text[cursor.index];
    cursor.index += 1;
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
    else if (ch === ">" && depth <= 0) return;
  }
  cursor.fail("unterminated DOCTYPE declaration", from);
}

function parseMarkupDeclaration(cursor: XmlCursor, from: number): void {
  if (cursor.text.startsWith("<!--", from)) {
    cursor.index = from + 4;
    cursor.skipUntil("-->", "comment", from);
  } else if (cursor.text.startsWith("<![CDATA[", from)) {
    cursor.index = from + 9;
    cursor.skipUntil("]]>", "CDATA section", from);
  } else {
    cursor.index = from + 2;
    skipDoctype(cursor, from);
  }
}

function parseXmlDocument(text: string): XmlElement {
  const cursor = new XmlCursor(text);
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;

  while (cursor.index < text.length) {
    const lt = text.indexOf("<", cursor.index);
    if (lt < 0) break; // trailing character data is ignored
    cursor.index = lt;
    const next = text[lt + 1];
    if (next === "!") {
      parseMarkupDeclaration(cursor, lt);
      continue;
    }
    if (next === "?") {
      cursor.index = lt + 2;
      cursor.skipUntil("?>", "processing instruction", lt);
      continue;
    }
    if (next === "/") {
      cursor.index = lt + 2;
      const name = cursor.readName();
      cursor.skipWhitespace();
      if (text[cursor.index] !== ">") cursor.fail(`malformed closing tag </${name}>`, lt);
      cursor.index += 1;
      const open = stack.pop();
      if (open === undefined) {
        xmlError(text, lt, `closing tag </${name}> without a matching open tag`);
      }
      if (open.tag !== name) {
        xmlError(text, lt, `closing tag </${name}> does not match <${open.tag}>`);
      }
      continue;
    }
    cursor.index = lt + 1;
    const element: XmlElement = {
      tag: cursor.readName(),
      attrs: {},
      children: [],
      offset: lt,
    };
    parseAttributes(cursor, element.attrs);
    const selfClosing = text[cursor.index] === "/";
    if (selfClosing) cursor.index += 1;
    if (text[cursor.index] !== ">") cursor.fail(`malformed tag <${element.tag}>`, lt);
    cursor.index += 1;

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(element);
    } else if (root === null) {
      root = element;
    } else {
      cursor.fail("multiple root elements", lt);
    }
    if (!selfClosing) stack.push(element);
  }

  const unclosed = stack[stack.length - 1];
  if (unclosed) xmlError(text, unclosed.offset, `unclosed tag <${unclosed.tag}>`);
  if (root === null) xmlError(text, 0, "no root element found");
  return root;
}

// ---------------------------------------------------------------------------
// Affine matrices — [a, b, c, d, e, f]: x' = ax + cy + e, y' = bx + dy + f
// ---------------------------------------------------------------------------

type Mat = readonly [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function matMul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function matApply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function isIdentity(m: Mat): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

/** X/Y scale magnitudes of the linear part — used for stroke width & radii. */
function matScales(m: Mat): { sx: number; sy: number } {
  return { sx: Math.hypot(m[0], m[1]), sy: Math.hypot(m[2], m[3]) };
}

function transformPath(path: PathIR, m: Mat): PathIR {
  if (isIdentity(m)) return path;
  const verbs: PathVerbIR[] = path.verbs.map((verb) => {
    switch (verb.v) {
      case "M":
      case "L": {
        const [x, y] = matApply(m, verb.x, verb.y);
        return { v: verb.v, x, y };
      }
      case "Q": {
        const [cx, cy] = matApply(m, verb.cx, verb.cy);
        const [x, y] = matApply(m, verb.x, verb.y);
        return { v: "Q", cx, cy, x, y };
      }
      case "C": {
        const [c1x, c1y] = matApply(m, verb.c1x, verb.c1y);
        const [c2x, c2y] = matApply(m, verb.c2x, verb.c2y);
        const [x, y] = matApply(m, verb.x, verb.y);
        return { v: "C", c1x, c1y, c2x, c2y, x, y };
      }
      case "Z":
        return { v: "Z" };
    }
  });
  return { verbs };
}

// ---------------------------------------------------------------------------
// transform="" attribute
// ---------------------------------------------------------------------------

const TRANSFORM_FUNCTION = /([A-Za-z]+)\s*\(([^)]*)\)/g;

function transformArgs(
  raw: string,
  fn: string,
  position: ElementPosition,
): number[] {
  const parts = raw.trim().split(/[\s,]+/).filter((part) => part.length > 0);
  const args = parts.map((part) => Number(part));
  if (args.some((value) => !Number.isFinite(value))) {
    throw new SvgParseError(
      `transform ${fn}() has a non-numeric argument`,
      position.line,
      position.column,
    );
  }
  return args;
}

function transformFunctionMatrix(
  fn: string,
  args: number[],
  position: ElementPosition,
): Mat {
  const bad = (): never => {
    throw new SvgParseError(
      `transform ${fn}() has ${args.length} argument(s)`,
      position.line,
      position.column,
    );
  };
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  switch (fn) {
    case "translate": {
      if (args.length < 1 || args.length > 2) bad();
      return [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
    }
    case "scale": {
      if (args.length < 1 || args.length > 2) bad();
      const sx = args[0] ?? 1;
      return [sx, 0, 0, args[1] ?? sx, 0, 0];
    }
    case "rotate": {
      if (args.length !== 1 && args.length !== 3) bad();
      const a = rad(args[0] ?? 0);
      const rotation: Mat = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
      if (args.length === 1) return rotation;
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      return matMul(matMul([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
    }
    case "matrix": {
      if (args.length !== 6) bad();
      return [args[0] ?? 0, args[1] ?? 0, args[2] ?? 0, args[3] ?? 0, args[4] ?? 0, args[5] ?? 0];
    }
    case "skewX": {
      if (args.length !== 1) bad();
      return [1, 0, Math.tan(rad(args[0] ?? 0)), 1, 0, 0];
    }
    case "skewY": {
      if (args.length !== 1) bad();
      return [1, Math.tan(rad(args[0] ?? 0)), 0, 1, 0, 0];
    }
    default:
      throw new SvgParseError(
        `unknown transform function ${fn}()`,
        position.line,
        position.column,
      );
  }
}

function parseTransformAttr(raw: string | undefined, position: ElementPosition): Mat {
  if (raw === undefined || raw.trim().length === 0) return IDENTITY;
  let matrix: Mat = IDENTITY;
  let consumed = 0;
  TRANSFORM_FUNCTION.lastIndex = 0;
  for (let match = TRANSFORM_FUNCTION.exec(raw); match; match = TRANSFORM_FUNCTION.exec(raw)) {
    const between = raw.slice(consumed, match.index);
    if (/[^\s,]/.test(between)) {
      throw new SvgParseError(
        `unparseable transform fragment "${between.trim()}"`,
        position.line,
        position.column,
      );
    }
    const fn = match[1] ?? "";
    const args = transformArgs(match[2] ?? "", fn, position);
    matrix = matMul(matrix, transformFunctionMatrix(fn, args, position));
    consumed = match.index + match[0].length;
  }
  if (/[^\s,]/.test(raw.slice(consumed))) {
    throw new SvgParseError(
      `unparseable transform fragment "${raw.slice(consumed).trim()}"`,
      position.line,
      position.column,
    );
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** CSS/HTML basic 16 (+ grey/cyan/magenta aliases), 8-bit sRGB triples. */
const NAMED_COLORS: Record<string, readonly [number, number, number]> = {
  black: [0, 0, 0],
  silver: [192, 192, 192],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  white: [255, 255, 255],
  maroon: [128, 0, 0],
  red: [255, 0, 0],
  purple: [128, 0, 128],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
  green: [0, 128, 0],
  lime: [0, 255, 0],
  olive: [128, 128, 0],
  yellow: [255, 255, 0],
  navy: [0, 0, 128],
  blue: [0, 0, 255],
  teal: [0, 128, 128],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
};

function rgb8(r: number, g: number, b: number, a = 1): ColorIR {
  const clamp8 = (v: number): number => Math.min(255, Math.max(0, v)) / 255;
  return { r: clamp8(r), g: clamp8(g), b: clamp8(b), a: Math.min(1, Math.max(0, a)) };
}

function parseHexColor(hex: string): ColorIR | null {
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  const digit = (index: number): number => Number.parseInt(hex[index] ?? "0", 16);
  const pair = (index: number): number => Number.parseInt(hex.slice(index, index + 2), 16);
  switch (hex.length) {
    case 3:
      return rgb8(digit(0) * 17, digit(1) * 17, digit(2) * 17);
    case 4:
      return rgb8(digit(0) * 17, digit(1) * 17, digit(2) * 17, (digit(3) * 17) / 255);
    case 6:
      return rgb8(pair(0), pair(2), pair(4));
    case 8:
      return rgb8(pair(0), pair(2), pair(4), pair(6) / 255);
    default:
      return null;
  }
}

function parseRgbChannel(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    const pct = Number(trimmed.slice(0, -1));
    return Number.isFinite(pct) ? (pct / 100) * 255 : null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function parseRgbFunction(body: string): ColorIR | null {
  const parts = body.split(/[\s,/]+/).filter((part) => part.length > 0);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const channels = parts.slice(0, 3).map((part) => parseRgbChannel(part));
  if (channels.some((value) => value === null)) return null;
  let alpha = 1;
  const alphaRaw = parts[3];
  if (alphaRaw !== undefined) {
    const parsedAlpha = alphaRaw.endsWith("%")
      ? Number(alphaRaw.slice(0, -1)) / 100
      : Number(alphaRaw);
    if (!Number.isFinite(parsedAlpha)) return null;
    alpha = parsedAlpha;
  }
  return rgb8(channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, alpha);
}

/** Returns "none" for `none`, null when unparseable (caller surfaces it). */
function parseColorValue(raw: string, currentColor: ColorIR): ColorIR | "none" | null {
  const value = raw.trim();
  const lower = value.toLowerCase();
  if (lower === "none") return "none";
  if (lower === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (lower === "currentcolor") return { ...currentColor };
  if (value.startsWith("#")) return parseHexColor(value.slice(1));
  const fnMatch = /^rgba?\(([^)]*)\)$/i.exec(value);
  if (fnMatch) return parseRgbFunction(fnMatch[1] ?? "");
  const named = NAMED_COLORS[lower];
  return named ? rgb8(named[0], named[1], named[2]) : null;
}

// ---------------------------------------------------------------------------
// path d="" parser — full M L H V C S Q T A Z grammar, arcs → cubics
// ---------------------------------------------------------------------------

interface ElementPosition {
  line: number;
  column: number;
}

class PathDataScanner {
  index = 0;
  constructor(
    private readonly data: string,
    private readonly position: ElementPosition,
  ) {}

  fail(detail: string): never {
    throw new SvgParseError(
      `path data error at offset ${this.index}: ${detail}`,
      this.position.line,
      this.position.column,
    );
  }

  private skipSeparators(): void {
    while (this.index < this.data.length) {
      const ch = this.data[this.index];
      if (ch === "," || isWhitespace(ch)) this.index += 1;
      else break;
    }
  }

  done(): boolean {
    this.skipSeparators();
    return this.index >= this.data.length;
  }

  /** Peeks a command letter, or null when the next token is numeric. */
  peekCommand(): string | null {
    this.skipSeparators();
    const ch = this.data[this.index];
    return ch !== undefined && /[A-Za-z]/.test(ch) ? ch : null;
  }

  readCommand(): string {
    const ch = this.peekCommand();
    if (ch === null) this.fail("expected a command letter");
    this.index += 1;
    return ch;
  }

  readNumber(): number {
    this.skipSeparators();
    const start = this.index;
    if (this.data[this.index] === "+" || this.data[this.index] === "-") this.index += 1;
    let digits = 0;
    while (/[0-9]/.test(this.data[this.index] ?? "")) {
      this.index += 1;
      digits += 1;
    }
    if (this.data[this.index] === ".") {
      this.index += 1;
      while (/[0-9]/.test(this.data[this.index] ?? "")) {
        this.index += 1;
        digits += 1;
      }
    }
    if (digits === 0) this.fail("expected a number");
    if (this.data[this.index] === "e" || this.data[this.index] === "E") {
      const beforeExponent = this.index;
      this.index += 1;
      if (this.data[this.index] === "+" || this.data[this.index] === "-") this.index += 1;
      let exponentDigits = 0;
      while (/[0-9]/.test(this.data[this.index] ?? "")) {
        this.index += 1;
        exponentDigits += 1;
      }
      if (exponentDigits === 0) this.index = beforeExponent;
    }
    const value = Number(this.data.slice(start, this.index));
    if (!Number.isFinite(value)) this.fail("malformed number");
    return value;
  }

  /** Arc flags are single characters and may be packed ("11" / "01.5,0"). */
  readFlag(): boolean {
    this.skipSeparators();
    const ch = this.data[this.index];
    if (ch !== "0" && ch !== "1") this.fail("expected an arc flag (0 or 1)");
    this.index += 1;
    return ch === "1";
  }
}

/** Endpoint → center parameterization (W3C F.6.5/F.6.6), then ≤90° cubics. */
function arcToCubics(
  x1: number,
  y1: number,
  radiusXRaw: number,
  radiusYRaw: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): PathVerbIR[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(radiusXRaw);
  let ry = Math.abs(radiusYRaw);
  if (rx === 0 || ry === 0) return [{ v: "L", x: x2, y: y2 }];

  const phi = (rotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const numerator = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const sign = largeArc !== sweep ? 1 : -1;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angleBetween = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const magnitude = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const clamped = Math.min(1, Math.max(-1, dot / magnitude));
    const angle = Math.acos(clamped);
    return ux * vy - uy * vx < 0 ? -angle : angle;
  };
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const theta1 = angleBetween(1, 0, ux, uy);
  let deltaTheta = angleBetween(ux, uy, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweep && deltaTheta < 0) deltaTheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)));
  const delta = deltaTheta / segments;
  const alpha = (4 / 3) * Math.tan(delta / 4);
  const pointAt = (theta: number): [number, number] => [
    cx + rx * cosPhi * Math.cos(theta) - ry * sinPhi * Math.sin(theta),
    cy + rx * sinPhi * Math.cos(theta) + ry * cosPhi * Math.sin(theta),
  ];
  const derivativeAt = (theta: number): [number, number] => [
    -rx * cosPhi * Math.sin(theta) - ry * sinPhi * Math.cos(theta),
    -rx * sinPhi * Math.sin(theta) + ry * cosPhi * Math.cos(theta),
  ];

  const verbs: PathVerbIR[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const thetaStart = theta1 + segment * delta;
    const thetaEnd = thetaStart + delta;
    const [sx, sy] = pointAt(thetaStart);
    const [sdx, sdy] = derivativeAt(thetaStart);
    const [ex, ey] = pointAt(thetaEnd);
    const [edx, edy] = derivativeAt(thetaEnd);
    verbs.push({
      v: "C",
      c1x: sx + alpha * sdx,
      c1y: sy + alpha * sdy,
      c2x: ex - alpha * edx,
      c2y: ey - alpha * edy,
      x: segment === segments - 1 ? x2 : ex,
      y: segment === segments - 1 ? y2 : ey,
    });
  }
  return verbs;
}

interface PathState {
  verbs: PathVerbIR[];
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** Last cubic second control point, for S reflection. */
  cubicControl: [number, number] | null;
  /** Last quadratic control point, for T reflection. */
  quadControl: [number, number] | null;
}

function reflectControl(control: [number, number] | null, x: number, y: number): [number, number] {
  return control ? [2 * x - control[0], 2 * y - control[1]] : [x, y];
}

function runMoveLine(state: PathState, command: string, scanner: PathDataScanner): void {
  const relative = command === command.toLowerCase();
  const upper = command.toUpperCase();
  let x = state.x;
  let y = state.y;
  if (upper === "H") {
    const value = scanner.readNumber();
    x = relative ? state.x + value : value;
  } else if (upper === "V") {
    const value = scanner.readNumber();
    y = relative ? state.y + value : value;
  } else {
    const px = scanner.readNumber();
    const py = scanner.readNumber();
    x = relative ? state.x + px : px;
    y = relative ? state.y + py : py;
  }
  state.verbs.push({ v: upper === "M" ? "M" : "L", x, y });
  state.x = x;
  state.y = y;
  if (upper === "M") {
    state.startX = x;
    state.startY = y;
  }
}

function runCubic(state: PathState, command: string, scanner: PathDataScanner): void {
  const relative = command === command.toLowerCase();
  const upper = command.toUpperCase();
  const abs = (px: number, py: number): [number, number] =>
    relative ? [state.x + px, state.y + py] : [px, py];
  let c1: [number, number];
  if (upper === "S") {
    c1 = reflectControl(state.cubicControl, state.x, state.y);
  } else {
    c1 = abs(scanner.readNumber(), scanner.readNumber());
  }
  const c2 = abs(scanner.readNumber(), scanner.readNumber());
  const [x, y] = abs(scanner.readNumber(), scanner.readNumber());
  state.verbs.push({ v: "C", c1x: c1[0], c1y: c1[1], c2x: c2[0], c2y: c2[1], x, y });
  state.x = x;
  state.y = y;
  state.cubicControl = c2;
}

function runQuadratic(state: PathState, command: string, scanner: PathDataScanner): void {
  const relative = command === command.toLowerCase();
  const upper = command.toUpperCase();
  const abs = (px: number, py: number): [number, number] =>
    relative ? [state.x + px, state.y + py] : [px, py];
  let control: [number, number];
  if (upper === "T") {
    control = reflectControl(state.quadControl, state.x, state.y);
  } else {
    control = abs(scanner.readNumber(), scanner.readNumber());
  }
  const [x, y] = abs(scanner.readNumber(), scanner.readNumber());
  state.verbs.push({ v: "Q", cx: control[0], cy: control[1], x, y });
  state.x = x;
  state.y = y;
  state.quadControl = control;
}

function runArc(state: PathState, command: string, scanner: PathDataScanner): void {
  const relative = command === "a";
  const rx = scanner.readNumber();
  const ry = scanner.readNumber();
  const rotation = scanner.readNumber();
  const largeArc = scanner.readFlag();
  const sweep = scanner.readFlag();
  const px = scanner.readNumber();
  const py = scanner.readNumber();
  const x = relative ? state.x + px : px;
  const y = relative ? state.y + py : py;
  state.verbs.push(...arcToCubics(state.x, state.y, rx, ry, rotation, largeArc, sweep, x, y));
  state.x = x;
  state.y = y;
}

export function parsePathData(d: string, position: ElementPosition = { line: 0, column: 0 }): PathVerbIR[] {
  const scanner = new PathDataScanner(d, position);
  const state: PathState = {
    verbs: [],
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    cubicControl: null,
    quadControl: null,
  };
  let command: string | null = null;

  while (!scanner.done()) {
    const nextCommand = scanner.peekCommand();
    if (nextCommand !== null) {
      command = scanner.readCommand();
    } else if (command === null) {
      scanner.fail("path data must start with a command");
    } else if (command === "M") {
      command = "L"; // implicit lineto after moveto
    } else if (command === "m") {
      command = "l";
    } else if (command.toUpperCase() === "Z") {
      scanner.fail("numbers after Z without a command");
    }

    const upper = (command ?? "").toUpperCase();
    switch (upper) {
      case "M":
      case "L":
      case "H":
      case "V":
        runMoveLine(state, command ?? "", scanner);
        break;
      case "C":
      case "S":
        runCubic(state, command ?? "", scanner);
        break;
      case "Q":
      case "T":
        runQuadratic(state, command ?? "", scanner);
        break;
      case "A":
        runArc(state, command ?? "", scanner);
        break;
      case "Z":
        state.verbs.push({ v: "Z" });
        state.x = state.startX;
        state.y = state.startY;
        break;
      default:
        scanner.fail(`unknown path command "${command ?? ""}"`);
    }
    if (upper !== "C" && upper !== "S") state.cubicControl = null;
    if (upper !== "Q" && upper !== "T") state.quadControl = null;
  }
  return state.verbs;
}

// ---------------------------------------------------------------------------
// Shape elements → local-space PathIR
// ---------------------------------------------------------------------------

/** Cubic circular-arc approximation constant (4/3)·(√2−1). */
const KAPPA = 0.5522847498307936;

function numberAttr(el: XmlElement, name: string, fallback: number): number {
  const raw = el.attrs[name];
  if (raw === undefined) return fallback;
  const value = Number(raw.trim().replace(/px$/, ""));
  return Number.isFinite(value) ? value : fallback;
}

function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  rxRaw: number,
  ryRaw: number,
): PathVerbIR[] {
  const rx = Math.min(Math.max(0, rxRaw), width / 2);
  const ry = Math.min(Math.max(0, ryRaw), height / 2);
  if (rx === 0 || ry === 0) {
    return [
      { v: "M", x, y },
      { v: "L", x: x + width, y },
      { v: "L", x: x + width, y: y + height },
      { v: "L", x, y: y + height },
      { v: "Z" },
    ];
  }
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const right = x + width;
  const bottom = y + height;
  return [
    { v: "M", x: x + rx, y },
    { v: "L", x: right - rx, y },
    { v: "C", c1x: right - rx + kx, c1y: y, c2x: right, c2y: y + ry - ky, x: right, y: y + ry },
    { v: "L", x: right, y: bottom - ry },
    { v: "C", c1x: right, c1y: bottom - ry + ky, c2x: right - rx + kx, c2y: bottom, x: right - rx, y: bottom },
    { v: "L", x: x + rx, y: bottom },
    { v: "C", c1x: x + rx - kx, c1y: bottom, c2x: x, c2y: bottom - ry + ky, x, y: bottom - ry },
    { v: "L", x, y: y + ry },
    { v: "C", c1x: x, c1y: y + ry - ky, c2x: x + rx - kx, c2y: y, x: x + rx, y },
    { v: "Z" },
  ];
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathVerbIR[] {
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  return [
    { v: "M", x: cx + rx, y: cy },
    { v: "C", c1x: cx + rx, c1y: cy + ky, c2x: cx + kx, c2y: cy + ry, x: cx, y: cy + ry },
    { v: "C", c1x: cx - kx, c1y: cy + ry, c2x: cx - rx, c2y: cy + ky, x: cx - rx, y: cy },
    { v: "C", c1x: cx - rx, c1y: cy - ky, c2x: cx - kx, c2y: cy - ry, x: cx, y: cy - ry },
    { v: "C", c1x: cx + kx, c1y: cy - ry, c2x: cx + rx, c2y: cy - ky, x: cx + rx, y: cy },
    { v: "Z" },
  ];
}

function parsePointsAttr(raw: string, warn: (message: string) => void): Array<[number, number]> {
  const tokens = raw.trim().split(/[\s,]+/).filter((token) => token.length > 0);
  const values: number[] = [];
  for (const token of tokens) {
    const value = Number(token);
    if (!Number.isFinite(value)) {
      warn(`points list contains non-numeric token "${token}"; truncated there`);
      break;
    }
    values.push(value);
  }
  if (values.length % 2 !== 0) {
    warn("points list has an odd coordinate count; last value dropped");
    values.pop();
  }
  const points: Array<[number, number]> = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push([values[index] ?? 0, values[index + 1] ?? 0]);
  }
  return points;
}

function rectToPath(el: XmlElement): PathVerbIR[] | null {
  const width = numberAttr(el, "width", 0);
  const height = numberAttr(el, "height", 0);
  if (width <= 0 || height <= 0) return null;
  const rxRaw = el.attrs["rx"];
  const ryRaw = el.attrs["ry"];
  let rx = rxRaw === undefined ? Number.NaN : numberAttr(el, "rx", 0);
  let ry = ryRaw === undefined ? Number.NaN : numberAttr(el, "ry", 0);
  if (Number.isNaN(rx) && Number.isNaN(ry)) {
    rx = 0;
    ry = 0;
  } else if (Number.isNaN(rx)) {
    rx = ry;
  } else if (Number.isNaN(ry)) {
    ry = rx;
  }
  return roundedRectPath(numberAttr(el, "x", 0), numberAttr(el, "y", 0), width, height, rx, ry);
}

/** Local-space geometry for one shape element; null = renders nothing. */
function shapeToPath(
  el: XmlElement,
  position: ElementPosition,
  warn: (message: string) => void,
): PathVerbIR[] | null {
  switch (el.tag) {
    case "path": {
      const d = el.attrs["d"];
      if (d === undefined || d.trim().length === 0) return null;
      return parsePathData(d, position);
    }
    case "rect":
      return rectToPath(el);
    case "circle": {
      const r = numberAttr(el, "r", 0);
      if (r <= 0) return null;
      return ellipsePath(numberAttr(el, "cx", 0), numberAttr(el, "cy", 0), r, r);
    }
    case "ellipse": {
      const rx = numberAttr(el, "rx", 0);
      const ry = numberAttr(el, "ry", 0);
      if (rx <= 0 || ry <= 0) return null;
      return ellipsePath(numberAttr(el, "cx", 0), numberAttr(el, "cy", 0), rx, ry);
    }
    case "line":
      return [
        { v: "M", x: numberAttr(el, "x1", 0), y: numberAttr(el, "y1", 0) },
        { v: "L", x: numberAttr(el, "x2", 0), y: numberAttr(el, "y2", 0) },
      ];
    case "polyline":
    case "polygon": {
      const points = parsePointsAttr(el.attrs["points"] ?? "", warn);
      if (points.length < 2) return null;
      const verbs: PathVerbIR[] = points.map(([x, y], index) =>
        index === 0 ? { v: "M", x, y } : { v: "L", x, y },
      );
      if (el.tag === "polygon") verbs.push({ v: "Z" });
      return verbs;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

type PaintSpec =
  | { kind: "none" }
  | { kind: "color"; color: ColorIR }
  | { kind: "ref"; id: string; fallback: ColorIR | null };

interface StyleState {
  fill: PaintSpec;
  stroke: PaintSpec;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWidth: number;
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
  miterLimit: number;
  fillRule: "nonzero" | "evenodd";
}

const INITIAL_STYLE: StyleState = {
  fill: { kind: "color", color: { r: 0, g: 0, b: 0, a: 1 } },
  stroke: { kind: "none" },
  fillOpacity: 1,
  strokeOpacity: 1,
  strokeWidth: 1,
  cap: "butt",
  join: "miter",
  miterLimit: 4,
  fillRule: "nonzero",
};

/** style="" wins over the presentation attribute of the same name. */
function styleMapOf(el: XmlElement): Map<string, string> {
  const map = new Map<string, string>();
  const style = el.attrs["style"];
  if (style === undefined) return map;
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (property.length > 0 && value.length > 0) map.set(property, value);
  }
  return map;
}

function propOf(el: XmlElement, styles: Map<string, string>, name: string): string | undefined {
  return styles.get(name) ?? el.attrs[name];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseOpacityValue(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  const value = trimmed.endsWith("%") ? Number(trimmed.slice(0, -1)) / 100 : Number(trimmed);
  return Number.isFinite(value) ? clamp01(value) : fallback;
}

const PAINT_URL = /^url\(\s*(["']?)([^"')\s]*)\1\s*\)\s*(.*)$/;

function parsePaintSpec(
  raw: string | undefined,
  inherited: PaintSpec,
  ctx: ConvertContext,
): PaintSpec {
  if (raw === undefined) return inherited;
  const value = raw.trim();
  if (value.length === 0 || value.toLowerCase() === "inherit") return inherited;
  const urlMatch = PAINT_URL.exec(value);
  if (urlMatch) {
    const target = urlMatch[2] ?? "";
    const fallbackRaw = (urlMatch[3] ?? "").trim();
    let fallback: ColorIR | null = null;
    if (fallbackRaw.length > 0 && fallbackRaw.toLowerCase() !== "none") {
      const parsed = parseColorValue(fallbackRaw, ctx.currentColor);
      if (parsed !== null && parsed !== "none") fallback = parsed;
    }
    if (!target.startsWith("#")) {
      ctx.warn(`external paint reference "${value}" cannot be resolved`);
      return fallback ? { kind: "color", color: fallback } : { kind: "none" };
    }
    return { kind: "ref", id: target.slice(1), fallback };
  }
  const color = parseColorValue(value, ctx.currentColor);
  if (color === "none") return { kind: "none" };
  if (color === null) {
    ctx.warn(`unrecognized paint value "${value}"; inherited paint kept`);
    return inherited;
  }
  return { kind: "color", color };
}

function enumProp<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  ctx: ConvertContext,
  name: string,
): T {
  if (raw === undefined) return fallback;
  const value = raw.trim() as T;
  if (allowed.includes(value)) return value;
  ctx.warn(`unsupported ${name} value "${raw}"; using "${fallback}"`);
  return fallback;
}

function resolveStyle(el: XmlElement, styles: Map<string, string>, inherited: StyleState, ctx: ConvertContext): StyleState {
  const strokeWidthRaw = propOf(el, styles, "stroke-width");
  let strokeWidth = inherited.strokeWidth;
  if (strokeWidthRaw !== undefined) {
    const parsed = Number(strokeWidthRaw.trim().replace(/px$/, ""));
    if (Number.isFinite(parsed)) strokeWidth = parsed;
    else ctx.warn(`unparseable stroke-width "${strokeWidthRaw}"`);
  }
  const miterRaw = propOf(el, styles, "stroke-miterlimit");
  const miterParsed = miterRaw === undefined ? Number.NaN : Number(miterRaw.trim());
  return {
    fill: parsePaintSpec(propOf(el, styles, "fill"), inherited.fill, ctx),
    stroke: parsePaintSpec(propOf(el, styles, "stroke"), inherited.stroke, ctx),
    fillOpacity: parseOpacityValue(propOf(el, styles, "fill-opacity"), inherited.fillOpacity),
    strokeOpacity: parseOpacityValue(propOf(el, styles, "stroke-opacity"), inherited.strokeOpacity),
    strokeWidth,
    cap: enumProp(propOf(el, styles, "stroke-linecap"), ["butt", "round", "square"], inherited.cap, ctx, "stroke-linecap"),
    join: enumProp(propOf(el, styles, "stroke-linejoin"), ["miter", "round", "bevel"], inherited.join, ctx, "stroke-linejoin"),
    miterLimit: Number.isFinite(miterParsed) && miterParsed >= 1 ? miterParsed : inherited.miterLimit,
    fillRule: enumProp(propOf(el, styles, "fill-rule"), ["nonzero", "evenodd"], inherited.fillRule, ctx, "fill-rule"),
  };
}

const SUPPORTED_BLENDS: readonly BlendModeIR[] = ["multiply", "screen", "darken", "lighten"];

function resolveBlend(el: XmlElement, styles: Map<string, string>, ctx: ConvertContext): BlendModeIR {
  const raw = propOf(el, styles, "mix-blend-mode");
  if (raw === undefined) return "src-over";
  const value = raw.trim().toLowerCase();
  if (value === "normal") return "src-over";
  const supported = SUPPORTED_BLENDS.find((mode) => mode === value);
  if (supported) return supported;
  ctx.unsupportedFeature(`attr:mix-blend-mode=${value}`);
  return "src-over";
}

/** Features that would change pixels but have no SceneIR representation. */
const UNSUPPORTED_PRESENTATION = [
  "stroke-dasharray",
  "stroke-dashoffset",
  "filter",
  "mask",
  "marker-start",
  "marker-mid",
  "marker-end",
  "vector-effect",
  "paint-order",
] as const;

function auditUnsupportedAttrs(el: XmlElement, styles: Map<string, string>, ctx: ConvertContext): void {
  for (const name of UNSUPPORTED_PRESENTATION) {
    const value = propOf(el, styles, name);
    if (value !== undefined && value.trim().toLowerCase() !== "none") {
      ctx.unsupportedFeature(`attr:${name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Gradient definitions
// ---------------------------------------------------------------------------

interface RawGradient {
  kind: "linear" | "radial";
  units: "userSpaceOnUse" | "objectBoundingBox";
  transform: Mat;
  /** Raw coordinate attribute strings (percent-aware, resolved at use). */
  coords: Record<string, string | undefined>;
  stops: GradientStopIR[];
}

type CoordAxis = "x" | "y" | "diagonal";

function resolveCoord(
  raw: string | undefined,
  fallback: string,
  axis: CoordAxis,
  units: RawGradient["units"],
  ctx: ConvertContext,
): number {
  const value = (raw ?? fallback).trim();
  let scale = 1;
  let numeric: number;
  if (value.endsWith("%")) {
    numeric = Number(value.slice(0, -1)) / 100;
    if (units === "userSpaceOnUse") {
      if (axis === "x") scale = ctx.viewport.width;
      else if (axis === "y") scale = ctx.viewport.height;
      else {
        scale = Math.sqrt(
          (ctx.viewport.width ** 2 + ctx.viewport.height ** 2) / 2,
        );
      }
    }
  } else {
    numeric = Number(value);
  }
  if (!Number.isFinite(numeric)) {
    ctx.warn(`unparseable gradient coordinate "${value}"; using 0`);
    return 0;
  }
  return numeric * scale;
}

function collectGradientStops(el: XmlElement, ctx: ConvertContext): GradientStopIR[] {
  const stops: GradientStopIR[] = [];
  let previousOffset = 0;
  for (const child of el.children) {
    if (child.tag !== "stop") continue;
    const styles = styleMapOf(child);
    const offsetRaw = (propOf(child, styles, "offset") ?? "0").trim();
    const offsetValue = offsetRaw.endsWith("%")
      ? Number(offsetRaw.slice(0, -1)) / 100
      : Number(offsetRaw);
    let offset = clamp01(Number.isFinite(offsetValue) ? offsetValue : 0);
    offset = Math.max(offset, previousOffset); // spec: offsets are non-decreasing
    previousOffset = offset;
    const colorRaw = propOf(child, styles, "stop-color") ?? "black";
    const parsed = parseColorValue(colorRaw, ctx.currentColor);
    const color: ColorIR =
      parsed === null || parsed === "none" ? { r: 0, g: 0, b: 0, a: 1 } : parsed;
    if (parsed === null) ctx.warn(`unrecognized stop-color "${colorRaw}"; using black`);
    const opacity = parseOpacityValue(propOf(child, styles, "stop-opacity"), 1);
    stops.push({ offset, color: { ...color, a: clamp01(color.a * opacity) } });
  }
  return stops;
}

function registerGradient(el: XmlElement, ctx: ConvertContext): void {
  const id = el.attrs["id"];
  if (id === undefined || id.length === 0) return;
  if (el.attrs["href"] !== undefined || el.attrs["xlink:href"] !== undefined) {
    ctx.unsupportedFeature("attr:href");
  }
  const spread = el.attrs["spreadMethod"];
  if (spread !== undefined && spread !== "pad") ctx.unsupportedFeature("attr:spreadMethod");
  if (el.tag === "radialGradient" && (el.attrs["fx"] !== undefined || el.attrs["fy"] !== undefined)) {
    ctx.unsupportedFeature("attr:fx");
  }
  const units =
    el.attrs["gradientUnits"] === "userSpaceOnUse" ? "userSpaceOnUse" : "objectBoundingBox";
  ctx.gradients.set(id, {
    kind: el.tag === "linearGradient" ? "linear" : "radial",
    units,
    transform: parseTransformAttr(el.attrs["gradientTransform"], positionOf(ctx, el)),
    coords: {
      x1: el.attrs["x1"],
      y1: el.attrs["y1"],
      x2: el.attrs["x2"],
      y2: el.attrs["y2"],
      cx: el.attrs["cx"],
      cy: el.attrs["cy"],
      r: el.attrs["r"],
    },
    stops: collectGradientStops(el, ctx),
  });
}

interface GradientSpace {
  /** objectBoundingBox→scene (or user→scene) point matrix incl. gradientTransform. */
  matrix: Mat;
  /** Diagonal-ish scalar used for radial radius mapping. */
  radiusScale: number;
}

function gradientSpace(def: RawGradient, bakedPath: PathIR, ctm: Mat, ctx: ConvertContext): GradientSpace | null {
  let base: Mat;
  if (def.units === "objectBoundingBox") {
    const bounds = pathBounds(bakedPath);
    if (bounds === null) {
      ctx.warn("objectBoundingBox gradient on an empty path; paint dropped");
      return null;
    }
    const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
    const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
    if (def.kind === "radial" && Math.abs(width - height) > 0.01 * Math.max(width, height)) {
      ctx.warn(
        "objectBoundingBox radial gradient on a non-square bbox approximated as circular",
      );
    }
    base = matMul([1, 0, 0, 1, bounds.minX, bounds.minY], [width, 0, 0, height, 0, 0]);
  } else {
    base = ctm;
  }
  const matrix = matMul(base, def.transform);
  const { sx, sy } = matScales(matrix);
  if (def.kind === "radial" && Math.abs(sx - sy) > 0.001 * Math.max(sx, sy, 1e-6)) {
    ctx.warn("radial gradient under a non-uniform transform approximated as circular");
  }
  return { matrix, radiusScale: (sx + sy) / 2 };
}

function gradientToPaint(
  def: RawGradient,
  bakedPath: PathIR,
  ctm: Mat,
  ctx: ConvertContext,
): PaintIR | null {
  if (def.stops.length === 0) {
    ctx.warn("gradient has no stops; paint dropped");
    return null;
  }
  const lastStop = def.stops[def.stops.length - 1] ?? { offset: 1, color: { r: 0, g: 0, b: 0, a: 1 } };
  if (def.stops.length === 1) return { kind: "solid", color: lastStop.color };
  const space = gradientSpace(def, bakedPath, ctm, ctx);
  if (space === null) return null;

  if (def.kind === "linear") {
    const x1 = resolveCoord(def.coords["x1"], "0%", "x", def.units, ctx);
    const y1 = resolveCoord(def.coords["y1"], "0%", "y", def.units, ctx);
    const x2 = resolveCoord(def.coords["x2"], "100%", "x", def.units, ctx);
    const y2 = resolveCoord(def.coords["y2"], "0%", "y", def.units, ctx);
    const from = matApply(space.matrix, x1, y1);
    const to = matApply(space.matrix, x2, y2);
    if (from[0] === to[0] && from[1] === to[1]) {
      ctx.warn("zero-length linear gradient collapsed to the last stop color");
      return { kind: "solid", color: lastStop.color };
    }
    return { kind: "linear-gradient", from, to, stops: def.stops };
  }

  const cx = resolveCoord(def.coords["cx"], "50%", "x", def.units, ctx);
  const cy = resolveCoord(def.coords["cy"], "50%", "y", def.units, ctx);
  const r = resolveCoord(def.coords["r"], "50%", "diagonal", def.units, ctx);
  const radius = r * space.radiusScale;
  if (!(radius > 0)) {
    ctx.warn("radial gradient with a non-positive radius collapsed to the last stop color");
    return { kind: "solid", color: lastStop.color };
  }
  return {
    kind: "radial-gradient",
    center: matApply(space.matrix, cx, cy),
    radius,
    stops: def.stops,
  };
}

// ---------------------------------------------------------------------------
// clipPath definitions
// ---------------------------------------------------------------------------

type ClipResolution =
  | { kind: "none" }
  | { kind: "path"; path: PathIR }
  | { kind: "empty" };

function resolveClipReference(
  raw: string | undefined,
  ctm: Mat,
  ctx: ConvertContext,
): ClipResolution {
  if (raw === undefined || raw.trim().toLowerCase() === "none" || raw.trim().length === 0) {
    return { kind: "none" };
  }
  const match = PAINT_URL.exec(raw.trim());
  const target = match?.[2] ?? "";
  if (!match || !target.startsWith("#")) {
    ctx.warn(`unresolvable clip-path reference "${raw}"; element left unclipped`);
    return { kind: "none" };
  }
  const id = target.slice(1);
  const el = ctx.clipPaths.get(id);
  if (!el) {
    ctx.warn(`clip-path url(#${id}) does not resolve; element left unclipped`);
    return { kind: "none" };
  }
  if (el.attrs["clipPathUnits"] === "objectBoundingBox") {
    ctx.unsupportedFeature("attr:clipPathUnits=objectBoundingBox");
    ctx.warn(`clipPath #${id} uses objectBoundingBox units; element left unclipped`);
    return { kind: "none" };
  }
  const clipBase = matMul(ctm, parseTransformAttr(el.attrs["transform"], positionOf(ctx, el)));
  const verbs: PathVerbIR[] = [];
  for (const child of el.children) {
    const position = positionOf(ctx, child);
    const local = shapeToPath(child, position, (message) => ctx.warn(message));
    if (local === null) {
      if (!["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(child.tag)) {
        ctx.unsupportedFeature(`element:${child.tag}`);
      }
      continue;
    }
    const childMatrix = matMul(clipBase, parseTransformAttr(child.attrs["transform"], position));
    verbs.push(...transformPath({ verbs: local }, childMatrix).verbs);
  }
  if (verbs.length === 0) {
    ctx.warn(`clipPath #${id} contains no usable geometry; clipped element dropped`);
    return { kind: "empty" };
  }
  return { kind: "path", path: { verbs } };
}

// ---------------------------------------------------------------------------
// Conversion context & traversal
// ---------------------------------------------------------------------------

interface ConvertContext {
  source: string;
  warnings: Set<string>;
  unsupported: Set<string>;
  gradients: Map<string, RawGradient>;
  clipPaths: Map<string, XmlElement>;
  currentColor: ColorIR;
  viewport: { width: number; height: number };
  idCounter: number;
  warn(message: string): void;
  unsupportedFeature(entry: string): void;
  nextId(el: XmlElement, role: string): string;
}

function positionOf(ctx: ConvertContext, el: XmlElement): ElementPosition {
  return lineColOf(ctx.source, el.offset);
}

/** Non-rendering metadata elements skipped silently (spec-correct, no loss). */
const SILENT_ELEMENTS = new Set([
  "defs",
  "title",
  "desc",
  "metadata",
  "linearGradient",
  "radialGradient",
  "clipPath",
  "stop",
]);

const SHAPE_ELEMENTS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);

function collectDefinitions(el: XmlElement, ctx: ConvertContext): void {
  if (el.tag === "linearGradient" || el.tag === "radialGradient") {
    registerGradient(el, ctx);
  } else if (el.tag === "clipPath") {
    const id = el.attrs["id"];
    if (id !== undefined && id.length > 0) ctx.clipPaths.set(id, el);
  }
  for (const child of el.children) collectDefinitions(child, ctx);
}

function resolvePaintIR(
  spec: PaintSpec,
  bakedPath: PathIR,
  ctm: Mat,
  ctx: ConvertContext,
): PaintIR | null {
  switch (spec.kind) {
    case "none":
      return null;
    case "color":
      return { kind: "solid", color: spec.color };
    case "ref": {
      const def = ctx.gradients.get(spec.id);
      if (!def) {
        ctx.warn(`paint reference url(#${spec.id}) does not resolve`);
        return spec.fallback ? { kind: "solid", color: spec.fallback } : null;
      }
      return gradientToPaint(def, bakedPath, ctm, ctx);
    }
  }
}

function strokeWidthInSceneSpace(width: number, ctm: Mat, ctx: ConvertContext): number {
  const { sx, sy } = matScales(ctm);
  if (Math.abs(sx - sy) > 0.001 * Math.max(sx, sy, 1e-6)) {
    ctx.warn("non-uniform transform: stroke width approximated by the average scale");
  }
  return width * ((sx + sy) / 2);
}

function shapeNodes(
  el: XmlElement,
  baked: PathIR,
  ctm: Mat,
  style: StyleState,
  opacity: number,
  blend: BlendModeIR,
  ctx: ConvertContext,
): SceneNodeIR[] {
  const nodes: SceneNodeIR[] = [];
  // Fill on an inherently open <line> is a no-op in SVG; skip resolving it.
  const fillPaint =
    el.tag === "line" ? null : resolvePaintIR(style.fill, baked, ctm, ctx);
  if (fillPaint) {
    nodes.push({
      id: ctx.nextId(el, "fill"),
      kind: "fill-path",
      path: baked,
      paint: fillPaint,
      fillRule: style.fillRule,
      opacity: clamp01(style.fillOpacity),
      blend,
    });
  }
  const strokePaint =
    style.strokeWidth > 0 ? resolvePaintIR(style.stroke, baked, ctm, ctx) : null;
  if (strokePaint) {
    const strokeWidth = strokeWidthInSceneSpace(style.strokeWidth, ctm, ctx);
    if (strokeWidth > 0) {
      nodes.push({
        id: ctx.nextId(el, "stroke"),
        kind: "stroke-path",
        path: baked,
        paint: strokePaint,
        strokeWidth,
        cap: style.cap,
        join: style.join,
        miterLimit: style.miterLimit,
        opacity: clamp01(style.strokeOpacity),
        blend,
      });
    }
  }
  if (nodes.length === 0) return [];
  if (opacity < 1) {
    const only = nodes[0];
    if (nodes.length === 1 && only) {
      only.opacity = clamp01(only.opacity * opacity);
    } else {
      // SVG composites fill+stroke first, then applies element opacity —
      // a group preserves that instead of double-darkening the overlap.
      return [
        {
          id: ctx.nextId(el, "opacity-group"),
          kind: "group",
          opacity: clamp01(opacity),
          blend: "src-over",
          clip: null,
          children: nodes,
        },
      ];
    }
  }
  return nodes;
}

function withClip(
  el: XmlElement,
  nodes: SceneNodeIR[],
  clip: ClipResolution,
  ctx: ConvertContext,
): SceneNodeIR[] {
  if (clip.kind === "empty") return []; // fully clipped away (spec behavior)
  if (clip.kind === "none" || nodes.length === 0) return nodes;
  return [
    {
      id: ctx.nextId(el, "clip-group"),
      kind: "group",
      opacity: 1,
      blend: "src-over",
      clip: clip.path,
      children: nodes,
    },
  ];
}

function convertElement(
  el: XmlElement,
  ctm: Mat,
  inherited: StyleState,
  ctx: ConvertContext,
): SceneNodeIR[] {
  if (SILENT_ELEMENTS.has(el.tag)) return [];

  if (el.tag === "g" || el.tag === "a") {
    const styles = styleMapOf(el);
    auditUnsupportedAttrs(el, styles, ctx);
    const position = positionOf(ctx, el);
    const style = resolveStyle(el, styles, inherited, ctx);
    const groupCtm = matMul(ctm, parseTransformAttr(el.attrs["transform"], position));
    const clip = resolveClipReference(propOf(el, styles, "clip-path"), groupCtm, ctx);
    if (clip.kind === "empty") return [];
    const children = el.children.flatMap((child) =>
      convertElement(child, groupCtm, style, ctx),
    );
    if (children.length === 0) return [];
    return [
      {
        id: ctx.nextId(el, "group"),
        kind: "group",
        opacity: parseOpacityValue(propOf(el, styles, "opacity"), 1),
        blend: resolveBlend(el, styles, ctx),
        clip: clip.kind === "path" ? clip.path : null,
        children,
      },
    ];
  }

  if (SHAPE_ELEMENTS.has(el.tag)) {
    const styles = styleMapOf(el);
    auditUnsupportedAttrs(el, styles, ctx);
    const position = positionOf(ctx, el);
    const local = shapeToPath(el, position, (message) => ctx.warn(message));
    if (local === null) return [];
    const style = resolveStyle(el, styles, inherited, ctx);
    const shapeCtm = matMul(ctm, parseTransformAttr(el.attrs["transform"], position));
    const baked = transformPath({ verbs: local }, shapeCtm);
    const nodes = shapeNodes(
      el,
      baked,
      shapeCtm,
      style,
      parseOpacityValue(propOf(el, styles, "opacity"), 1),
      resolveBlend(el, styles, ctx),
      ctx,
    );
    const clip = resolveClipReference(propOf(el, styles, "clip-path"), shapeCtm, ctx);
    return withClip(el, nodes, clip, ctx);
  }

  // Everything else is a feature this lane cannot represent — surfaced, never
  // silently dropped (text/use/symbol/marker/pattern/filter/mask/image/…).
  ctx.unsupportedFeature(`element:${el.tag}`);
  return [];
}

// ---------------------------------------------------------------------------
// Root <svg> viewport
// ---------------------------------------------------------------------------

interface Viewport {
  sceneWidth: number;
  sceneHeight: number;
  rootCtm: Mat;
  userWidth: number;
  userHeight: number;
}

function parseViewBox(raw: string, position: ElementPosition): { minX: number; minY: number; width: number; height: number } {
  const parts = raw.trim().split(/[\s,]+/).map((part) => Number(part));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new SvgParseError(`malformed viewBox "${raw}"`, position.line, position.column);
  }
  const [minX = 0, minY = 0, width = 0, height = 0] = parts;
  if (width <= 0 || height <= 0) {
    throw new SvgParseError(`viewBox has non-positive size "${raw}"`, position.line, position.column);
  }
  return { minX, minY, width, height };
}

function parseRootLength(
  raw: string | undefined,
  name: string,
  warn: (message: string) => void,
): number | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  if (value.endsWith("%")) {
    warn(`root ${name}="${value}" is relative; falling back to the viewBox size`);
    return null;
  }
  const numeric = Number(value.replace(/px$/, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    warn(`unparseable root ${name}="${value}"; falling back to the viewBox size`);
    return null;
  }
  return numeric;
}

function resolveViewport(
  root: XmlElement,
  position: ElementPosition,
  warn: (message: string) => void,
  unsupportedFeature: (entry: string) => void,
): Viewport {
  const viewBoxRaw = root.attrs["viewBox"];
  const viewBox = viewBoxRaw === undefined ? null : parseViewBox(viewBoxRaw, position);
  const widthAttr = parseRootLength(root.attrs["width"], "width", warn);
  const heightAttr = parseRootLength(root.attrs["height"], "height", warn);
  const sceneWidth = widthAttr ?? viewBox?.width ?? 300;
  const sceneHeight = heightAttr ?? viewBox?.height ?? 150;
  if (widthAttr === null && heightAttr === null && viewBox === null) {
    warn("svg has neither width/height nor viewBox; defaulting to 300x150");
  }
  let rootCtm: Mat = IDENTITY;
  if (viewBox) {
    const scaleX = sceneWidth / viewBox.width;
    const scaleY = sceneHeight / viewBox.height;
    rootCtm = [scaleX, 0, 0, scaleY, -viewBox.minX * scaleX, -viewBox.minY * scaleY];
    if (Math.abs(scaleX - scaleY) > 1e-6 * Math.max(scaleX, scaleY)) {
      warn("viewBox aspect ratio differs from width/height; content stretched non-uniformly");
      const par = root.attrs["preserveAspectRatio"];
      if (par !== undefined && par.trim() !== "none") {
        unsupportedFeature("attr:preserveAspectRatio");
      }
    }
  }
  return {
    sceneWidth,
    sceneHeight,
    rootCtm,
    userWidth: viewBox?.width ?? sceneWidth,
    userHeight: viewBox?.height ?? sceneHeight,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseSvgToScene(
  svgText: string,
  options: SvgImportOptions = {},
): SvgImportResult {
  const root = parseXmlDocument(svgText);
  if (root.tag !== "svg") {
    const { line, column } = lineColOf(svgText, root.offset);
    throw new SvgParseError(`root element is <${root.tag}>, expected <svg>`, line, column);
  }

  const warnings = new Set<string>();
  const unsupported = new Set<string>();
  const warn = (message: string): void => {
    warnings.add(message);
  };
  const unsupportedFeature = (entry: string): void => {
    unsupported.add(entry);
  };

  const rootPosition = lineColOf(svgText, root.offset);
  const viewport = resolveViewport(root, rootPosition, warn, unsupportedFeature);

  const ctx: ConvertContext = {
    source: svgText,
    warnings,
    unsupported,
    gradients: new Map(),
    clipPaths: new Map(),
    currentColor: options.currentColor ?? { r: 0, g: 0, b: 0, a: 1 },
    viewport: { width: viewport.userWidth, height: viewport.userHeight },
    idCounter: 0,
    warn,
    unsupportedFeature,
    nextId(el: XmlElement, role: string): string {
      this.idCounter += 1;
      const base = el.attrs["id"] ?? el.tag;
      return `svg:${base}:${role}:${this.idCounter}`;
    },
  };

  collectDefinitions(root, ctx);

  const rootStyles = styleMapOf(root);
  auditUnsupportedAttrs(root, rootStyles, ctx);
  const rootStyle = resolveStyle(root, rootStyles, INITIAL_STYLE, ctx);
  const rootCtm = matMul(
    viewport.rootCtm,
    parseTransformAttr(root.attrs["transform"], rootPosition),
  );
  const nodes = root.children.flatMap((child) =>
    convertElement(child, rootCtm, rootStyle, ctx),
  );

  const scene = sceneIRSchema.parse({
    version: 11,
    width: Math.max(1, Math.round(viewport.sceneWidth)),
    height: Math.max(1, Math.round(viewport.sceneHeight)),
    background: options.background ?? { r: 0, g: 0, b: 0, a: 0 },
    nodes,
  });

  return {
    scene,
    warnings: [...warnings],
    unsupported: [...unsupported].sort(),
  };
}
