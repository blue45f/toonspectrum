function apiBase() {
  const env = import.meta.env.VITE_API_BASE?.replace(/\/$/, "");
  return env ?? "";
}

export function apiPath(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const rooted = clean.startsWith("/api/") || clean === "/api" ? clean : `/api${clean}`;
  return `${apiBase()}${rooted}`;
}
