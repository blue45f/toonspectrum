import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const target = resolve(root, "lib/creator-marketplace-package-builder.ts");
let source = readFileSync(target, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor.`);
  source = source.replace(before, after);
}

replaceOnce(
  "for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);",
  "for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);",
  "CRC table access",
);

replaceOnce(
  `  const digest = await crypto.subtle.digest(\n    "SHA-256",\n    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),\n  );`,
  `  const digestInput = Uint8Array.from(bytes);\n  const digest = await crypto.subtle.digest("SHA-256", digestInput);`,
  "SubtleCrypto digest input",
);

replaceOnce(
  `  const inventory: CreatorMarketplacePackageInventoryEntry[] = [];\n  for (const entry of entries) {\n    inventory.push({\n      path: entry.path,\n      role: entry.role,\n      bytes: entry.bytes.byteLength,\n      sha256: await sha256(entry.bytes),\n      mediaType: entry.mediaType,\n    });\n  }\n  const manifestWithInventory = {\n    ...manifest,\n    package: {\n      format: "toonspectrum-marketplace-package",\n      version: 1,\n      archive: "zip-store",\n      inventory,\n    },\n  } as const;\n  const manifestBytes = encode(JSON.stringify(manifestWithInventory, null, 2));\n  inventory.unshift({\n    path: "manifest.json",\n    role: "manifest",\n    bytes: manifestBytes.byteLength,\n    sha256: await sha256(manifestBytes),\n    mediaType: "application/json",\n  });`,
  `  const packagedEntriesInventory: CreatorMarketplacePackageInventoryEntry[] = [];\n  for (const entry of entries) {\n    packagedEntriesInventory.push({\n      path: entry.path,\n      role: entry.role,\n      bytes: entry.bytes.byteLength,\n      sha256: await sha256(entry.bytes),\n      mediaType: entry.mediaType,\n    });\n  }\n  // A manifest cannot contain a stable hash of itself. Its embedded inventory therefore covers\n  // the authoring draft and source files, while the returned upload receipt additionally carries\n  // the manifest hash for transport verification.\n  const manifestWithInventory = {\n    ...manifest,\n    package: {\n      format: "toonspectrum-marketplace-package",\n      version: 1,\n      archive: "zip-store",\n      inventory: packagedEntriesInventory,\n    },\n  } as const;\n  const manifestBytes = encode(JSON.stringify(manifestWithInventory, null, 2));\n  const inventory: CreatorMarketplacePackageInventoryEntry[] = [\n    {\n      path: "manifest.json",\n      role: "manifest",\n      bytes: manifestBytes.byteLength,\n      sha256: await sha256(manifestBytes),\n      mediaType: "application/json",\n    },\n    ...packagedEntriesInventory,\n  ];`,
  "non-recursive manifest inventory",
);

writeFileSync(target, source);
writeFileSync(
  resolve(root, "marketplace-package-builder-normalization-report.json"),
  `${JSON.stringify({ target: "lib/creator-marketplace-package-builder.ts", status: "normalized" }, null, 2)}\n`,
);
