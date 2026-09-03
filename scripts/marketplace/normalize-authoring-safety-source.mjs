import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function patch(relativePath, transforms) {
  const path = resolve(root, relativePath);
  let source = readFileSync(path, "utf8");
  for (const [before, after, label] of transforms) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) throw new Error(`Missing ${label} anchor in ${relativePath}.`);
    source = source.replace(before, after);
  }
  writeFileSync(path, source);
}

patch("lib/creator-marketplace-authoring-safety.ts", [
  [
    `  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).byteLength;\n  return unescape(encodeURIComponent(value)).length;`,
    `  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).byteLength;\n  // Conservative fallback for legacy hosts without TextEncoder. Overestimation is safer than\n  // accepting an oversized authoring payload.\n  return value.length * 3;`,
    "utf8 fallback",
  ],
]);

patch("lib/creator-marketplace-authoring-safety.test.ts", [
  [
    `import {\n  CreatorMarketplacePortableValueError,\n  measureCreatorMarketplacePortableValueBytes,\n  sanitizeCreatorMarketplacePortableValue,\n} from "./creator-marketplace-authoring-safety";`,
    `import {\n  CreatorMarketplacePortableValueError,\n  measureCreatorMarketplacePortableValueBytes,\n  sanitizeCreatorMarketplacePortableValue,\n} from "./creator-marketplace-authoring-safety";\n\nfunction capturePortableError(action: () => unknown): CreatorMarketplacePortableValueError {\n  try {\n    action();\n  } catch (error) {\n    expect(error).toBeInstanceOf(CreatorMarketplacePortableValueError);\n    return error as CreatorMarketplacePortableValueError;\n  }\n  throw new Error("Expected CreatorMarketplacePortableValueError");\n}`,
    "error capture helper",
  ],
  [
    `    expect(() => sanitizeCreatorMarketplacePortableValue(source)).toThrow(\n      CreatorMarketplacePortableValueError,\n    );\n    try {\n      sanitizeCreatorMarketplacePortableValue(source);\n    } catch (error) {\n      expect(error).toMatchObject({ code: "cycle", path: "$.self" });\n    }`,
    `    expect(capturePortableError(\n      () => sanitizeCreatorMarketplacePortableValue(source),\n    )).toMatchObject({ code: "cycle", path: "$.self" });`,
    "cycle assertion",
  ],
  [
    `    expect(() => sanitizeCreatorMarketplacePortableValue({ spacing: Number.NaN })).toThrow(\n      expect.objectContaining({ code: "unsupported-number" }),\n    );`,
    `    expect(capturePortableError(\n      () => sanitizeCreatorMarketplacePortableValue({ spacing: Number.NaN }),\n    ).code).toBe("unsupported-number");`,
    "number assertion",
  ],
  [
    `    expect(() => sanitizeCreatorMarketplacePortableValue(\n      { textureData: "x".repeat(2_000) },\n      { maxDepth: 8, maxEntries: 100, maxStringLength: 4_000, maxSerializedBytes: 200 },\n    )).toThrow(expect.objectContaining({ code: "serialized-size" }));`,
    `    expect(capturePortableError(\n      () => sanitizeCreatorMarketplacePortableValue(\n        { textureData: "x".repeat(2_000) },\n        { maxDepth: 8, maxEntries: 100, maxStringLength: 4_000, maxSerializedBytes: 200 },\n      ),\n    ).code).toBe("serialized-size");`,
    "size assertion",
  ],
]);
