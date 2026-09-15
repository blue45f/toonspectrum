import type { StudioAiSettings } from "./studio-ai-client";
import { UnifiedAiSettingsEditor } from "./UnifiedAiSettingsEditor";

/** Studio popover and the standalone page share the same credential editor and storage contract. */
export function StudioAiSettingsPanel({
  settings,
  onChange,
}: {
  settings: StudioAiSettings;
  onChange: (next: StudioAiSettings) => void;
}) {
  return <UnifiedAiSettingsEditor compact studioSettings={settings} onStudioSettingsChange={onChange} />;
}
