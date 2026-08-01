#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import {
  HOKUSAI_PACKAGE_DIRECTORY,
  validateHokusaiReleaseContract,
} from "./studio-hokusai-wasm-release-contract.mjs";
import {
  verifyCheckedInHokusaiArtifacts,
} from "./verify-studio-hokusai-wasm.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const PACKAGE_JSON_PATH = join(REPOSITORY_ROOT, "package.json");
const LOCKFILE_PATH = join(REPOSITORY_ROOT, "pnpm-lock.yaml");
const REPOSITORY_NOTICE_PATH = join(
  REPOSITORY_ROOT,
  "THIRD_PARTY_NOTICES.md",
);

const REVIEWED_LICENSE_EXPRESSIONS = new Set([
  "0BSD",
  "(MIT AND Zlib)",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "LGPL-2.1",
  "LGPL-2.1-only",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT OR Apache-2.0",
  "MPL-2.0",
  "Public Domain",
  "SGI-B-2.0",
  "Unlicense",
]);

const REVIEWED_LICENSE_FILE_DIGESTS = new Map([
  [
    "422fa324bf754acb2f48918039858f39bc31cc1a710b492906889f9363d6b09e",
    "MIT",
  ],
]);

const HYBRID_PROVIDER_DEPENDENCIES = Object.freeze({
  "@gltf-transform/core": "4.4.2",
  "@gltf-transform/extensions": "4.4.2",
  "@gltf-transform/functions": "4.4.2",
  "@resvg/resvg-wasm": "2.6.2",
  "@techstark/opencv-js": "5.0.0-release.1",
  harfbuzzjs: "1.4.0",
  "manifold-3d": "3.5.1",
  "onnxruntime-web": "1.27.0",
  "p5.brush": "2.2.1",
  paper: "0.12.18",
  "perfect-freehand": "1.2.3",
  rbush: "4.0.1",
  "three-mesh-bvh": "0.9.13",
  xatlasjs: "0.2.0",
});

const ONNX_RUNTIME_MIT_NOTICE = `MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const HOKUSAI_MIT_NOTICE = `MIT License

