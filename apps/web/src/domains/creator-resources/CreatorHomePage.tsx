import { CreatorHomeExperience } from "../marketing/CreatorHomeExperience";
import "../marketing/creator-home-experience-interactions.css";

import { ProductIntentStart } from "./ProductIntentStart";

/**
 * The root route starts with a purpose-first launcher, then keeps the richer
 * creator journey as the deeper product story. This preserves the proven
 * Studio/research continuity while removing feature-name hunting from the
 * first screen.
 */
export function CreatorHomePage() {
  return (
    <>
      <ProductIntentStart />
      <CreatorHomeExperience />
    </>
  );
}
