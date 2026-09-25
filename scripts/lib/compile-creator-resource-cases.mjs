import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptRequire = createRequire(import.meta.url);
const apiRequire = createRequire(path.join(root, "apps/api/package.json"));

function resolveDependency(specifier) {
  for (const resolver of [scriptRequire, apiRequire]) {
    try {
      return resolver.resolve(specifier);
    } catch (error) {
      if (
        error?.code !== "MODULE_NOT_FOUND"
        && error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED"
      ) {
        throw error;
      }
    }
  }
  throw new Error(
    `Creator resource checker dependency is unavailable: ${specifier}. `
      + "Install the checker dependency or the workspace before compiling.",
  );
}

function findPackageRoot(entry) {
  let directory = path.dirname(entry);
  while (directory !== path.dirname(directory)) {
    if (existsSync(path.join(directory, "package.json"))) return directory;
    directory = path.dirname(directory);
  }
  throw new Error(`Unable to find package root for ${entry}`);
}

function relativeRequire(fromDirectory, target) {
  const relative = path.relative(fromDirectory, target).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function prepareRuntimeBridges(output, fastXmlEntry) {
  const coreRuntime = path.join(output, "node_modules/@toonspectrum/core");
  const compiledCore = path.join(output, "packages/core/src/creator-resources.js");
  mkdirSync(coreRuntime, { recursive: true });
  writeFileSync(
    path.join(coreRuntime, "package.json"),
    JSON.stringify({
      name: "@toonspectrum/core",
      private: true,
      type: "commonjs",
      exports: { "./creator-resources": "./creator-resources.js" },
    }, null, 2),
  );
  writeFileSync(
    path.join(coreRuntime, "creator-resources.js"),
    `module.exports = require(${JSON.stringify(
      relativeRequire(coreRuntime, compiledCore),
    )});\n`,
  );

  const vendor = path.join(output, "vendor");
  const xmlRuntime = path.join(output, "node_modules/fast-xml-parser");
  mkdirSync(vendor, { recursive: true });
  mkdirSync(xmlRuntime, { recursive: true });
  copyFileSync(fastXmlEntry, path.join(vendor, "fast-xml-parser.js"));
  writeFileSync(
    path.join(xmlRuntime, "package.json"),
    JSON.stringify({
      name: "fast-xml-parser",
      private: true,
      type: "commonjs",
      main: "./index.js",
    }, null, 2),
  );
  writeFileSync(
    path.join(xmlRuntime, "index.js"),
    `module.exports = require(${JSON.stringify(
      relativeRequire(xmlRuntime, path.join(vendor, "fast-xml-parser.js")),
    )});\n`,
  );
}

export function compileCreatorResourceCases(output) {
  const fastXmlEntry = resolveDependency("fast-xml-parser");
  const fastXmlRoot = findPackageRoot(fastXmlEntry);
  const fastXmlTypes = path.join(fastXmlRoot, "lib/fxp.d.cts");
  if (!existsSync(fastXmlTypes)) {
    throw new Error(
      `Creator resource checker XML types are unavailable: ${fastXmlTypes}`,
    );
  }

  mkdirSync(output, { recursive: true });
  const config = path.join(output, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      strict: true,
      skipLibCheck: true,
      target: "ES2022",
      module: "CommonJS",
      moduleResolution: "Node",
      baseUrl: root,
      ignoreDeprecations: "6.0",
      paths: {
        "@toonspectrum/core/creator-resources": [
          path.join(root, "packages/core/src/creator-resources.ts"),
        ],
        "fast-xml-parser": [fastXmlTypes],
      },
      lib: ["ES2022", "DOM"],
      rootDir: root,
      outDir: output,
      esModuleInterop: true,
    },
    files: [
      path.join(root, "packages/core/src/creator-resources.ts"),
      path.join(root, "tests/creator-resources-cases.ts"),
      path.join(root, "tests/creator-resource-workflow-cases.ts"),
      path.join(root, "tests/creator-workspace-persistence-cases.ts"),
    ],
  }, null, 2));

  let compiler;
  try {
    compiler = resolveDependency("typescript/lib/tsc.js");
  } catch {
    throw new Error(
      "TypeScript is required for strict creator resource verification.",
    );
  }
  try {
    execFileSync(process.execPath, [compiler, "-p", config], {
      cwd: root,
      stdio: "pipe",
    });
  } catch (error) {
    const details = [error.stdout, error.stderr]
      .filter(Boolean)
      .map((value) => value.toString())
      .join("\n");
    throw new Error(
      `Creator resource strict TypeScript compilation failed.\n${details}`,
      { cause: error },
    );
  }

  const compiledCore = path.join(
    output,
    "packages/core/src/creator-resources.js",
  );
  if (!existsSync(compiledCore)) {
    throw new Error(
      "Creator resource Core contract was not emitted into the isolated checker.",
    );
  }
  prepareRuntimeBridges(output, fastXmlEntry);
  return {
    coreRuntime: compiledCore,
    fastXmlRuntime: path.join(output, "vendor/fast-xml-parser.js"),
  };
}
