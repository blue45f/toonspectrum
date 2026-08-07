import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadVelloWasm } from "../render";

/**
 * Node-side loader: feeds the committed wasm bytes to the shared init path.
 * Browser hosts should call loadVelloWasm with a URL/module instead.
 */
export async function loadVelloNode(): Promise<void> {
  const wasmPath = fileURLToPath(
    new URL(
      "../../../../crates/vello-adapter-v11/pkg/vello_adapter_v11_bg.wasm",
      import.meta.url,
    ),
  );
  const bytes = await readFile(wasmPath);
  await loadVelloWasm(bytes);
}
