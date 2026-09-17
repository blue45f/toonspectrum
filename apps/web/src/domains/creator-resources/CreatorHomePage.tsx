import { CreatorFeatureReels } from "../marketing/CreatorFeatureReels";
import { CreatorHomeExperience } from "../marketing/CreatorHomeExperience";
import "../marketing/creator-home-experience-interactions.css";
import "../marketing/creator-home-visual-upgrade.css";
import "../marketing/creator-prism.css";

/** One creator journey: task-first home followed by a visual feature walkthrough. */
export function CreatorHomePage() {
  return (
    <>
      <CreatorHomeExperience />
      <CreatorFeatureReels />
    </>
  );
}
