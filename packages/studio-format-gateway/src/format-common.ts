/** Shared, browser-portable primitives for external format adapters. */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkBytes = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkBytes));
  }
  return globalThis.btoa(binary);
}

export function fnv1a64Hex(bytes: Uint8Array): string {
  let hash = BigInt("0xcbf29ce484222325");
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * BigInt("0x100000001b3"));
  }
  return hash.toString(16).padStart(16, "0");
}

export function stableTextId(namespace: string, bytes: Uint8Array): string {
  return `${namespace}:${bytes.byteLength.toString(16)}:${fnv1a64Hex(bytes)}`;
}

const MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const MD5_K = Uint32Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0,
);

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** RFC 1321 MD5, used only to authenticate hashes already stored by Krita manifests. */
export function md5Hex(bytes: Uint8Array): string {
  const paddedBytes = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const message = new Uint8Array(paddedBytes);
  message.set(bytes);
  message[bytes.byteLength] = 0x80;
  const view = new DataView(message.buffer);
  const bitLength = BigInt(bytes.byteLength) * BigInt(8);
  view.setUint32(
    paddedBytes - 8,
    Number(bitLength & BigInt("0xffffffff")),
    true,
  );
  view.setUint32(
    paddedBytes - 4,
    Number((bitLength >> BigInt(32)) & BigInt("0xffffffff")),
    true,
  );

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < message.byteLength; offset += 64) {
    const words = new Uint32Array(16);
    for (let index = 0; index < words.length; index += 1) {
      words[index] = view.getUint32(offset + index * 4, true);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let wordIndex: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }
      const nextD = c;
      const nextC = b;
      const sum = (a + f + (MD5_K[index] ?? 0) + (words[wordIndex] ?? 0)) >>> 0;
      const nextB = (b + rotateLeft(sum, MD5_SHIFT[index] ?? 0)) >>> 0;
      a = d;
      b = nextB;
      c = nextC;
      d = nextD;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, a0, true);
  digestView.setUint32(4, b0, true);
  digestView.setUint32(8, c0, true);
  digestView.setUint32(12, d0, true);
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface FormatIssue {
  code: string;
  message: string;
  path?: string;
  scope: "container" | "metadata" | "resource" | "semantic";
}

export interface SafeXmlLimits {
  maxCharacters: number;
  maxDepth: number;
  maxNodes: number;
  maxAttributesPerElement: number;
}

export const SAFE_XML_LIMITS: Readonly<SafeXmlLimits> = Object.freeze({
  maxCharacters: 2_000_000,
  maxDepth: 32,
  maxNodes: 20_000,
  maxAttributesPerElement: 64,
});

export interface SafeXmlElement {
  name: string;
  attrs: Readonly<Record<string, string>>;
  children: readonly SafeXmlElement[];
  text: string;
}

export class SafeXmlError extends Error {
  constructor(
    message: string,
    readonly code:
      | "xml-limit"
      | "xml-malformed"
      | "xml-doctype-forbidden"
      | "xml-entity-invalid",
  ) {
    super(message);
    this.name = "SafeXmlError";
  }
}

const XML_NAME_CHARACTER = /[A-Za-z0-9_.:-]/u;
const XML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
});

function decodeXmlEntities(value: string): string {
  return value.replace(/&([^;]+);/gu, (whole, body: string) => {
    const named = XML_ENTITIES[body];
    if (named !== undefined) return named;
    const hex = body.startsWith("#x") || body.startsWith("#X");
    const decimal = body.startsWith("#") && !hex;
    if (!hex && !decimal) {
      throw new SafeXmlError(`unknown XML entity ${whole}`, "xml-entity-invalid");
    }
    const parsed = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      parsed > 0x10ffff ||
      (parsed >= 0xd800 && parsed <= 0xdfff)
    ) {
      throw new SafeXmlError(`invalid XML character reference ${whole}`, "xml-entity-invalid");
    }
    return String.fromCodePoint(parsed);
  });
}

function isXmlWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\n" || character === "\r";
}

function readXmlName(text: string, offset: number): { name: string; offset: number } {
  let cursor = offset;
  while (cursor < text.length && XML_NAME_CHARACTER.test(text[cursor] ?? "")) cursor += 1;
  if (cursor === offset) {
    throw new SafeXmlError(`expected XML name at ${offset}`, "xml-malformed");
  }
  return { name: text.slice(offset, cursor), offset: cursor };
}

function readAttributes(
  text: string,
  offset: number,
  limits: SafeXmlLimits,
): { attrs: Record<string, string>; offset: number } {
  const attrs: Record<string, string> = {};
  let cursor = offset;
  for (;;) {
    while (isXmlWhitespace(text[cursor])) cursor += 1;
    if (text[cursor] === ">" || text[cursor] === "/") return { attrs, offset: cursor };
    const parsedName = readXmlName(text, cursor);
    cursor = parsedName.offset;
    if (Object.keys(attrs).length >= limits.maxAttributesPerElement) {
      throw new SafeXmlError("XML attribute count exceeds the safety limit", "xml-limit");
    }
    if (attrs[parsedName.name] !== undefined) {
      throw new SafeXmlError(`duplicate XML attribute ${parsedName.name}`, "xml-malformed");
    }
    while (isXmlWhitespace(text[cursor])) cursor += 1;
    if (text[cursor] !== "=") {
      throw new SafeXmlError(`attribute ${parsedName.name} is missing =`, "xml-malformed");
    }
    cursor += 1;
    while (isXmlWhitespace(text[cursor])) cursor += 1;
    const quote = text[cursor];
    if (quote !== '"' && quote !== "'") {
      throw new SafeXmlError(`attribute ${parsedName.name} is not quoted`, "xml-malformed");
    }
    const end = text.indexOf(quote, cursor + 1);
    if (end < 0) {
      throw new SafeXmlError(`attribute ${parsedName.name} is unterminated`, "xml-malformed");
    }
    attrs[parsedName.name] = decodeXmlEntities(text.slice(cursor + 1, end));
    cursor = end + 1;
  }
}

