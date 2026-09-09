import { CreatorHomeExperience } from "../marketing/CreatorHomeExperience";
import "../marketing/creator-home-experience-interactions.css";

/**
 * The root route owns one coherent creator journey. Research and inspiration
 * destinations are integrated into the experience instead of being appended as
 * a disconnected second homepage.
 */
export function CreatorHomePage() {
  return <CreatorHomeExperience />;
}
