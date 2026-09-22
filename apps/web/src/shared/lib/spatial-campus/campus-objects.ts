export interface CampusObject {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly thumbnail?: string;
}
const PUBLIC_OBJECT_PATH = /^\/(?:market\/resource|title|showcase\/(?:work|series))\/[A-Za-z0-9_%~-]+\/?$/u;
/** Only a small, read-only projection of already visible public records enters the scene. */
export function campusPublicObjects(input: readonly CampusObject[]): readonly CampusObject[] {
  const seen = new Set<string>();
  return input.slice(0, 24).flatMap((item) => {
    if (!item || typeof item.id !== "string" || seen.has(item.id) || item.id.length > 180
      || typeof item.title !== "string" || !item.title.trim() || item.title.length > 300
      || !PUBLIC_OBJECT_PATH.test(item.href)) return [];
    try {
      const segment = decodeURIComponent(item.href.split("/").filter(Boolean).at(-1)!);
      if (segment === "." || segment === ".." || /[\\/%]/u.test(segment)
        || [...segment].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return [];
    } catch { return []; }
    seen.add(item.id);
    let thumbnail: string | undefined;
    if (item.thumbnail && /^\/(?:assets|brand)\/[A-Za-z0-9_./~-]+$/u.test(item.thumbnail)
      && !item.thumbnail.split("/").includes("..")) thumbnail = item.thumbnail;
    return [{ id: item.id, title: item.title, href: item.href, ...(thumbnail ? { thumbnail } : {}) }];
  });
}
