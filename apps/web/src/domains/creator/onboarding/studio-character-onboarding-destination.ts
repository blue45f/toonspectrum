export function safeCharacterOnboardingDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/home";
  try {
    const url = new URL(value, "https://toonspectrum.local");
    return url.origin === "https://toonspectrum.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/home";
  } catch {
    return "/home";
  }
}
