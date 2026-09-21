/** Runs inside page.evaluate: no Node closures, mock decoder or assumed minifier alias. */
export async function resolveStudioProductionGltfLoaderExport(moduleUrl: string): Promise<string> {
  const namespace: Record<string, unknown> = await import(/* @vite-ignore */ moduleUrl);
  const methods = ["load", "parse", "parseAsync", "setDRACOLoader", "setKTX2Loader", "setMeshoptDecoder", "register", "unregister"];
  const constructors = new Map<unknown, string[]>();
  for (const [name, value] of Object.entries(namespace)) {
    if (typeof value !== "function") continue;
    const prototype = value.prototype as Record<string, unknown> | undefined;
    if (!prototype || !methods.every((method) => typeof prototype[method] === "function")) continue;
    const names = constructors.get(value) ?? [];
    constructors.set(value, [...names, name]);
  }
  if (constructors.size !== 1) {
    throw new Error(`Expected one production GLTFLoader implementation; found ${constructors.size} in ${moduleUrl}`);
  }
  const names = [...constructors.values()][0]!;
  return names.includes("GLTFLoader") ? "GLTFLoader" : names[0]!;
}
