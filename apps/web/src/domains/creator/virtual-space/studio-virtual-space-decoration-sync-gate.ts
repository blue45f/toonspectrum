import { createDefaultStudioVirtualDecorationTransport, createStudioVirtualDecorationSync } from "./studio-virtual-space-decoration-sync";

/**
 * 서버 동기화는 빌드 플래그로 켠다. 꺼져 있는 동안 공간은 지금과 똑같이 브라우저
 * localStorage만 쓴다. 서버가 사라지거나 되돌려야 할 때 사용자가 배치를 잃는 일을
 * 이 플래그가 막는다.
 */
export function studioVirtualSpaceSyncEnabled(env: Record<string, unknown> = import.meta.env): boolean {
  const raw = env.VITE_STUDIO_SPACE_SYNC;
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

let cached: ReturnType<typeof createStudioVirtualDecorationSync> | null = null;

export function studioVirtualSpaceDecorationSync() {
  cached ??= createStudioVirtualDecorationSync(createDefaultStudioVirtualDecorationTransport());
  return cached;
}
