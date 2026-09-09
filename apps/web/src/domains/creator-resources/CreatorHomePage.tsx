import { CreatorHomeExperience } from "../marketing/CreatorHomeExperience";

/**
 * The root route owns one coherent creator journey. Research and inspiration
 * destinations are integrated into the experience instead of being appended as
 * a disconnected second homepage.
 */
export function CreatorHomePage() {
  return <CreatorHomeExperience />;
}
