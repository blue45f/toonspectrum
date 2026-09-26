export function safeCharacterOnboardingDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/home";
  try {
    const url = new URL(value, "https://toonstudio.local");
    return url.origin === "https://toonstudio.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/home";
  } catch {
    return "/home";
  }
}
