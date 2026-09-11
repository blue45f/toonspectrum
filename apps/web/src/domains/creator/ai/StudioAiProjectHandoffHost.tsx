import { useEffect } from "react";

import { consumeStudioAiProjectHandoff } from "./studio-ai-project-handoff";
import type { StudioAiAssistToolId } from "./studio-ai-assist-ux";

export interface StudioAiProjectHandoffHostProps {
  readonly projectId: string | null | undefined;
  readonly setActiveTool: (tool: StudioAiAssistToolId) => void;
  readonly setBackgroundPrompt: (value: string) => void;
  readonly setCharacterPrompt: (value: string) => void;
  readonly setCompositionDraft: (value: string) => void;
  readonly setDialogueSituation: (value: string) => void;
  readonly setPaletteMood: (value: string) => void;
  readonly openAssistant: () => void;
}

/**
 * Consume one short-lived project request and project it onto the established editor AI hub.
 * The request is removed before callbacks run, so remounts and rendering errors cannot execute it twice.
 */
export function StudioAiProjectHandoffHost({
  projectId,
  setActiveTool,
  setBackgroundPrompt,
  setCharacterPrompt,
  setCompositionDraft,
  setDialogueSituation,
  setPaletteMood,
  openAssistant,
}: StudioAiProjectHandoffHostProps) {
  useEffect(() => {
    const normalizedProjectId = projectId?.trim();
    if (!normalizedProjectId || typeof window === "undefined") return;

    let handoff;
    try {
      handoff = consumeStudioAiProjectHandoff(window.sessionStorage, normalizedProjectId);
    } catch {
      return;
    }
    if (!handoff) return;

    switch (handoff.tool) {
      case "background":
        setBackgroundPrompt(handoff.prompt);
        break;
      case "character":
        setCharacterPrompt(handoff.prompt);
        break;
      case "composition":
        setCompositionDraft(handoff.prompt);
        break;
      case "dialogue":
        setDialogueSituation(handoff.prompt);
        break;
      case "palette":
        setPaletteMood(handoff.prompt);
        break;
    }
    setActiveTool(handoff.tool);
    openAssistant();
  }, [
    openAssistant,
    projectId,
    setActiveTool,
    setBackgroundPrompt,
    setCharacterPrompt,
    setCompositionDraft,
    setDialogueSituation,
    setPaletteMood,
  ]);

  return null;
}
