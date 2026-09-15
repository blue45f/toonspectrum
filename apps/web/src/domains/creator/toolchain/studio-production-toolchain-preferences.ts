import {
  studioToolchainProfileIdSchema,
  type StudioToolchainProfileId,
} from "./studio-production-toolchain";

const PROFILE_KEY = "toonstudio:production-toolchain-profile-v1";

export function loadStudioToolchainProfile(): StudioToolchainProfileId {
  if (typeof sessionStorage === "undefined") return "open";
  const raw = sessionStorage.getItem(PROFILE_KEY);
  const parsed = studioToolchainProfileIdSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  sessionStorage.removeItem(PROFILE_KEY);
  return "open";
}

export function saveStudioToolchainProfile(profile: StudioToolchainProfileId): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PROFILE_KEY, studioToolchainProfileIdSchema.parse(profile));
}
