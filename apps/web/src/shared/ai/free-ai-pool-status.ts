import { api } from "@/platform/api";

export interface FreeAiPoolProviderStatus {
  id: "gemini" | "qwen" | "groq" | "sambanova" | "zai" | "mistral" | "cloudflare" | "openrouter" | "siliconflow" | "deepseek";
  label: string;
  configured: boolean;
  model: string;
}

export interface FreeAiPoolStatus {
  configured: boolean;
  provider: FreeAiPoolProviderStatus["id"] | "none";
  model: string;
  providers: FreeAiPoolProviderStatus[];
  selection: {
    default: "auto";
    order: FreeAiPoolProviderStatus["id"][];
    fallback: boolean;
    fallbackPolicy?: "free_quota_exhausted" | "billing_quota_exhausted";
  };
  requiresAuth: boolean;
  freePool?: boolean;
  settingsHref?: string;
  quota?: {
    enforced: boolean;
    timezone: "UTC";
    failureMode: "closed";
    dailyRequestLimit: number;
    dailyTokenLimit: number;
    globalDailyRequestLimit?: number;
    globalDailyTokenLimit?: number;
  };
}

export async function getFreeAiPoolStatus(signal?: AbortSignal): Promise<FreeAiPoolStatus> {
  return api.get<FreeAiPoolStatus>("/studio-ai/status", { signal });
}
