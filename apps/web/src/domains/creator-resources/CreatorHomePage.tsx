import { CreatorExperienceModeSwitch } from "@/shared/components/CreatorExperienceModeSwitch";
import { useCreatorExperienceMode } from "@/shared/lib/creator-experience-mode";
import { CreatorFeatureReels } from "../marketing/CreatorFeatureReels";
import { CreatorHomeExperience } from "../marketing/CreatorHomeExperience";
import { CreatorVirtualStudioExperience } from "../marketing/CreatorVirtualStudioExperience";
import { BetaOpenEventBanner } from "../marketing/events/BetaOpenEventBanner";
import "../marketing/creator-home-experience-interactions.css";
import "../marketing/creator-home-visual-upgrade.css";
import "../marketing/creator-prism.css";

/** One creator journey: task-first home followed by a visual feature walkthrough. */
export function CreatorHomePage() {
  const mode = useCreatorExperienceMode((state) => state.mode);

  if (mode === "virtual-studio") {
    return (
      <>
        <BetaOpenEventBanner />
        <CreatorVirtualStudioExperience />
      </>
    );
  }

  return (
    <>
      <BetaOpenEventBanner />
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] right-3 z-[80] sm:bottom-auto sm:right-4 sm:top-20">
        <span className="sm:hidden"><CreatorExperienceModeSwitch compact /></span>
        <span className="hidden sm:inline"><CreatorExperienceModeSwitch /></span>
      </div>
      <CreatorHomeExperience />
      <CreatorFeatureReels />
    </>
  );
}