/** Small XML parser: no DTD/entities/network, bounded depth/nodes/text. */
export function parseSafeXml(
  text: string,
  partialLimits: Partial<SafeXmlLimits> = {},
): SafeXmlElement {
  const limits = { ...SAFE_XML_LIMITS, ...partialLimits };
  if (
    !Number.isSafeInteger(limits.maxCharacters) ||
    !Number.isSafeInteger(limits.maxDepth) ||
    !Number.isSafeInteger(limits.maxNodes) ||
    !Number.isSafeInteger(limits.maxAttributesPerElement) ||
    limits.maxCharacters < 1 ||
    limits.maxDepth < 1 ||
    limits.maxNodes < 1 ||
    limits.maxAttributesPerElement < 1
  ) {
    throw new SafeXmlError("invalid XML safety limits", "xml-limit");
  }
  if (text.length > limits.maxCharacters) {
    throw new SafeXmlError("XML text exceeds the safety limit", "xml-limit");
  }
  if (/<!DOCTYPE|<!ENTITY/iu.test(text)) {
    throw new SafeXmlError("DOCTYPE and custom entities are forbidden", "xml-doctype-forbidden");
  }

  const mutableStack: Array<{
    name: string;
    attrs: Record<string, string>;
    children: SafeXmlElement[];
    text: string;
  }> = [];
  let root: SafeXmlElement | null = null;
  let cursor = 0;
  let nodes = 0;

  const appendText = (raw: string): void => {
    const current = mutableStack[mutableStack.length - 1];
    if (raw.length === 0) return;
    if (current !== undefined) {
      current.text += decodeXmlEntities(raw);
      return;
    }
    if (raw.trim().length > 0) {
      throw new SafeXmlError("XML has text outside its root element", "xml-malformed");
    }
  };
  const closeCurrent = (name: string): void => {
    const current = mutableStack.pop();
    if (current === undefined || current.name !== name) {
      throw new SafeXmlError(`closing tag ${name} does not match`, "xml-malformed");
    }
    const closed: SafeXmlElement = current;
    const parent = mutableStack[mutableStack.length - 1];
    if (parent !== undefined) parent.children.push(closed);
    else if (root === null) root = closed;
    else throw new SafeXmlError("XML has multiple root elements", "xml-malformed");
  };

  while (cursor < text.length) {
    const start = text.indexOf("<", cursor);
    if (start < 0) {
      appendText(text.slice(cursor));
      break;
    }
    appendText(text.slice(cursor, start));
    if (text.startsWith("<!--", start)) {
      const end = text.indexOf("-->", start + 4);
      if (end < 0) throw new SafeXmlError("unterminated XML comment", "xml-malformed");
      cursor = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", start)) {
      const end = text.indexOf("]]>", start + 9);
      if (end < 0) throw new SafeXmlError("unterminated CDATA", "xml-malformed");
      const current = mutableStack[mutableStack.length - 1];
      if (current === undefined) {
        throw new SafeXmlError("XML has CDATA outside its root element", "xml-malformed");
      }
      current.text += text.slice(start + 9, end);
      cursor = end + 3;
      continue;
    }
    if (text.startsWith("<?", start)) {
      const end = text.indexOf("?>", start + 2);
      if (end < 0) throw new SafeXmlError("unterminated processing instruction", "xml-malformed");
      cursor = end + 2;
      continue;
    }
    if (text.startsWith("</", start)) {
      const parsedName = readXmlName(text, start + 2);
      let end = parsedName.offset;
      while (isXmlWhitespace(text[end])) end += 1;
      if (text[end] !== ">") throw new SafeXmlError("malformed closing tag", "xml-malformed");
      closeCurrent(parsedName.name);
      cursor = end + 1;
      continue;
    }
    if (text[start + 1] === "!") {
      throw new SafeXmlError("unsupported XML declaration", "xml-doctype-forbidden");
    }
    const parsedName = readXmlName(text, start + 1);
    const parsedAttrs = readAttributes(text, parsedName.offset, limits);
    let end = parsedAttrs.offset;
    const selfClosing = text[end] === "/";
    if (selfClosing) end += 1;
    if (text[end] !== ">") throw new SafeXmlError("malformed opening tag", "xml-malformed");
    nodes += 1;
    if (nodes > limits.maxNodes) throw new SafeXmlError("XML node limit exceeded", "xml-limit");
    const node = {
      name: parsedName.name,
      attrs: parsedAttrs.attrs,
      children: [] as SafeXmlElement[],
      text: "",
    };
    if (selfClosing) {
      const parent = mutableStack[mutableStack.length - 1];
      if (parent !== undefined) parent.children.push(node);
      else if (root === null) root = node;
      else throw new SafeXmlError("XML has multiple root elements", "xml-malformed");
    } else {
      mutableStack.push(node);
      if (mutableStack.length > limits.maxDepth) {
        throw new SafeXmlError("XML depth limit exceeded", "xml-limit");
      }
    }
    cursor = end + 1;
  }
  if (mutableStack.length > 0) {
    throw new SafeXmlError(`unclosed XML element ${mutableStack.at(-1)?.name ?? "unknown"}`, "xml-malformed");
  }
  if (root === null) throw new SafeXmlError("XML has no root element", "xml-malformed");
  return root;
}

export function xmlLocalName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}
