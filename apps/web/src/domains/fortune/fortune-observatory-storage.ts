import { FORTUNE_EXPERIENCES } from "@toonspectrum/core/fortune";

const KEY = "toonstudio-fortune-observatory-v1";
function preferenceKey(accountId?: string | null): string {
  if (accountId == null) return KEY;
  if (!accountId || accountId.length > 160) throw new Error("Invalid account scope");
  return `${KEY}:account:${encodeURIComponent(accountId)}`;
}
export interface FortuneNotebookEntry { id: string; title: string; text: string; savedAt: string }
export interface FortunePreferences { favorites: string[]; notebook: FortuneNotebookEntry[] }
export function readFortunePreferences(accountId?: string | null): FortunePreferences {
  try {
    const data = JSON.parse(localStorage.getItem(preferenceKey(accountId)) ?? "null");
    if (!data || typeof data !== "object") return { favorites: [], notebook: [] };
    const favorites = Array.isArray(data.favorites) ? [...new Set<string>(data.favorites.filter((id: unknown) => typeof id === "string" && FORTUNE_EXPERIENCES.some((e) => e.id === id)))].slice(0, 29) : [];
    const notebook = Array.isArray(data.notebook) ? data.notebook.filter((r: FortuneNotebookEntry) => r && typeof r.id === "string" && typeof r.title === "string" && typeof r.text === "string" && r.text.length <= 30000 && typeof r.savedAt === "string").slice(0, 12) : [];
    return { favorites, notebook };
  } catch { return { favorites: [], notebook: [] }; }
}
export function writeFortunePreferences(value: FortunePreferences, accountId?: string | null): boolean {
  try { localStorage.setItem(preferenceKey(accountId), JSON.stringify({ favorites: value.favorites.slice(0, 29), notebook: value.notebook.slice(0, 12) })); return true; } catch { return false; }
}
export function clearFortunePreferences(accountId?: string | null): boolean {
  try { localStorage.removeItem(preferenceKey(accountId)); return true; } catch { return false; }
}
