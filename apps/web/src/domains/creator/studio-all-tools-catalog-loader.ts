import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";

const loader = createStudioIntentLazyLoader(() => import("./StudioAllToolsCatalog"));
export const loadStudioAllToolsCatalog = loader.load;
export const preloadStudioAllToolsCatalog = loader.preload;
