import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runtimeSpecifiers } from "./verify-api-runtime-imports.mjs";

const WORKSPACE_RUNTIME_PACKAGES = Object.freeze([
  {
    name: "@toonstudio/core",
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

async function contractsRuntimeDefinition(root) {
  const name = "@toonstudio/contracts";
  const manifest = JSON.parse(await readFile(new URL("../packages/contracts/package.json", import.meta.url), "utf8"));
  // 기존 필수 계약을 보존하고, 실제 출력의 require만 정식 package exports에 연결한다.
  const subpaths = new Set(["./security/csrf", "./production-workspace", "./operation-policy", "./creator-publication-integrity"]);
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .filter((filename) => !relative(root, filename).split(sep).includes("node_modules"))
    .sort();
  for (const filename of files) {
    for (const specifier of runtimeSpecifiers(await readFile(filename, "utf8"), filename)) {
      if (specifier === name) subpaths.add(".");
      else if (specifier.startsWith(`${name}/`)) subpaths.add(`.${specifier.slice(name.length)}`);
    }
  }
  const entries = [...subpaths].map((subpath) => {
    const source = manifest.exports[subpath]?.default;
    if (typeof source !== "string" || !source.startsWith("./src/") || !source.endsWith(".ts")
      || source.split("/").includes("..") || subpath.split("/").includes("..")) {
      throw new Error(`API 계약 내보내기를 확인할 수 없습니다: ${name}${subpath.slice(1)}. packages/contracts/package.json의 정식 exports를 확인하세요.`);
    }
    return {
      subpath,
      target: subpath === "." ? "index.js" : `${subpath.slice(2)}.js`,
      compiledEntry: `packages/contracts/${source.slice(2, -3)}.js`,
    };
  });
  return {
    name,
    compiledEntry: entries.find((entry) => entry.subpath === ".")?.compiledEntry,
    exports: Object.fromEntries(entries.map((entry) => [entry.subpath, `./${entry.target}`])),
    subpathEntries: entries.filter((entry) => entry.subpath !== "."),
  };
}

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

  for (const definition of [await contractsRuntimeDefinition(root), ...WORKSPACE_RUNTIME_PACKAGES]) {
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
