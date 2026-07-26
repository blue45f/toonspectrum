import type Konva from "konva";

/**
 * Resolve a Studio element id while walking through Konva wrapper groups.
 *
 * Both the editor pointer controller and the extracted viewport renderer use this
 * leaf helper. Keeping it outside either React module prevents a circular import.
 */
export function studioElementIdOf(node: Konva.Node | null): string | null {
  let current: Konva.Node | null = node;
  while (current) {
    const id = current.getAttr("studioElementId");
    if (typeof id === "string" && id) return id;
    current = current.getParent();
  }
  return null;
}

/**
 * Development-only React commit profiling shared by the editor shell and canvas.
 */
export function recordStudioRenderProfile(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number
): void {
  if (!import.meta.env.DEV) return;
  const target = globalThis as typeof globalThis & {
    __studioRenderProfile?: { id: string; phase: string; ms: number; at: number }[];
  };
  const buffer = (target.__studioRenderProfile ??= []);
  buffer.push({
    id,
    phase,
    ms: Math.round(actualDuration * 10) / 10,
    at: Math.round(performance.now()),
  });
  if (buffer.length > 80) buffer.splice(0, buffer.length - 80);
}
