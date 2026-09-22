import {
  ENGINEERING_ADVANCED_CHAPTERS,
  ENGINEERING_ADVANCED_GUIDES,
} from "./engineering-story-advanced-content";
import {
  ALL_ENGINEERING_CHAPTERS as CORE_ENGINEERING_CHAPTERS,
  ALL_ENGINEERING_GUIDES as CORE_ENGINEERING_GUIDES,
  type EngineeringChapter,
  type EngineeringGuide,
} from "./engineering-story-content";

/**
 * Public aggregate used by story and guide surfaces. The original content module remains the
 * stable type/status source while new topical chapters can evolve in independent modules.
 */
export const PUBLISHED_ENGINEERING_CHAPTERS = [
  ...CORE_ENGINEERING_CHAPTERS,
  ...ENGINEERING_ADVANCED_CHAPTERS,
] as const satisfies readonly EngineeringChapter[];

export const PUBLISHED_ENGINEERING_GUIDES = [
  ...CORE_ENGINEERING_GUIDES,
  ...ENGINEERING_ADVANCED_GUIDES,
] as const satisfies readonly EngineeringGuide[];
