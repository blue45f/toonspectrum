import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WORKSPACE_RUNTIME_PACKAGES = Object.freeze([
  {
    name: "@toonstudio/contracts",
    sourceManifest: new URL("../packages/contracts/package.json", import.meta.url),
    compiledDirectory: "packages/contracts",
    exports: {
      "./security/csrf": "./security/csrf.js",
      "./production-workspace": "./production-workspace.js",
      "./operation-policy": "./operation-policy.js",
      "./creator-publication-integrity": "./creator-publication-integrity.js",
    },
    subpathEntries: [
      {
        target: "security/csrf.js",
        compiledEntry: "packages/contracts/src/security/csrf.js",
      },
      { target: "production-workspace.js", compiledEntry: "packages/contracts/src/production-workspace.js" },
      { target: "operation-policy.js", compiledEntry: "packages/contracts/src/operation-policy.js" },
      {
        target: "creator-publication-integrity.js",
        compiledEntry: "packages/contracts/src/creator-publication-integrity.js",
      },
    ],
  },
  {
    name: "@toonstudio/core",
    sourceManifest: new URL("../packages/core/package.json", import.meta.url),
    compiledDirectory: "packages/core",
    compiledEntry: "packages/core/src/index.js",
    exports: {
      ".": "./index.js",
      "./creator-role": "./creator-role.js",
      "./creator-resources": "./creator-resources.js",
      "./infrastructure-fabric": "./infrastructure-fabric.js",
      "./production": "./production/index.js",
    },
    subpathEntries: [
      {
        target: "creator-role.js",
        compiledEntry: "packages/core/src/creator-role.js",
      },
      {
        target: "infrastructure-fabric.js",
        compiledEntry: "packages/core/src/infrastructure-fabric.js",
      },
      {
        target: "production/index.js",
        compiledEntry: "packages/core/src/production/index.js",
      },
      {
        target: "creator-resources.js",
        compiledEntry: "packages/core/src/creator-resources.js",
      },
    ],
  },
  {
    name: "@toonstudio/studio-project-model",
    compiledEntry: "packages/studio-project-model/src/index.js",
    exports: { ".": "./index.js", ...Object.fromEntries(
      ["work-session", "work-session-evidence", "pinned-review-share", "review-delivery", "review-voice-note", "world-publication", "world-acoustic", "world-conversation"].map((name) => [`./${name}`, `./${name}.js`]),
    ) },
    subpathEntries: ["work-session", "work-session-evidence", "pinned-review-share", "review-delivery", "review-voice-note", "world-publication", "world-acoustic", "world-conversation"].map((name) => ({
      target: `${name}.js`, compiledEntry: `packages/studio-project-model/src/graph/${name}.js`,
    })),
  },
  {
    name: "@toonstudio/studio-format-gateway",
    compiledEntry: "packages/studio-format-gateway/src/index.js",
  },
]);

function packageDirectory(root, packageName) {
  return resolve(root, "node_modules", ...packageName.split("/"));
}

function requirePath(fromDirectory, target) {
  const path = relative(fromDirectory, target).replaceAll("\\", "/");
  return path.startsWith(".") ? path : `./${path}`;
}

// API가 emit한 공개 계약만 배포한다. 타입 전용·Web 전용 계약까지 강제로 emit하지 않는다.
async function emittedWorkspaceSubpaths(root, definition) {
  const manifest = JSON.parse(await readFile(definition.sourceManifest, "utf8"));
  const entries = [];
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    if (subpath === "." && definition.compiledEntry) continue;
    const source = typeof entry === "string" ? entry : entry.import;
    if (!source?.startsWith("./src/") || !source.endsWith(".ts")) continue;
    const compiledEntry = `${definition.compiledDirectory}/${source.slice(2, -3)}.js`;
    try {
      await access(resolve(root, compiledEntry));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const target = definition.exports?.[subpath]?.slice(2)
      ?? (subpath === "." ? "index.js" : `${subpath.slice(2)}.js`);
    entries.push({ subpath, target, compiledEntry });
  }
  return entries;
}

export async function stageApiWorkspaceRuntime(
  directory = fileURLToPath(new URL("../apps/api/dist/", import.meta.url)),
) {
  const root = resolve(directory);
  const staged = [];

  for (const definition of WORKSPACE_RUNTIME_PACKAGES) {
    const emittedSubpaths = definition.sourceManifest
      ? await emittedWorkspaceSubpaths(root, definition)
      : [];
    const subpathEntries = new Map((definition.subpathEntries ?? []).map((entry) => [entry.target, entry]));
    for (const entry of emittedSubpaths) subpathEntries.set(entry.target, entry);
    const exports = definition.exports ? { ...definition.exports } : undefined;
    for (const entry of emittedSubpaths) exports[entry.subpath] = `./${entry.target}`;
    const compiledEntry = definition.compiledEntry
      ? resolve(root, definition.compiledEntry)
      : null;
    if (compiledEntry) await access(compiledEntry);

    const targetDirectory = packageDirectory(root, definition.name);
    await mkdir(targetDirectory, { recursive: true });
    if (compiledEntry) {
      const shimTarget = requirePath(targetDirectory, compiledEntry);
      await writeFile(
        resolve(targetDirectory, "index.js"),
        `"use strict";\nmodule.exports = require(${JSON.stringify(shimTarget)});\n`,
        "utf8",
      );
    }
    for (const subpath of subpathEntries.values()) {
      const compiledSubpathEntry = resolve(root, subpath.compiledEntry);
      await access(compiledSubpathEntry);
      const target = resolve(targetDirectory, subpath.target);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        `"use strict";\nmodule.exports = require(${JSON.stringify(
          requirePath(dirname(target), compiledSubpathEntry),
        )});\n`,
        "utf8",
      );
    }

    await writeFile(
      resolve(targetDirectory, "package.json"),
      `${JSON.stringify({
        name: definition.name,
        private: true,
        ...(compiledEntry ? { main: "./index.js" } : {}),
        ...(exports ? { exports } : {}),
      }, null, 2)}\n`,
      "utf8",
    );
    staged.push({ name: definition.name, compiledEntry, targetDirectory });
  }

  return Object.freeze(staged);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const directoryArgument = process.argv[2];
  const staged = await stageApiWorkspaceRuntime(directoryArgument);
  console.log(
    `Staged ${staged.length} API workspace runtime package(s): ${staged.map((entry) => entry.name).join(", ")}`,
  );
}
