/**
 * CAD-016 Rhino 3DM lite — pure-TS parse of a JSON-transcoded 3DM sidecar
 * (or minimal openNURBS-style text dump). Maps curves/surfaces/layers/attributes.
 * Not a full openNURBS WASM load.
 */

export const STUDIO_RHINO3DM_LITE_REVISION = 1 as const;

export type StudioRhino3dmLiteDoc = {
  readonly revision: typeof STUDIO_RHINO3DM_LITE_REVISION;
  readonly layers: readonly { readonly id: string; readonly name: string; readonly color: string }[];
  readonly curves: readonly { readonly id: string; readonly layerId: string; readonly pointCount: number }[];
  readonly surfaces: readonly { readonly id: string; readonly layerId: string; readonly u: number; readonly v: number }[];
  readonly objects: readonly {
    readonly id: string;
    readonly layerId: string;
    readonly name: string;
    readonly attributes: Readonly<Record<string, string>>;
  }[];
};

export function parseStudioRhino3dmLite(source: string | Uint8Array): {
  readonly ok: boolean;
  readonly doc: StudioRhino3dmLiteDoc | null;
  readonly losses: readonly string[];
  readonly format: "3dm-json-lite" | "3dm-binary-reject" | "unknown";
} {
  const losses: string[] = [];
  if (typeof source !== "string") {
    // Real 3DM starts with "3D Geometry File Format" ASCII
    const head = new TextDecoder().decode(source.subarray(0, 32));
    if (head.includes("3D Geometry") || head.startsWith("3D")) {
      losses.push("binary-3dm-needs-opennurbs-wasm");
      return { ok: false, doc: null, losses, format: "3dm-binary-reject" };
    }
    source = new TextDecoder().decode(source);
  }
  try {
    const json = JSON.parse(source) as {
      layers?: { id: string; name: string; color?: string }[];
      curves?: { id: string; layerId: string; points?: number[][] }[];
      surfaces?: { id: string; layerId: string; uCount?: number; vCount?: number }[];
      objects?: { id: string; layerId: string; name?: string; attributes?: Record<string, string> }[];
    };
    const layers = (json.layers ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color ?? "#cccccc",
    }));
    const curves = (json.curves ?? []).map((c) => ({
      id: c.id,
      layerId: c.layerId,
      pointCount: c.points?.length ?? 0,
    }));
    const surfaces = (json.surfaces ?? []).map((s) => ({
      id: s.id,
      layerId: s.layerId,
      u: s.uCount ?? 0,
      v: s.vCount ?? 0,
    }));
    const objects = (json.objects ?? []).map((o) => ({
      id: o.id,
      layerId: o.layerId,
      name: o.name ?? o.id,
      attributes: o.attributes ?? {},
    }));
    if (!layers.length && !curves.length && !surfaces.length && !objects.length) {
      losses.push("empty-document");
    }
    losses.push("nurbs-control-points-sampled-only");
    return {
      ok: true,
      doc: {
        revision: STUDIO_RHINO3DM_LITE_REVISION,
        layers,
        curves,
        surfaces,
        objects,
      },
      losses,
      format: "3dm-json-lite",
    };
  } catch {
    return {
      ok: false,
      doc: null,
      losses: ["json-parse-failed"],
      format: "unknown",
    };
  }
}
