import { access, mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WORKSPACE_RUNTIME_PACKAGES = Object.freeze([
  {
    name: "@toonspectrum/studio-project-model",
    compiledEntry: "packages/studio-project-model/src/index.js",
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
    const compiledEntry = resolve(root, definition.compiledEntry);
    await access(compiledEntry);

    const targetDirectory = packageDirectory(root, definition.name);
    await mkdir(targetDirectory, { recursive: true });
    const shimTarget = requirePath(targetDirectory, compiledEntry);
    await writeFile(
      resolve(targetDirectory, "index.js"),
      `"use strict";\nmodule.exports = require(${JSON.stringify(shimTarget)});\n`,
      "utf8",
    );
    await writeFile(
      resolve(targetDirectory, "package.json"),
      `${JSON.stringify({ name: definition.name, private: true, main: "./index.js" }, null, 2)}\n`,
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
