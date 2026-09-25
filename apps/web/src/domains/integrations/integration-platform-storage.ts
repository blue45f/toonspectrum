import type {
  IntegrationRecipeDraft,
  IntegrationRecipeTemplate,
} from "./integration-platform-types";

const RECIPE_STORAGE_KEY = "toonspectrum.integration.recipes.v1";

const DEFAULT_PROVIDER_BY_ACTION: Readonly<Record<string, string>> = {
  "calendar.create": "google-workspace",
  "meeting.create": "google-meet",
  "file.upload": "google-drive",
  "task.upsert": "notion",
  "message.send": "slack",
  "translation.draft": "deepl",
  "signature.request": "documenso",
  "publication.package": "external-webtoon-platforms",
  "publication.publish": "youtube",
  "feed.generate": "rss-json-feed",
  "webhook.emit": "generic-webhook",
  "membership.sync": "patreon",
  "payment.reconcile": "stripe-connect",
  "merch.create": "printful",
};

function isRecipeDraft(value: unknown): value is IntegrationRecipeDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<IntegrationRecipeDraft>;
  return typeof draft.id === "string"
    && typeof draft.name === "string"
    && typeof draft.trigger === "string"
    && typeof draft.enabled === "boolean"
    && Array.isArray(draft.actions)
    && draft.actions.every((action) => Boolean(
      action
      && typeof action === "object"
      && typeof action.type === "string"
      && typeof action.providerId === "string",
    ));
}

export function recipeDraftFromTemplate(
  template: IntegrationRecipeTemplate,
): IntegrationRecipeDraft {
  return {
    id: template.id,
    name: template.name,
    trigger: template.trigger,
    enabled: false,
    actions: template.actions.map((type) => ({
      type,
      providerId: DEFAULT_PROVIDER_BY_ACTION[type] ?? "generic-webhook",
    })),
  };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadIntegrationRecipes(
  templates: readonly IntegrationRecipeTemplate[],
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): readonly IntegrationRecipeDraft[] {
  if (storage) {
    try {
      const raw = storage.getItem(RECIPE_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every(isRecipeDraft)) return parsed;
      }
    } catch {
      // Corrupt or unavailable browser storage falls back to canonical templates.
    }
  }
  return templates.map(recipeDraftFromTemplate);
}

export function saveIntegrationRecipes(
  recipes: readonly IntegrationRecipeDraft[],
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
): void {
  if (!storage) return;
  storage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(recipes));
}

export function downloadIntegrationJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadIntegrationText(
  filename: string,
  value: string,
  type = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
