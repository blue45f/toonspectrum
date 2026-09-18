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
      <div className="fixed right-4 top-20 z-[80] hidden sm:block">
        <CreatorExperienceModeSwitch />
      </div>
      <CreatorHomeExperience />
      <CreatorFeatureReels />
    </>
  );
}
