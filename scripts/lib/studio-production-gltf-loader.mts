/** Resolve the shipped GLTFLoader by its public method contract, not a minified export letter. */
export async function resolveStudioProductionGltfLoaderExport(input: string | Record<string, unknown>): Promise<string> {
  // Keep this function self-contained: Playwright serializes it into the actual preview page.
  const module = typeof input === "string" ? await import(input) as Record<string, unknown> : input;
  const matches = Object.entries(module).filter(([, candidate]) => {
    if (typeof candidate !== "function") return false;
    const prototype = candidate.prototype as Record<string, unknown> | undefined;
    return prototype && ["parse", "parseAsync", "setDRACOLoader", "setKTX2Loader", "setMeshoptDecoder", "register", "unregister"]
      .every((method) => typeof prototype[method] === "function");
  });
  const identities = new Set(matches.map(([, value]) => value));
  if (identities.size !== 1) throw new Error(`Expected one production GLTFLoader contract, found ${identities.size}`);
  return matches.find(([key]) => key === "GLTFLoader")?.[0] ?? matches[0]![0];
}
