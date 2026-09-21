import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WORKSPACE_RUNTIME_PACKAGES = Object.freeze([
  {
    name: "@toonspectrum/contracts",
    exports: {
      "./security/csrf": "./security/csrf.js",
      "./production-workspace": "./production-workspace.js",
      "./operation-policy": "./operation-policy.js",
    },
    subpathEntries: [
      {
        target: "security/csrf.js",
        compiledEntry: "packages/contracts/src/security/csrf.js",
      },
      { target: "production-workspace.js", compiledEntry: "packages/contracts/src/production-workspace.js" },
      { target: "operation-policy.js", compiledEntry: "packages/contracts/src/operation-policy.js" },
    ],
  },
  {
    name: "@toonspectrum/core",
    compiledEntry: "packages/core/src/index.js",
    exports: {
      ".": "./index.js",
      "./creator-role": "./creator-role.js",
      "./production": "./production/index.js",
    },
    subpathEntries: [
      {
        target: "creator-role.js",
        compiledEntry: "packages/core/src/creator-role.js",
      },
      {
        target: "production/index.js",
        compiledEntry: "packages/core/src/production/index.js",
      },
    ],
  },
  {
    name: "@toonspectrum/studio-project-model",
    compiledEntry: "packages/studio-project-model/src/index.js",
    exports: { ".": "./index.js", ...Object.fromEntries(
      ["work-session", "work-session-evidence", "world-publication", "world-acoustic", "world-conversation"].map((name) => [`./${name}`, `./${name}.js`]),
    ) },
    subpathEntries: ["work-session", "work-session-evidence", "world-publication", "world-acoustic", "world-conversation"].map((name) => ({
      target: `${name}.js`, compiledEntry: `packages/studio-project-model/src/graph/${name}.js`,
    })),
  },
  {
    name: "@toonspectrum/studio-format-gateway",
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

export async function stageApiWorkspaceRuntime(
  directory = fileURLToPath(new URL("../apps/api/dist/", import.meta.url)),
) {
  const root = resolve(directory);
  const staged = [];

  for (const definition of WORKSPACE_RUNTIME_PACKAGES) {
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
    for (const subpath of definition.subpathEntries ?? []) {
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
        ...(definition.exports ? { exports: definition.exports } : {}),
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