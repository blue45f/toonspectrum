/** Trust only the reviewed generator, not arbitrary repositories hosted on GitHub. */
export const STUDIO_PREMIUM_WORLD_SOURCE_URL =
  "https://github.com/blue45f/toonspectrum/blob/main/scripts/blender/generate_studio_premium_world_v1.py";

const EXTERNAL_CC0_HOSTS = new Set(["kenney.nl", "ambientcg.com", "polyhaven.com"]);

export function isTrustedStudioCc0Source(provider: string, sourceUrl: string): boolean {
  try {
    const source = new URL(sourceUrl);
    if (source.protocol !== "https:" || source.username || source.password || source.port) return false;
    if (provider === "ToonSpectrum") return sourceUrl === STUDIO_PREMIUM_WORLD_SOURCE_URL;
    return EXTERNAL_CC0_HOSTS.has(source.hostname);
  } catch {
    return false;
  }
}
