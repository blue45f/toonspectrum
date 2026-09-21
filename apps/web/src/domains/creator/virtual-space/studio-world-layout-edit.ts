import { studioWorldManifestSchema } from "@toonspectrum/studio-project-model/world-publication";
import { patchStudioWorldProp } from "./studio-virtual-space-world-edit-history";
import { studioWorldRoomAt, type StudioVirtualSpaceWorldManifest as World, type StudioWorldPropDefinition, type StudioWorldRect } from "./studio-virtual-space-world-manifest";

export type WorldLayoutKind = "props" | "interactions" | "spawns" | "colliders" | "portals";
export interface WorldLayoutTarget {
  readonly key: string; readonly kind: WorldLayoutKind; readonly index: number; readonly label: string;
  readonly x: number; readonly y: number; readonly bounds: StudioWorldRect;
  readonly movable: boolean; readonly reason: "baked-art" | null;
}
export type WorldLayoutEdit = { readonly ok: true; readonly world: World } | { readonly ok: false; readonly reason: "selection" | "baked-art" | "bounds" | "rotation" | "size" | "budget" };
const error = (reason: Extract<WorldLayoutEdit, { ok: false }>["reason"]): WorldLayoutEdit => ({ ok: false, reason });
export const WORLD_LAYOUT_SELECTION_LIMIT = 64;

