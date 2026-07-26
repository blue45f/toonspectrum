import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceManifest,
} from "../../../../../lib/creator-marketplace-resource-contract";

export const CREATOR_MARKETPLACE_RESOURCE_REPOSITORY = Symbol(
  "CREATOR_MARKETPLACE_RESOURCE_REPOSITORY"
);

export interface CreatorMarketplaceResourceCursor {
  createdAt: Date;
  id: string;
}

export interface CreatorMarketplaceResourceListInput {
  publisherId?: string;
  viewerId?: string;
  limit: number;
  cursor: CreatorMarketplaceResourceCursor | null;
  search?: string;
  tag?: string;
  kind?: CreatorMarketplaceResourceKind;
  license?: CreatorMarketplaceResourceLicense;
}

export interface CreatorMarketplaceResourceStoredRow {
  id: string;
  publisherId: string;
  publisherName: string | null;
  publisherAvatar: string | null;
  manifest: CreatorMarketplaceResourceManifest;
  manifestHash: string;
  manifestByteSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatorMarketplaceResourcePublishInput {
  id: string;
  publisherId: string;
  manifest: CreatorMarketplaceResourceManifest;
  manifestHash: string;
  manifestByteSize: number;
}

export interface CreatorMarketplaceResourceRepository {
  list(
    input: CreatorMarketplaceResourceListInput
  ): Promise<readonly CreatorMarketplaceResourceStoredRow[]>;
  publish(
    input: CreatorMarketplaceResourcePublishInput
  ): Promise<CreatorMarketplaceResourceStoredRow>;
  deleteOwned(publisherId: string, id: string): Promise<boolean>;
}

export class CreatorMarketplaceResourceDuplicateError extends Error {
  constructor() {
    super("creator_marketplace_resource_duplicate");
    this.name = "CreatorMarketplaceResourceDuplicateError";
  }
}
