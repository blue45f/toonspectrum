import { Buffer } from "node:buffer";

import { XMLParser, XMLValidator } from "fast-xml-parser";

export const LIBRARY_HOLDINGS_XML_BYTE_LIMIT = 2 * 1024 * 1024;
const LIBRARY_HOLDINGS_RESULT_LIMIT = 100;
const LIBRARY_HOLDINGS_XML_DEPTH_LIMIT = 16;

const libraryXmlParser = new XMLParser({
  ignoreAttributes: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  maxNestedTags: LIBRARY_HOLDINGS_XML_DEPTH_LIMIT,
  parseTagValue: false,
  processEntities: false,
  trimValues: true,
});

export interface LibraryHolding {
  readonly libraryCode: string;
  readonly name: string;
  readonly address: string;
  readonly telephone: string;
  readonly homepage: string;
  readonly latitude: string;
  readonly longitude: string;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function valuesOf(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function boundedPlainText(value: unknown, maximum: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).replace(/\s+/gu, " ").trim();
  if (text.includes("<") || text.includes(">")) return "";
  return text.slice(0, maximum);
}

function boundedCoordinate(value: unknown, minimum: number, maximum: number): string {
  const text = boundedPlainText(value, 32);
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? text
    : "";
}

function safeHomepage(value: unknown): string {
  const candidate = boundedPlainText(value, 2_048);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if ((url.protocol !== "https:" && url.protocol !== "http:")
      || !url.hostname
      || url.username
      || url.password) {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function collectLibraryNodes(
  value: unknown,
  depth: number,
  output: Record<string, unknown>[],
): void {
  if (depth > LIBRARY_HOLDINGS_XML_DEPTH_LIMIT
    || output.length >= LIBRARY_HOLDINGS_RESULT_LIMIT) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectLibraryNodes(entry, depth + 1, output);
    return;
  }
  const record = recordOf(value);
  if (!record) return;
  for (const candidate of valuesOf(record.lib)) {
    const library = recordOf(candidate);
    if (library) output.push(library);
    if (output.length >= LIBRARY_HOLDINGS_RESULT_LIMIT) return;
  }
  for (const [key, child] of Object.entries(record)) {
    if (key !== "lib") collectLibraryNodes(child, depth + 1, output);
    if (output.length >= LIBRARY_HOLDINGS_RESULT_LIMIT) return;
  }
}

function holdingOf(node: Record<string, unknown>): LibraryHolding | null {
  const libraryCode = boundedPlainText(node.libCode, 64);
  const name = boundedPlainText(node.libName, 240);
  if (!libraryCode || !name) return null;
  return {
    libraryCode,
    name,
    address: boundedPlainText(node.address, 500),
    telephone: boundedPlainText(node.tel, 80),
    homepage: safeHomepage(node.homepage),
    latitude: boundedCoordinate(node.latitude, -90, 90),
    longitude: boundedCoordinate(node.longitude, -180, 180),
  };
}

export function parseLibraryHoldingsXml(xml: string): readonly LibraryHolding[] {
  if (Buffer.byteLength(xml, "utf8") > LIBRARY_HOLDINGS_XML_BYTE_LIMIT) {
    throw new RangeError("library holdings XML exceeds the byte limit");
  }
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new Error("library holdings XML declarations are not allowed");
  }
  const validation = XMLValidator.validate(xml, {
    allowBooleanAttributes: false,
  });
  if (validation !== true) {
    throw new Error("library holdings XML is malformed");
  }
  const nodes: Record<string, unknown>[] = [];
  collectLibraryNodes(libraryXmlParser.parse(xml) as unknown, 0, nodes);
  return nodes
    .map(holdingOf)
    .filter((item): item is LibraryHolding => item !== null)
    .slice(0, LIBRARY_HOLDINGS_RESULT_LIMIT);
}