export function studioWorldPropBounds(prop: StudioWorldPropDefinition): StudioWorldRect {
  const width = prop.width && prop.height ? prop.width : 32;
  const height = prop.width && prop.height ? prop.height : 32;
  const originX = prop.originX ?? 0.5, originY = prop.originY ?? 1;
  const angle = (prop.rotation ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const points = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => {
    const dx = x! - originX * width, dy = y! - originY * height;
    return { x: prop.x + dx * cos - dy * sin, y: prop.y + dx * sin + dy * cos };
  });
  const left = Math.min(...points.map((point) => point.x)), top = Math.min(...points.map((point) => point.y));
  return { x: left, y: top, width: Math.max(...points.map((point) => point.x)) - left, height: Math.max(...points.map((point) => point.y)) - top };
}
export function studioWorldLayoutTargets(world: World, kind: WorldLayoutKind): WorldLayoutTarget[] {
  return world[kind].map((item, index) => {
    if (kind === "props") {
      const prop = world.props[index]!;
      return { key: `${kind}:${prop.id}`, kind, index, label: prop.labelKo ?? prop.labelEn ?? prop.id,
        x: prop.x, y: prop.y, bounds: studioWorldPropBounds(prop), movable: Boolean(prop.assetUrl), reason: prop.assetUrl ? null : "baked-art" };
    }
    if (kind === "colliders") {
      const rect = world.colliders[index]!;
      return { key: `${kind}:${index}`, kind, index, label: `Collider ${index + 1}`, x: rect.x, y: rect.y, bounds: rect, movable: true, reason: null };
    }
    const entry = item as { id: string; point: { x: number; y: number }; labelKo?: string; labelEn?: string };
    return { key: `${kind}:${entry.id}`, kind, index, label: entry.labelKo ?? entry.labelEn ?? entry.id,
      ...entry.point, bounds: { x: entry.point.x - 12, y: entry.point.y - 12, width: 24, height: 24 }, movable: true, reason: null };
  });
}
function selected(world: World, kind: WorldLayoutKind, keys: readonly string[]) {
  if (!keys.length || keys.length > WORLD_LAYOUT_SELECTION_LIMIT || new Set(keys).size !== keys.length) return null;
  const all = studioWorldLayoutTargets(world, kind), found = keys.map((key) => all.find((item) => item.key === key));
  return found.every((item) => item !== undefined) ? found as WorldLayoutTarget[] : null;
}
function finish(world: World, touched?: readonly StudioWorldPropDefinition[]): WorldLayoutEdit {
  const within = (rect: StudioWorldRect) => rect.x >= -0.00001 && rect.y >= -0.00001
    && rect.x + rect.width <= world.width + 0.00001 && rect.y + rect.height <= world.height + 0.00001;
  if (touched?.some((prop) => prop.width && prop.height && !within(studioWorldPropBounds(prop)))) return error("bounds");
  return studioWorldManifestSchema.safeParse(world).success ? { ok: true, world } : error("bounds");
}
/** The caller applies path/anchor validation before one history commit. */
export function translateStudioWorldLayout(world: World, kind: WorldLayoutKind, keys: readonly string[], dx: number, dy: number): WorldLayoutEdit {
  const items = selected(world, kind, keys);
  if (!items || !Number.isFinite(dx) || !Number.isFinite(dy)) return error("selection");
  if (items.some((item) => !item.movable)) return error("baked-art");
  const indices = new Set(items.map((item) => item.index));
  if (kind === "props") {
    const props = world.props.map((prop, index) => indices.has(index) ? patchStudioWorldProp(prop, { x: prop.x + dx, y: prop.y + dy }) : prop);
    const propIds = new Set(items.map((item) => world.props[item.index]!.id));
    const interactions = world.interactions.map((item) => {
      if (!propIds.has(item.id)) return item;
      const point = { x: item.point.x + dx, y: item.point.y + dy };
      return { ...item, point, zoneId: studioWorldRoomAt(world, point) };
    });
    return finish({ ...world, props, interactions }, props.filter((_, index) => indices.has(index)));
  }
  if (kind === "colliders") return finish({ ...world, colliders: world.colliders.map((rect, index) => indices.has(index) ? { ...rect, x: rect.x + dx, y: rect.y + dy } : rect) });
  if (kind === "interactions") return finish({ ...world, interactions: world.interactions.map((item, index) => {
    if (!indices.has(index)) return item;
    const point = { x: item.point.x + dx, y: item.point.y + dy };
    return { ...item, point, zoneId: studioWorldRoomAt(world, point) };
  }) });
  if (kind === "spawns") return finish({ ...world, spawns: world.spawns.map((item, index) => indices.has(index)
    ? { ...item, point: { x: item.point.x + dx, y: item.point.y + dy } } : item) });
  return finish({ ...world, portals: world.portals.map((item, index) => indices.has(index)
    ? { ...item, point: { x: item.point.x + dx, y: item.point.y + dy } } : item) });
}
export function rotateStudioWorldLayout(world: World, keys: readonly string[], angle: number): WorldLayoutEdit {
  const items = selected(world, "props", keys);
  if (!items || !Number.isFinite(angle)) return error("selection");
  if (items.some((item) => !item.movable)) return error("baked-art");
  if (items.some((item) => Boolean(world.props[item.index]!.collider))) return error("rotation");
  const indices = new Set(items.map((item) => item.index));
  const props = world.props.map((prop, index) => indices.has(index) ? { ...prop, rotation: ((prop.rotation ?? 0) + angle + 360) % 360 } : prop);
  return finish({ ...world, props }, props.filter((_, index) => indices.has(index)));
}
export function alignStudioWorldLayout(world: World, kind: WorldLayoutKind, keys: readonly string[], alignment: "left" | "center-x" | "right" | "top" | "center-y" | "bottom"): WorldLayoutEdit {
  const items = selected(world, kind, keys);
  if (!items || items.length < 2) return error("selection");
  if (items.some((item) => !item.movable)) return error("baked-art");
  const coordinate = (item: WorldLayoutTarget) => alignment === "left" ? item.bounds.x : alignment === "right" ? item.bounds.x + item.bounds.width
    : alignment === "center-x" ? item.bounds.x + item.bounds.width / 2 : alignment === "top" ? item.bounds.y
      : alignment === "bottom" ? item.bounds.y + item.bounds.height : item.bounds.y + item.bounds.height / 2;
  const destination = coordinate(items[0]!);
  let next = world;
  for (const item of items.slice(1)) {
    const delta = destination - coordinate(item), horizontal = ["left", "center-x", "right"].includes(alignment);
    const result = translateStudioWorldLayout(next, kind, [item.key], horizontal ? delta : 0, horizontal ? 0 : delta);
    if (!result.ok) return result;
    next = result.world;
  }
  return { ok: true, world: next };
}
export function resizeStudioWorldLayoutProp(world: World, key: string, width: number, height: number): WorldLayoutEdit {
  const item = selected(world, "props", [key])?.[0];
  if (!item || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 10000 || height > 10000) return error("size");
  const prop = world.props[item.index]!;
  if (!prop.assetUrl) return error("baked-art");
  if (prop.collider) return error("size");
  const next = { ...prop, width, height };
  return finish({ ...world, props: world.props.map((value, index) => index === item.index ? next : value) }, [next]);
}
export function duplicateStudioWorldLayoutProps(world: World, keys: readonly string[]): WorldLayoutEdit {
  const items = selected(world, "props", keys);
  if (!items || items.some((item) => !item.movable)) return error(items ? "baked-art" : "selection");
  if (world.props.length + items.length > 4096) return error("budget");
  const used = new Set(world.props.map((prop) => prop.id));
  const copies = items.map((item) => {
    const prop = world.props[item.index]!; let sequence = 1, id: string;
    do { id = `${prop.id.slice(0, 45)}-copy-${sequence++}`; } while (used.has(id));
    used.add(id);
    return { ...patchStudioWorldProp(prop, { x: prop.x + 16, y: prop.y + 16 }), id, assetKey: prop.assetKey ?? prop.id };
  });
  const interactions = [...world.interactions], rules = world.interactionRules ? [...world.interactionRules] : undefined;
  for (const [index, copy] of copies.entries()) {
    const original = world.props[items[index]!.index]!;
    const anchor = world.interactions.find((entry) => entry.id === original.id);
    if (anchor) {
      const point = { x: anchor.point.x + 16, y: anchor.point.y + 16 };
      interactions.push({ ...anchor, id: copy.id, point, zoneId: studioWorldRoomAt(world, point) });
    }
    const rule = rules?.find((entry) => entry.interactionId === original.id);
    if (rule && rules) {
      let n = 1, id = `${copy.id.slice(0, 45)}-rule-${n}`;
      while (rules.some((entry) => entry.id === id)) id = `${copy.id.slice(0, 45)}-rule-${++n}`;
      rules.push({ ...rule, id, interactionId: copy.id });
    }
  }
  return finish({ ...world, props: [...world.props, ...copies], interactions, ...(rules ? { interactionRules: rules } : {}) }, copies);
}
/** SVG letterboxing is removed before converting pointer coordinates to world pixels. */
export function studioWorldLayoutPointer(client: { x: number; y: number }, rect: StudioWorldRect, world: { width: number; height: number }): { x: number; y: number } | null {
  if ([client.x, client.y, rect.x, rect.y, rect.width, rect.height, world.width, world.height].some((value) => !Number.isFinite(value))
    || rect.width <= 0 || rect.height <= 0 || world.width <= 0 || world.height <= 0) return null;
  const scale = Math.min(rect.width / world.width, rect.height / world.height);
  const x = (client.x - rect.x - (rect.width - world.width * scale) / 2) / scale;
  const y = (client.y - rect.y - (rect.height - world.height * scale) / 2) / scale;
  return x < 0 || y < 0 || x > world.width || y > world.height ? null : { x, y };
}
