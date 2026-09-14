import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";
import type { StudioAiSettings } from "./studio-ai-client";

/** Compatibility slot: one settings implementation and one credential owner. */
export function StudioAiSettingsPanel(_props: {
  settings: StudioAiSettings;
  onChange: (next: StudioAiSettings) => void;
}) {
  return <UnifiedAiSettings />;
}