Copyright (c) 2026 Re:Earth and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const WASM_BINDGEN_MIT_NOTICE = `Copyright (c) 2014 Alex Crichton

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeAuthor(author) {
  if (typeof author === "object" && author !== null) {
    return typeof author.name === "string" ? author.name.trim() : "";
  }
  if (typeof author !== "string") return "";
  return author.split(/[<(]/u, 1)[0].trim();
}

function normalizeHomepage(packageJson) {
  if (typeof packageJson.homepage === "string") {
    return packageJson.homepage.trim();
  }
  const repository =
    typeof packageJson.repository === "string"
      ? packageJson.repository
      : packageJson.repository?.url;
  if (typeof repository !== "string") return "";
  return repository
    .replace(/^git\+/u, "")
    .replace(/^git:\/\//u, "https://")
    .replace(/\.git$/u, "");
}

function normalizeLicenseExpression(license) {
  if (typeof license === "string") return license.trim();
  if (Array.isArray(license)) {
    return [
      ...new Set(
        license
          .map((entry) => normalizeLicenseExpression(entry))
          .filter(Boolean),
      ),
    ].join(" OR ");
  }
  if (
    typeof license === "object"
    && license !== null
    && (
      typeof license.type === "string"
      || typeof license.name === "string"
    )
  ) {
    return String(license.type ?? license.name).trim();
  }
  return "";
}

function inferLicenseExpressionFromFiles(packagePath) {
  for (const path of findRootLicenseFiles(packagePath)) {
    const normalized = readFileSync(path, "utf8")
      .replaceAll("\r\n", "\n")
      .trim();
    const reviewedExpression = REVIEWED_LICENSE_FILE_DIGESTS.get(
      sha256(normalized),
    );
    if (reviewedExpression) return reviewedExpression;
  }
  return "";
}

function resolveInstalledPackagePath(packageName, fromDirectory) {
  let currentDirectory = resolve(fromDirectory);
  while (true) {
    const candidate = join(
      currentDirectory,
      "node_modules",
      ...packageName.split("/"),
    );
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
    if (currentDirectory === REPOSITORY_ROOT) break;
    const parentDirectory = dirname(currentDirectory);
    const repositoryRelativeParent = relative(
      REPOSITORY_ROOT,
      parentDirectory,
    );
    if (
      parentDirectory === currentDirectory
      || repositoryRelativeParent === ".."
      || repositoryRelativeParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    ) {
      break;
    }
    currentDirectory = parentDirectory;
  }
  return null;
}

function readWorkspaceImporterDirectories() {
  const lockfile = parseYaml(readFileSync(LOCKFILE_PATH, "utf8"));
  if (
    typeof lockfile !== "object"
    || lockfile === null
    || typeof lockfile.importers !== "object"
    || lockfile.importers === null
  ) {
    throw new Error("pnpm-lock.yaml is missing its workspace importer graph.");
  }
  return Object.keys(lockfile.importers)
    .sort()
    .map((importer) => {
      const directory = resolve(REPOSITORY_ROOT, importer);
      const relativeDirectory = relative(REPOSITORY_ROOT, directory);
      if (
        relativeDirectory === ".."
        || relativeDirectory.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      ) {
        throw new Error(`Workspace importer escapes the repository: ${importer}`);
      }
      if (!existsSync(join(directory, "package.json"))) {
        throw new Error(`Workspace importer has no package.json: ${importer}`);
      }
      return directory;
    });
}

export function readFilesystemLicenseInventory() {
  const pendingPackagePaths = [];
  for (const importerDirectory of readWorkspaceImporterDirectories()) {
    const importerPackageJson = readJson(
      join(importerDirectory, "package.json"),
    );
    const directDependencies = {
      ...(importerPackageJson.dependencies ?? {}),
      ...(importerPackageJson.optionalDependencies ?? {}),
    };
    for (const packageName of Object.keys(directDependencies).sort()) {
      const packagePath = resolveInstalledPackagePath(
        packageName,
        importerDirectory,
      );
      if (!packagePath) {
        if (packageName in (importerPackageJson.optionalDependencies ?? {})) {
          continue;
        }
        throw new Error(
          `Required production dependency is not installed: ${packageName}`,
        );
      }
      pendingPackagePaths.push(packagePath);
    }
  }

  const visitedPackagePaths = new Set();
  const groupedPackages = new Map();
  while (pendingPackagePaths.length > 0) {
    const packagePath = realpathSync(pendingPackagePaths.shift());
    if (visitedPackagePaths.has(packagePath)) continue;
    visitedPackagePaths.add(packagePath);

    const packageJson = readJson(join(packagePath, "package.json"));
    if (
      typeof packageJson.name !== "string"
      || packageJson.name.length === 0
      || typeof packageJson.version !== "string"
      || packageJson.version.length === 0
    ) {
      throw new Error(`Installed package metadata is malformed: ${packagePath}`);
    }

    if (!packageJson.private) {
      const license =
        normalizeLicenseExpression(
          packageJson.license ?? packageJson.licenses,
        )
        || inferLicenseExpressionFromFiles(packagePath);
      if (!REVIEWED_LICENSE_EXPRESSIONS.has(license)) {
        throw new Error(
          `Unreviewed production license expression: ${license || "(missing)"} (${packageJson.name}@${packageJson.version})`,
        );
      }
      const key = `${packageJson.name}\u0000${license}`;
      const existing = groupedPackages.get(key) ?? {
        name: packageJson.name,
        versions: new Set(),
        paths: new Set(),
        license,
        authors: new Set(),
        homepages: new Set(),
      };
      existing.versions.add(packageJson.version);
      existing.paths.add(packagePath);
      const author = normalizeAuthor(packageJson.author);
      const homepage = normalizeHomepage(packageJson);
      if (author) existing.authors.add(author);
      if (homepage) existing.homepages.add(homepage);
      groupedPackages.set(key, existing);
    }

    const optionalDependencies = packageJson.optionalDependencies ?? {};
    const requiredDependencies = packageJson.dependencies ?? {};
    for (const packageName of Object.keys(requiredDependencies).sort()) {
      const dependencyPath = resolveInstalledPackagePath(packageName, packagePath);
      if (!dependencyPath) {
        if (packageName in optionalDependencies) continue;
        throw new Error(
          `Required production dependency is not installed: ${packageJson.name}@${packageJson.version} -> ${packageName}`,
        );
      }
      pendingPackagePaths.push(dependencyPath);
    }
    for (const packageName of Object.keys(optionalDependencies).sort()) {
      const dependencyPath = resolveInstalledPackagePath(packageName, packagePath);
      if (dependencyPath) pendingPackagePaths.push(dependencyPath);
    }
    for (const packageName of Object.keys(packageJson.peerDependencies ?? {}).sort()) {
      const dependencyPath = resolveInstalledPackagePath(packageName, packagePath);
      if (dependencyPath) pendingPackagePaths.push(dependencyPath);
    }
  }

  if (groupedPackages.size === 0) {
    throw new Error("Installed production dependency graph is empty.");
  }

  return [...groupedPackages.values()]
    .map((entry) => ({
      name: entry.name,
      versions: [...entry.versions].sort(),
      paths: [...entry.paths].sort(),
      license: entry.license,
      author: [...entry.authors].sort()[0] ?? "",
      homepage: [...entry.homepages].sort()[0] ?? "",
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name)
        || left.versions.join(",").localeCompare(right.versions.join(",")),
    );
}

function findRootLicenseFiles(packagePath) {
  let names;
  try {
    names = readdirSync(packagePath);
  } catch {
    return [];
  }
  return names
    .filter((name) => /^(?:licen[sc]e|copying|notice)(?:\.|$)/iu.test(name))
    .map((name) => join(packagePath, name))
    .filter((path) => {
      try {
        return statSync(path).isFile() && statSync(path).size <= 2_000_000;
      } catch {
        return false;
      }
    })
    .sort();
}

function collectMplFallback() {
  const storePath = join(REPOSITORY_ROOT, "node_modules", ".pnpm");
  if (!existsSync(storePath)) return null;
  const candidates = readdirSync(storePath)
    .filter((name) => name.startsWith("lightningcss@"))
    .sort();
  for (const candidate of candidates) {
    const path = join(
      storePath,
      candidate,
      "node_modules",
      "lightningcss",
      "LICENSE",
    );
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8").trim();
    if (text.includes("Mozilla Public License Version 2.0")) {
      return {
        label: "MPL-2.0 full text (from the installed lightningcss package)",
        path,
        text,
      };
    }
  }
  return null;
}

export function parsePnpmLicenseInventory(raw) {
  const grouped = JSON.parse(raw);
  const entries = [];
  for (const [licenseExpression, packages] of Object.entries(grouped)) {
    if (!REVIEWED_LICENSE_EXPRESSIONS.has(licenseExpression)) {
      throw new Error(
        `Unreviewed production license expression: ${licenseExpression}`,
      );
    }
    for (const packageRecord of packages) {
      const versions = Array.isArray(packageRecord.versions)
        ? [...packageRecord.versions].map(String).sort()
        : [];
      const paths = Array.isArray(packageRecord.paths)
        ? [...packageRecord.paths].map(String).sort()
        : [];
      if (
        typeof packageRecord.name !== "string"
        || packageRecord.name.length === 0
        || versions.length === 0
        || paths.length === 0
      ) {
        throw new Error(
          `Malformed pnpm license inventory entry for ${String(packageRecord.name)}`,
        );
      }
      entries.push({
        name: packageRecord.name,
        versions,
        paths,
        license: licenseExpression,
        author:
          typeof packageRecord.author === "string" ? packageRecord.author : "",
        homepage:
          typeof packageRecord.homepage === "string"
            ? packageRecord.homepage
            : "",
      });
    }
  }
  return entries.sort(
    (left, right) =>
      left.name.localeCompare(right.name)
      || left.versions.join(",").localeCompare(right.versions.join(",")),
  );
}

export function isRecoverablePnpmLicenseInventoryError(error) {
  const stderr =
    typeof error?.stderr === "string"
      ? error.stderr
      : Buffer.isBuffer(error?.stderr)
        ? error.stderr.toString("utf8")
        : "";
  const stdout =
    typeof error?.stdout === "string"
      ? error.stdout
      : Buffer.isBuffer(error?.stdout)
        ? error.stdout.toString("utf8")
        : "";
  return `${String(error?.message ?? "")}\n${stderr}\n${stdout}`.includes(
    "ERR_PNPM_MISSING_PACKAGE_INDEX_FILE",
  );
}

export function readResolvedLicenseInventory({
  source = "pnpm",
  runPnpmLicenseList = () =>
    execFileSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["licenses", "list", "--prod", "--json"],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
} = {}) {
  if (source === "filesystem") {
    return readFilesystemLicenseInventory();
  }
  if (source !== "pnpm") {
    throw new Error(`Unsupported license inventory source: ${source}`);
  }
  try {
    const raw = runPnpmLicenseList();
    return parsePnpmLicenseInventory(raw);
  } catch (error) {
    if (!isRecoverablePnpmLicenseInventoryError(error)) {
      if (error?.stderr) process.stderr.write(error.stderr);
      throw error;
    }
    process.stderr.write(
      "pnpm's cached package index is incomplete; verifying the installed production dependency graph directly.\n",
    );
    return readFilesystemLicenseInventory();
  }
}

function validateDirectDependencies(packageJson, inventory) {
  const productionDependencies = packageJson.dependencies ?? {};
  for (const [name, version] of Object.entries(HYBRID_PROVIDER_DEPENDENCIES)) {
    if (productionDependencies[name] !== version) {
      throw new Error(
        `${name} must remain pinned to ${version}; found ${String(productionDependencies[name])}.`,
      );
    }
    const resolved = inventory.find(
      (entry) => entry.name === name && entry.versions.includes(version),
    );
    if (!resolved) {
      throw new Error(`${name}@${version} is absent from the resolved graph.`);
    }
  }
}

function collectLicenseDocuments(inventory) {
  const documents = new Map();
  const missing = [];

  function addDocument(label, sourcePath, text) {
    const normalized = text.replaceAll("\r\n", "\n").trim();
    if (!normalized) return;
    const digest = sha256(normalized);
    const existing = documents.get(digest);
    if (existing) {
      existing.labels.add(label);
      existing.sources.add(sourcePath);
      return;
    }
    documents.set(digest, {
      labels: new Set([label]),
      sources: new Set([sourcePath]),
      text: normalized,
    });
  }

  for (const entry of inventory) {
    const files = [...new Set(entry.paths.flatMap(findRootLicenseFiles))];
    if (files.length === 0) {
      missing.push(entry);
      continue;
    }
    for (const file of files) {
      addDocument(
        `${entry.name}@${entry.versions.join(", ")} — ${entry.license}`,
        relative(REPOSITORY_ROOT, file),
        readFileSync(file, "utf8"),
      );
    }
  }

  addDocument(
    "onnxruntime-web / onnxruntime-common 1.27.0 — MIT",
    "https://github.com/microsoft/onnxruntime/blob/v1.27.0/LICENSE",
    ONNX_RUNTIME_MIT_NOTICE,
  );
  addDocument(
    "Hokusai brush/core/tile-mem 0.3.0 — MIT option",
    "https://github.com/reearth/hokusai/blob/f7e998173c0e7427b95afe0b6947e3103da60f00/LICENSE-MIT",
    HOKUSAI_MIT_NOTICE,
  );
  addDocument(
    "wasm-bindgen 0.2.123 family — MIT option",
    "https://github.com/wasm-bindgen/wasm-bindgen/blob/0.2.123/LICENSE-MIT",
    WASM_BINDGEN_MIT_NOTICE,
  );
  addDocument(
    "Hokusai brush/core/tile-mem 0.3.0 — Apache-2.0 option",
    "https://github.com/reearth/hokusai/blob/f7e998173c0e7427b95afe0b6947e3103da60f00/LICENSE-APACHE",
    readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "LICENSE-APACHE"),
      "utf8",
    ),
  );
  addDocument(
    "wasm-bindgen 0.2.123 family — Apache-2.0 option",
    "https://github.com/wasm-bindgen/wasm-bindgen/blob/0.2.123/LICENSE-APACHE",
    readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "LICENSE-APACHE"),
      "utf8",
    ),
  );
  addDocument(
    "unicode-ident 1.0.24 data tables — Unicode-3.0",
    "https://github.com/dtolnay/unicode-ident/blob/1.0.24/LICENSE-UNICODE",
    readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "LICENSE-UNICODE"),
      "utf8",
    ),
  );

  const mplFallback = collectMplFallback();
  if (!mplFallback) {
    throw new Error(
      "A complete MPL-2.0 text is required to package @resvg/resvg-wasm.",
    );
  }
  addDocument(
    mplFallback.label,
    relative(REPOSITORY_ROOT, mplFallback.path),
    mplFallback.text,
  );

  const xatlasCompanion = join(
    REPOSITORY_ROOT,
    "node_modules",
    "xatlasjs",
    "dist",
    "xatlas.js.LICENSE.txt",
  );
  if (!existsSync(xatlasCompanion)) {
    throw new Error("xatlasjs Comlink companion attribution is missing.");
  }
  const xatlasCompanionText = readFileSync(xatlasCompanion, "utf8").trim();
  if (
    !xatlasCompanionText.includes("Copyright 2019 Google LLC")
    || !xatlasCompanionText.includes("Apache-2.0")
  ) {
    throw new Error("xatlasjs Comlink attribution has changed and needs review.");
  }
  addDocument(
    "Comlink runtime embedded by xatlasjs 0.2.0 — Apache-2.0",
    relative(REPOSITORY_ROOT, xatlasCompanion),
    xatlasCompanionText,
  );

  return {
    documents: [...documents.entries()]
      .map(([digest, document]) => ({ digest, ...document }))
      .sort((left, right) => left.digest.localeCompare(right.digest)),
    missing: missing.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function validateRepositoryPolicy() {
  const notice = readFileSync(REPOSITORY_NOTICE_PATH, "utf8");
  const requiredFragments = [
    "https://github.com/yisibl/resvg-js/tree/v2.6.2",
    "https://github.com/microsoft/onnxruntime/tree/v1.27.0",
    "https://github.com/dulnan/lazy-brush",
    "https://github.com/steveruizok/perfect-freehand",
    "https://github.com/acamposuribe/p5.brush",
    "https://github.com/processing/p5.js",
    "https://github.com/brendankenny/libtess.js",
    "https://github.com/reearth/hokusai/tree/f7e998173c0e7427b95afe0b6947e3103da60f00",
    "https://github.com/wasm-bindgen/wasm-bindgen/tree/0.2.123",
    "`hokusai-brush`, `hokusai-core`, and `hokusai-tile-mem`",
    "`wasm-bindgen` family",
    "`unicode-ident` data tables",
    "pnpm run verify:studio-hokusai-wasm",
    "does not statically import the resolved `p5` peer",
    "Comlink runtime embedded by `xatlasjs`",
    "pnpm run audit:licenses",
    "dist/legal/THIRD_PARTY_NOTICES.generated.md",
  ];
  for (const fragment of requiredFragments) {
    if (!notice.includes(fragment)) {
      throw new Error(`Repository notice is missing required text: ${fragment}`);
    }
  }
}

function validateBrowserDistribution() {
  const distPath = join(REPOSITORY_ROOT, "dist");
  if (!existsSync(distPath)) return;

  const pending = [distPath];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        pending.push(path);
        continue;
      }
      const relativePath = relative(distPath, path);
      if (relativePath.startsWith(`legal${process.platform === "win32" ? "\\" : "/"}`)) {
        continue;
      }
      if (/sharp-libvips|libvips-cpp/iu.test(relativePath)) {
        throw new Error(
          `Native sharp/libvips runtime leaked into the Vite distribution: ${relativePath}`,
        );
      }
      if (
        /\.(?:css|html|js|json|map|md|txt)$/iu.test(name)
        && stat.size <= 16 * 1024 * 1024
      ) {
        const text = readFileSync(path, "utf8");
        if (/@img\/sharp-libvips|libvips-cpp/iu.test(text)) {
          throw new Error(
            `Native sharp/libvips marker leaked into the Vite distribution: ${relativePath}`,
          );
        }
      }
    }
  }
}

function renderNotice(
  packageJson,
  inventory,
  rustInventory,
  documents,
  missing,
) {
  const lockfileHash = sha256(readFileSync(LOCKFILE_PATH));
  const rows = inventory
    .map(
      (entry) =>
        `| \`${escapeTableCell(entry.name)}\` | ${escapeTableCell(entry.versions.join(", "))} | ${escapeTableCell(entry.license)} | ${escapeTableCell(entry.author || "not supplied")} | ${entry.homepage ? `<${escapeTableCell(entry.homepage)}>` : "not supplied"} |`,
    )
    .join("\n");

  const missingRows = missing
    .map(
      (entry) =>
        `| \`${escapeTableCell(entry.name)}\` | ${escapeTableCell(entry.versions.join(", "))} | ${escapeTableCell(entry.license)} | ${entry.homepage ? `<${escapeTableCell(entry.homepage)}>` : "not supplied"} |`,
    )
    .join("\n");

  const rustRows = rustInventory
    .map(
      (entry) =>
        `| \`${escapeTableCell(entry.name)}\` | ${escapeTableCell(entry.version)} | ${escapeTableCell(entry.license)} | \`${escapeTableCell(entry.checksum)}\` | <${escapeTableCell(entry.homepage)}> |`,
    )
    .join("\n");

  const licenseTexts = documents
    .map((document, index) => {
      const labels = [...document.labels].sort().join("; ");
      const sources = [...document.sources].sort().join("; ");
      return `## License text ${index + 1}: ${labels}

- SHA-256: \`${document.digest}\`
- Collected from: ${sources}

\`\`\`text
${document.text}
\`\`\``;
    })
    .join("\n\n");

  return `# ToonSpectrum generated third-party notices

This artifact was generated from the resolved pnpm production graph. It is
deliberately broader than the browser bundle so transitive runtime obligations
remain visible. Package archives without a root license file are called out
explicitly; reviewed canonical/source notices are included below.

- Application: \`${packageJson.name}@${packageJson.version}\`
- Lockfile SHA-256: \`${lockfileHash}\`
- Production inventory entries: ${inventory.length}
- Pinned Hokusai Rust/WASM dependency entries: ${rustInventory.length}
- Distinct collected license texts: ${documents.length}
- Packages without a root license file: ${missing.length}
- Exact MPL-2.0 source for unmodified resvg 2.6.2:
  <https://github.com/yisibl/resvg-js/tree/v2.6.2>
- Exact ONNX Runtime 1.27.0 source:
  <https://github.com/microsoft/onnxruntime/tree/v1.27.0>
- Exact Hokusai 0.3.0 source commit:
  <https://github.com/reearth/hokusai/tree/f7e998173c0e7427b95afe0b6947e3103da60f00>
- Exact wasm-bindgen 0.2.123 source:
  <https://github.com/wasm-bindgen/wasm-bindgen/tree/0.2.123>

## Resolved production inventory

| Package | Version(s) | SPDX/license expression | Metadata author | Homepage |
| --- | --- | --- | --- | --- |
${rows}

## Pinned Hokusai Rust/WASM inventory

This inventory is validated against
\`packages/studio-hokusai-wasm/Cargo.toml\` and its checked-in Cargo v4 lockfile.
The Hokusai provider crates resolve exactly to 0.3.0 and the complete
\`wasm-bindgen\` family resolves exactly to 0.2.123. A new or changed Cargo
package fails the release audit until its license is reviewed.

| Crate | Version | SPDX/license expression | crates.io checksum | Upstream source |
| --- | --- | --- | --- | --- |
${rustRows}

## Packages whose npm archive has no root license file

These entries remain in the inventory rather than being silently omitted.
Their declared SPDX expression, metadata attribution and source location are
preserved. The reviewed ONNX Runtime MIT notice, full MPL-2.0 text and embedded
xatlas/Comlink attribution are included in the collected texts below.

| Package | Version(s) | SPDX/license expression | Homepage |
| --- | --- | --- | --- |
${missingRows}

## Collected license and attribution texts

${licenseTexts}
`;
}

