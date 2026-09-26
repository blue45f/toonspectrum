import { getAuthorData } from "../../../../../packages/core/src/catalog/author";
import {
  getCreatorPublicProfile,
} from "../../server/creator/follows";
import { getSeries } from "../../server/creator/series";
import { getWork } from "../../server/creator/works";
import { getFanPost } from "../../server/community";
import { getGovernedCafeBySlug } from "../../server/community-governance";
import { CollaborationService } from "../collaboration/collaboration.service";
import { PromotionService } from "../promotion/promotion.service";

import type { PublicShareOgReaders } from "./og-public-share";

const collaboration = new CollaborationService();
const promotion = new PromotionService();

/**
 * First-party public metadata readers used only by crawler OG rendering.
 * Every adapter reuses the same visibility authority as its public page.
 */
export const PUBLIC_SHARE_OG_READERS: PublicShareOgReaders = {
  readCreatorWork: (identifier) => getWork(identifier),
  readCreatorSeries: (identifier) => getSeries(identifier),
  readCreatorProfile: (identifier) => getCreatorPublicProfile(identifier),
  readCatalogAuthor: (identifier) => getAuthorData(encodeURIComponent(identifier)),
  readCommunityPost: (identifier) => getFanPost(identifier),
  readCommunityCafe: (identifier) => getGovernedCafeBySlug(identifier, null),
  readCollaborationPost: async (identifier) =>
    (await collaboration.detail(identifier)).post,
  readPromotionPost: async (identifier) =>
    (await promotion.detail(identifier)).post,
};
