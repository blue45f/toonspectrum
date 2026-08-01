/**
 * CAD-016 Rhino 3DM lite — pure-TS openNURBS-style chunk walker.
 * Parses binary 3DM (start string + TCODE table chunks) for layers, curves (point lists),
 * meshes, and object name attributes. Not full openNURBS NURBS evaluation.
 */

export const STUDIO_RHINO3DM_LITE_REVISION = 2 as const;

/** openNURBS typecodes used by this lite walker (subset). */
const TCODE = {
  COMMENTBLOCK: 0x00_00_00_01,
  ENDOFFILE: 0x00_07_ff_ff,
  ENDOFFILE_GOO: 0x00_07_ff_fe,
  OBJECT_RECORD: 0x00_20_00_13,
  OBJECT_RECORD_TYPE: 0x00_20_00_14,
  OBJECT_RECORD_END: 0x00_20_00_ff,
  LAYER_TABLE: 0x00_10_00_12,
  LAYER_RECORD: 0x00_10_00_13,
  PROPERTIES_TABLE: 0x00_10_00_14,
  USER_TABLE: 0x00_40_00_01,
  ANONYMOUS_CHUNK: 0x00_00_ff_fe,
  OPENNURBS_CLASS: 0x00_07_ff_10,
  OPENNURBS_CLASS_USERDATA: 0x00_07_ff_13,
  OPENNURBS_CLASS_END: 0x00_07_ff_7f,
} as const;

export type StudioRhino3dmLiteDoc = {
  readonly revision: typeof STUDIO_RHINO3DM_LITE_REVISION;
  readonly version: number | null;
  readonly layers: readonly { readonly id: string; readonly name: string; readonly color: string }[];
  readonly curves: readonly {
    readonly id: string;
    readonly layerId: string;
    readonly pointCount: number;
    readonly points: readonly (readonly [number, number, number])[];
  }[];
  readonly surfaces: readonly { readonly id: string; readonly layerId: string; readonly u: number; readonly v: number }[];
  readonly meshes: readonly {
    readonly id: string;
    readonly vertexCount: number;
    readonly faceCount: number;
  }[];
  readonly objects: readonly {
    readonly id: string;
    readonly layerId: string;
    readonly name: string;
    readonly attributes: Readonly<Record<string, string>>;
  }[];
  readonly chunkCount: number;
};

function readAsciiCString(bytes: Uint8Array, o: number, max = 128): string {
  const end = Math.min(bytes.length, o + max);
  let i = o;
  while (i < end && bytes[i] !== 0) i += 1;
  return new TextDecoder().decode(bytes.subarray(o, i));
}

function extractPrintableStrings(bytes: Uint8Array, minLen = 3): string[] {
  const out: string[] = [];
  let buf: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const c = bytes[i]!;
    if (c >= 0x20 && c < 0x7f) {
      buf.push(c);
    } else {
      if (buf.length >= minLen) {
        out.push(String.fromCharCode(...buf));
      }
      buf = [];
    }
  }
  if (buf.length >= minLen) out.push(String.fromCharCode(...buf));
  return out;
}

/**
 * Scan binary payload for sequences of IEEE-754 LE doubles that look like 3d points
 * (finite, |v|<1e6). Used for curve control points embedded in chunks.
 */
function extractPointRuns(bytes: Uint8Array, maxPoints = 256): (readonly [number, number, number])[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const points: [number, number, number][] = [];
  // Align to 8
  for (let o = 0; o + 24 <= bytes.length && points.length < maxPoints; o += 8) {
    try {
      const x = view.getFloat64(o, true);
      const y = view.getFloat64(o + 8, true);
      const z = view.getFloat64(o + 16, true);
      if (
        Number.isFinite(x)
        && Number.isFinite(y)
        && Number.isFinite(z)
        && Math.abs(x) < 1e6
        && Math.abs(y) < 1e6
        && Math.abs(z) < 1e6
      ) {
        // Prefer non-degenerate consecutive points
        const last = points[points.length - 1];
        if (!last || Math.hypot(x - last[0], y - last[1], z - last[2]) > 1e-9) {
          points.push([x, y, z]);
        }
        o += 16; // skip y,z (loop will +8 → next candidate after this point)
      }
    } catch {
      // ignore
    }
  }
  return points;
}