export function main(argumentsList = process.argv.slice(2)) {
  const outputFlag = argumentsList.indexOf("--output");
  const outputPath =
    outputFlag >= 0 && argumentsList[outputFlag + 1]
      ? resolve(REPOSITORY_ROOT, argumentsList[outputFlag + 1])
      : null;
  const checkOnly = argumentsList.includes("--check");
  const inventorySourceFlag = argumentsList.indexOf("--inventory-source");
  const inventorySource =
    inventorySourceFlag >= 0
      ? argumentsList[inventorySourceFlag + 1]
      : "pnpm";

  if (outputFlag >= 0 && !outputPath) {
    throw new Error("--output requires a repository-relative file path.");
  }
  if (!checkOnly && !outputPath) {
    throw new Error("Use --check or --output <path>.");
  }
  if (!inventorySource) {
    throw new Error("--inventory-source requires pnpm or filesystem.");
  }

  const packageJson = readJson(PACKAGE_JSON_PATH);
  const inventory = readResolvedLicenseInventory({
    source: inventorySource,
  });
  const rustInventory = validateHokusaiReleaseContract();
  verifyCheckedInHokusaiArtifacts();
  validateDirectDependencies(packageJson, inventory);
  validateRepositoryPolicy();
  const { documents, missing } = collectLicenseDocuments(inventory);
  const generatedNotice = renderNotice(
    packageJson,
    inventory,
    rustInventory,
    documents,
    missing,
  );

  if (generatedNotice.length < 50_000) {
    throw new Error("Generated notice is unexpectedly incomplete.");
  }

  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, generatedNotice, "utf8");
    if (
      !existsSync(outputPath)
      || readFileSync(outputPath, "utf8") !== generatedNotice
    ) {
      throw new Error("Generated notice could not be verified after writing.");
    }
    validateBrowserDistribution();
    process.stdout.write(
      `Wrote ${relative(REPOSITORY_ROOT, outputPath)} (${inventory.length} entries, ${documents.length} license texts).\n`,
    );
  } else {
    validateBrowserDistribution();
    process.stdout.write(
      `License audit passed (${inventory.length} entries, ${documents.length} license texts, ${missing.length} packages without a root license file).\n`,
    );
  }
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
