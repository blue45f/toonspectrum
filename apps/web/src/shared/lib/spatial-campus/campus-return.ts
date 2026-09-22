import { campusProtectedSearch } from "./campus-bindings";

export const CAMPUS_RETURN_KEY = "toonstudio:campus-return:v1";
export const CAMPUS_RETURN_TTL = 12 * 60 * 60 * 1000;
export interface CampusReturnTarget {
  readonly owner: string;
  readonly href: string;
  readonly savedAt: number;
}
const ID = "[A-Za-z0-9_%~-]+";
const DOCUMENT = new RegExp(`^/studio/(?:p/${ID}/d/${ID}|draft/${ID}|(?:work|remix)/${ID}/(?:canvas|comic|bg3d|animation|review|storyworld))/?$`, "u");
const QUERY_ID = /^[A-Za-z0-9][A-Za-z0-9_.~-]{0,255}$/u;
const DOCUMENT_QUERY = new Set(["page", "pageId", "revision", "revisionId", "documentId", "workspace"]);
/** A reference only: the destination's existing resolver must recheck existence and access. */
export function campusDocumentHref(pathname: string, search = ""): string | null {
  if (!DOCUMENT.test(pathname) || campusProtectedSearch(search)) return null;
  try {
    if (pathname.split("/").some((part) => {
      const decoded = decodeURIComponent(part);
      return decoded === "." || decoded === ".." || /[\\/%]/u.test(decoded)
        || [...decoded].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    })) return null;
  } catch { return null; }
  const params = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) {
    if (!DOCUMENT_QUERY.has(key) || !QUERY_ID.test(value) || params.has(key)) return null;
    params.set(key, value);
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}
export function readCampusReturn(storage: Pick<Storage, "getItem"> | undefined, owner: string, now = Date.now()): CampusReturnTarget | null {
  try {
    const raw = storage?.getItem(CAMPUS_RETURN_KEY);
    if (!raw || raw.length > 4096) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const target = value as Partial<CampusReturnTarget>;
    if (target.owner !== owner || typeof target.href !== "string"
      || typeof target.savedAt !== "number" || !Number.isFinite(target.savedAt)
      || target.savedAt > now || now - target.savedAt > CAMPUS_RETURN_TTL) return null;
    const url = new URL(target.href, "https://campus.invalid");
    if (url.origin !== "https://campus.invalid" || url.hash) return null;
    const href = campusDocumentHref(url.pathname, url.search);
    return href === target.href ? { owner, href, savedAt: target.savedAt } : null;
  } catch { return null; }
}
export function writeCampusReturn(storage: Pick<Storage, "setItem" | "removeItem"> | undefined, target: CampusReturnTarget | null): boolean {
  try {
    if (!storage) return false;
    if (!target) storage.removeItem(CAMPUS_RETURN_KEY);
    else {
      const encoded = JSON.stringify(target);
      const canonical = readCampusReturn({ getItem: () => encoded }, target.owner, target.savedAt);
      if (!canonical) return false;
      storage.setItem(CAMPUS_RETURN_KEY, JSON.stringify(canonical));
    }
    return true;
  } catch { return false; }
}
export function campusSessionStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; }
  catch { return undefined; }
}