function extractMeshCounts(bytes: Uint8Array): { vertexCount: number; faceCount: number } {
  // Look for "ON_Mesh" or patterns of int32 counts followed by float arrays
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  if (!/ON_Mesh|mesh/i.test(text) && bytes.length < 64) {
    return { vertexCount: 0, faceCount: 0 };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Heuristic: search int32 pairs (vertexCount, faceCount) with sane ranges
  for (let o = 0; o + 8 <= Math.min(bytes.length, 2048); o += 4) {
    const vc = view.getInt32(o, true);
    const fc = view.getInt32(o + 4, true);
    if (vc >= 3 && vc <= 100_000 && fc >= 1 && fc <= 200_000) {
      const need = vc * 12 + fc * 12;
      if (need < bytes.length) {
        return { vertexCount: vc, faceCount: fc };
      }
    }
  }
  return { vertexCount: 0, faceCount: 0 };
}

/**
 * Parse binary Rhino 3DM or JSON-transcoded lite document.
 */
export function parseStudioRhino3dmLite(source: string | Uint8Array): {
  readonly ok: boolean;
  readonly doc: StudioRhino3dmLiteDoc | null;
  readonly losses: readonly string[];
  readonly format: "3dm-binary" | "3dm-json-lite" | "unknown";
} {
  const losses: string[] = [];

  // JSON path still supported for tests/fixtures
  if (typeof source === "string") {
    try {
      const json = JSON.parse(source) as {
        layers?: { id: string; name: string; color?: string }[];
        curves?: { id: string; layerId: string; points?: number[][] }[];
        surfaces?: { id: string; layerId: string; uCount?: number; vCount?: number }[];
        meshes?: { id: string; vertexCount?: number; faceCount?: number }[];
        objects?: { id: string; layerId: string; name?: string; attributes?: Record<string, string> }[];
        version?: number;
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
        points: (c.points ?? []).map(
          (p) => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0] as [number, number, number],
        ),
      }));
      return {
        ok: true,
        doc: {
          revision: STUDIO_RHINO3DM_LITE_REVISION,
          version: json.version ?? null,
          layers,
          curves,
          surfaces: (json.surfaces ?? []).map((s) => ({
            id: s.id,
            layerId: s.layerId,
            u: s.uCount ?? 0,
            v: s.vCount ?? 0,
          })),
          meshes: (json.meshes ?? []).map((m) => ({
            id: m.id,
            vertexCount: m.vertexCount ?? 0,
            faceCount: m.faceCount ?? 0,
          })),
          objects: (json.objects ?? []).map((o) => ({
            id: o.id,
            layerId: o.layerId,
            name: o.name ?? o.id,
            attributes: o.attributes ?? {},
          })),
          chunkCount: 0,
        },
        losses: ["json-transcode-path"],
        format: "3dm-json-lite",
      };
    } catch {
      // fall through if not JSON — try as binary latin1? reject
      return { ok: false, doc: null, losses: ["json-parse-failed"], format: "unknown" };
    }
  }

  const bytes = source;
  if (bytes.length < 32) {
    return { ok: false, doc: null, losses: ["truncated-3dm"], format: "unknown" };
  }

  // 3DM start string: "3D Geometry File Format XXX" (32 bytes typically)
  const start = readAsciiCString(bytes, 0, 32);
  if (!start.includes("3D Geometry File Format") && !start.startsWith("3D Geometry")) {
    losses.push("missing-3dm-start-string");
    return { ok: false, doc: null, losses, format: "unknown" };
  }
  const versionMatch = /(\d{2,4})\s*$/u.exec(start.trim());
  const version = versionMatch ? Number(versionMatch[1]) : null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // After start string, openNURBS uses 4-byte aligned chunks: tcode(u32) + value(u32)
  // Find first chunk after null-padded start (usually at 32)
  let o = 32;
  while (o < bytes.length && bytes[o] === 0) o += 1;
  if (o % 4 !== 0) o += 4 - (o % 4);

  let chunkCount = 0;
  const layerNames: string[] = [];
  const curvePointSets: (readonly [number, number, number])[][] = [];
  const meshes: { id: string; vertexCount: number; faceCount: number }[] = [];
  const objectNames: string[] = [];
  const maxChunks = 50_000;

  while (o + 8 <= bytes.length && chunkCount < maxChunks) {
    const tcode = view.getUint32(o, true);
    const value = view.getUint32(o + 4, true);
    o += 8;
    chunkCount += 1;

    if (tcode === TCODE.ENDOFFILE || tcode === TCODE.ENDOFFILE_GOO) break;

    // Major chunk with length in value (bit 31 of tcode often means long chunk)
    const isShort = (tcode & 0x8000_0000) === 0;
    if (!isShort) {
      let payloadLen = value;
      if (payloadLen < 0 || o + payloadLen > bytes.length) {
        if (o + 4 <= bytes.length) {
          payloadLen = view.getUint32(o, true);
          o += 4;
        } else {
          payloadLen = 0;
        }
      }
      if (payloadLen > 0 && o + payloadLen <= bytes.length) {
        const payload = bytes.subarray(o, o + payloadLen);
        const strings = extractPrintableStrings(payload, 2);
        if (tcode === TCODE.LAYER_TABLE || tcode === TCODE.LAYER_RECORD || (tcode & 0xffff) === 0x0012) {
          for (const s of strings) {
            if (s.length >= 1 && s.length < 64 && !s.includes("ON_")) layerNames.push(s);
          }
        }
        if (tcode === TCODE.OBJECT_RECORD || (tcode & 0xff00) === 0x2000) {
          for (const s of strings) {
            if (/^[A-Za-z][\w .-]{0,48}$/u.test(s)) objectNames.push(s);
          }
        }
        const pts = extractPointRuns(payload, 64);
        if (pts.length >= 2) curvePointSets.push(pts);
        const mc = extractMeshCounts(payload);
        if (mc.vertexCount > 0) {
          meshes.push({
            id: `mesh-${meshes.length}`,
            vertexCount: mc.vertexCount,
            faceCount: mc.faceCount,
          });
        }
        o += payloadLen;
        if (o % 4 !== 0) o += 4 - (o % 4);
      }
    } else if (tcode === TCODE.COMMENTBLOCK && value > 0 && o + value <= bytes.length) {
      o += value;
    }
  }

  // If chunk walk found nothing useful, still scan whole file for strings/points (lite salvage)
  if (!layerNames.length && !curvePointSets.length && !meshes.length) {
    const allStrings = extractPrintableStrings(bytes, 4).filter(
      (s) => !s.includes("Geometry File") && !s.startsWith("OpenNURBS") && s.length < 40,
    );
    for (const s of allStrings.slice(0, 16)) {
      if (/layer|default|curve|surface|object/i.test(s) || /^[A-Z][a-z]+$/u.test(s)) {
        layerNames.push(s);
      } else {
        objectNames.push(s);
      }
    }
    const pts = extractPointRuns(bytes.subarray(32), 128);
    if (pts.length >= 2) curvePointSets.push(pts);
    losses.push("chunk-table-sparse-salvage-scan");
  }

  if (!layerNames.length) layerNames.push("Default");
  const layers = layerNames.slice(0, 32).map((name, i) => ({
    id: `L${i}`,
    name,
    color: i === 0 ? "#cccccc" : `hsl(${(i * 40) % 360} 50% 55%)`,
  }));
  const curves = curvePointSets.slice(0, 32).map((pts, i) => ({
    id: `C${i}`,
    layerId: layers[Math.min(i, layers.length - 1)]!.id,
    pointCount: pts.length,
    points: pts,
  }));
  const objects = objectNames.slice(0, 32).map((name, i) => ({
    id: `O${i}`,
    layerId: layers[0]!.id,
    name,
    attributes: { source: "3dm-binary-lite" },
  }));

  const hasGeometry = curves.length > 0 || meshes.length > 0 || objects.length > 0;
  if (!hasGeometry) losses.push("no-geometry-recovered");
  losses.push("nurbs-surface-eval-not-implemented");

  return {
    ok: hasGeometry || layers.length > 0,
    doc: {
      revision: STUDIO_RHINO3DM_LITE_REVISION,
      version,
      layers,
      curves,
      surfaces: [],
      meshes,
      objects,
      chunkCount,
    },
    losses,
    format: "3dm-binary",
  };
}

