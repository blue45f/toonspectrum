import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

/** One shared, retryable request. Importing this facade never loads the six assistant tools. */
export const studioWebtoonAssistantLoader = createStudioIntentLazyLoader(
  () => import("./StudioWebtoonAssistantContent"),
);
