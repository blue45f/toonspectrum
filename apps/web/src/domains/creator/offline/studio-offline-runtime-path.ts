/** Studio-owned routes share one automatic offline-app runtime. */
export function isStudioOfflineRuntimePath(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}
