export type ExperienceMode = "vivid" | "calm";
export type ExperienceLocale = "ko" | "en";
export const EXPERIENCE_MODE_KEY = "toonstudio:site-experience:v1";

export function parseExperienceMode(value: string | null): ExperienceMode {
  return value === "calm" ? "calm" : "vivid";
}

/** Editors and administrative tools never inherit promotional chrome or effects. */
export function supportsSiteExperience(pathname: string): boolean {
  const path = pathname.replace(/\/+$/u, "").toLowerCase() || "/";
  return !/^\/(?:studio|shaper|brush-lab|music|admin)(?:\/|$)/u.test(path);
}

