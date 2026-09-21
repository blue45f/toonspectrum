import { z } from "zod";
import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import { PRODUCTION_SMART_VIEWS } from "./studio-production-smart-views";
import { STUDIO_PRODUCTION_STAGES } from "./studio-production-workspace-runtime";

export const productionViewFilterSchema = z.object({
  view: z.enum(PRODUCTION_SMART_VIEWS), query: z.string().max(200),
  stage: z.union([z.literal("all"), z.enum(STUDIO_PRODUCTION_STAGES)]),
  layout: z.enum(["list", "matrix", "calendar"]), sort: z.enum(["original", "due", "priority"]),
}).strict();
export type ProductionSavedFilter = z.infer<typeof productionViewFilterSchema>;
const viewSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(60), filter: productionViewFilterSchema }).strict();
const collectionSchema = z.object({ version: z.literal(1), views: z.array(viewSchema).max(16) }).strict();
export type ProductionSavedView = z.infer<typeof viewSchema>;
export interface ProductionViewsRepository {
  load(scope: string): Promise<ProductionSavedView[]>;
  save(scope: string, name: string, filter: ProductionSavedFilter): Promise<ProductionSavedView[]>;
  remove(scope: string, id: string): Promise<ProductionSavedView[]>;
}
export function productionViewScope(actor: string | null, workspace: string): string {
  if (!workspace || workspace.length > 1000 || (actor?.length ?? 0) > 240) throw new Error("Invalid view scope");
  return JSON.stringify([actor, workspace]);
}
const normalizedName = (name: string) => name.normalize("NFKC").toLocaleLowerCase();
export function parseProductionViews(raw: string | null): ProductionSavedView[] {
  if (raw === null) return [];
  if (raw.length > 16000) throw new Error("Saved views exceed limit");
  const result = collectionSchema.parse(JSON.parse(raw));
  if (new Set(result.views.map((view) => view.id)).size !== result.views.length
    || new Set(result.views.map((view) => normalizedName(view.name))).size !== result.views.length) throw new Error("Duplicate saved view");
  return result.views;
}
type ViewLock = <T>(key: string, action: () => Promise<T>) => Promise<T>;
export function createProductionViewsRepository(store: StudioAsyncKeyValueStore, lock: ViewLock): ProductionViewsRepository {
  const load = async (scope: string) => parseProductionViews(await store.get(scope));
  const update = (scope: string, apply: (views: ProductionSavedView[]) => ProductionSavedView[]) => lock(`studio-production-views:${scope}`, async () => {
    const next = apply(await load(scope));
    const raw = JSON.stringify({ version: 1, views: next }); parseProductionViews(raw);
    await store.set(scope, raw); return next;
  });
  return {
    load,
    save: (scope, name, filter) => update(scope, (views) => {
      const view = viewSchema.parse({ id: crypto.randomUUID(), name, filter });
      if (views.some((existing) => normalizedName(existing.name) === normalizedName(view.name))) throw new Error("Choose a different view name");
      return [...views, view];
    }),
    remove: (scope, id) => update(scope, (views) => views.filter((view) => view.id !== id)),
  };
}
export async function acquireProductionViewsRepository(): Promise<ProductionViewsRepository> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  return createProductionViewsRepository(database.asAsyncKeyValueStore("studio-production-views-v1"), async (key, action) => {
    if (typeof navigator.locks?.request !== "function") throw new Error("Safe local view storage requires Web Locks");
    return navigator.locks.request(key, action);
  });
}
