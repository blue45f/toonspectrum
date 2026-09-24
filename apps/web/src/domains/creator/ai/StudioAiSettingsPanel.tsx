import { UnifiedAiSettingsEntryCard } from "@/shared/ai/UnifiedAiSettings";

import type { StudioAiSettings } from "./studio-ai-client";

/**
 * Legacy props remain while the Studio host migrates. Embedded tools expose status and one
 * canonical settings entry instead of mounting the full credential editor in every popover.
 */
export function StudioAiSettingsPanel(props: {
  settings: StudioAiSettings;
  onChange: (next: StudioAiSettings) => void;
}) {
  void props;
  return (
    <UnifiedAiSettingsEntryCard
      source="studio"
      title="AI 어시스트 설정"
      description="키 연결, 자동 무료 AI와 기능별 사용 순서는 통합 AI 설정에서 관리해요."
    />
  );
}