/** Build a minimal valid-ish 3DM binary fixture for tests (start string + layer name payload). */
export function createStudioRhino3dmBinaryFixture(): Uint8Array {
  const start = "3D Geometry File Format 60";
  const buf = new Uint8Array(256);
  for (let i = 0; i < start.length; i += 1) buf[i] = start.charCodeAt(i);
  // pad to 32
  let o = 32;
  const view = new DataView(buf.buffer);
  // Long layer-table-like chunk
  view.setUint32(o, 0x00_10_00_12, true); // LAYER_TABLE
  o += 4;
  const payload = new TextEncoder().encode("Default\0Curves\0Line01\0");
  // points as doubles
  const pointBytes = new ArrayBuffer(24 * 3);
  const pv = new DataView(pointBytes);
  // (0,0,0) (1,0,0) (1,1,0)
  const pts = [0, 0, 0, 1, 0, 0, 1, 1, 0];
  for (let i = 0; i < 9; i += 1) pv.setFloat64(i * 8, pts[i]!, true);
  const body = new Uint8Array(payload.length + pointBytes.byteLength);
  body.set(payload, 0);
  body.set(new Uint8Array(pointBytes), payload.length);
  view.setUint32(o, body.length, true);
  o += 4;
  buf.set(body, o);
  o += body.length;
  // ENDOFFILE
  if (o + 8 <= buf.length) {
    view.setUint32(o, 0x00_07_ff_ff, true);
    view.setUint32(o + 4, 0, true);
  }
  return buf.subarray(0, Math.min(buf.length, o + 8));
}
