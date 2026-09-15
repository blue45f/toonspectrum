import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";

import type { StudioAiSettings } from "./studio-ai-client";

/**
 * Legacy props remain while the Studio host migrates, but every credential
 * surface now renders the single shared free-first settings owner.
 */
export function StudioAiSettingsPanel(props: {
  settings: StudioAiSettings;
  onChange: (next: StudioAiSettings) => void;
}) {
  void props;
  return <UnifiedAiSettings />;
}
