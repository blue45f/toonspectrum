import {
  and,
  desc,
  eq,
  isNull,
} from "drizzle-orm";
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";

import { findStarterMarketplaceResourceById } from "../../../../web/src/shared/lib/creator-marketplace-starter-catalog";
import {
  commerceEntitlements,
  commerceProductPrices,
  db,
} from "../../platform/database";
import { creatorMarketplaceLibraryItems } from "../../platform/database/creator-marketplace-library.schema";
import { creatorMarketplaceResources } from "../../platform/database/creator-marketplace-resource.schema";
import { getCommerceConfig } from "../../server/commerce-config";

export interface MarketplaceCommerceProduct {
  resourceId: string;
  publisherId: string;
  packageId: string;
  productId: string;
  productName: string;
}

function stableProductId(publisherId: string, packageId: string): string {
  return publisherId + "/" + packageId;
}

export async function resolveMarketplaceCommerceProduct(
  releaseId: string,
): Promise<MarketplaceCommerceProduct> {
  const starter = findStarterMarketplaceResourceById(releaseId);
  if (starter) {
    return {
      resourceId: starter.id,
      publisherId: starter.publisher.id,
      packageId: starter.packageId,
      productId: stableProductId(starter.publisher.id, starter.packageId),
      productName: starter.name,
    };
  }

  const [row] = await db.select({
    id: creatorMarketplaceResources.id,
    publisherId: creatorMarketplaceResources.publisherId,
    packageId: creatorMarketplaceResources.packageId,
    name: creatorMarketplaceResources.name,
    hidden: creatorMarketplaceResources.hidden,
    delistedAt: creatorMarketplaceResources.delistedAt,
  }).from(creatorMarketplaceResources)
    .where(eq(creatorMarketplaceResources.id, releaseId))
    .limit(1);

  if (!row || row.hidden || row.delistedAt) {
    throw new NotFoundException({
      code: "commerce_market_resource_unavailable",
      message: "구매할 수 있는 마켓 리소스를 찾을 수 없습니다.",
    });
  }

  const [head] = await db.select({
    id: creatorMarketplaceResources.id,
  }).from(creatorMarketplaceResources)
    .where(and(
      eq(creatorMarketplaceResources.publisherId, row.publisherId),
      eq(creatorMarketplaceResources.packageId, row.packageId),
      eq(creatorMarketplaceResources.hidden, false),
      isNull(creatorMarketplaceResources.delistedAt),
    ))
    .orderBy(desc(creatorMarketplaceResources.releaseOrdinal))
    .limit(1);
  if (!head || head.id !== row.id) {
    throw new ConflictException({
      code: "commerce_market_current_release_required",
      message: "현재 공개된 최신 버전에서 결제를 시작해 주세요.",
      currentReleaseId: head?.id ?? null,
    });
  }

  return {
    resourceId: row.id,
    publisherId: row.publisherId,
    packageId: row.packageId,
    productId: stableProductId(row.publisherId, row.packageId),
    productName: row.name,
  };
}

export async function resolveMarketplaceProductPrice(
  product: MarketplaceCommerceProduct,
): Promise<number> {
  const config = await getCommerceConfig();
  const [override] = await db.select({
    amount: commerceProductPrices.amount,
  }).from(commerceProductPrices)
    .where(and(
      eq(commerceProductPrices.productType, "market-resource"),
      eq(commerceProductPrices.productId, product.productId),
      eq(commerceProductPrices.active, true),
    ))
    .limit(1);
  return override?.amount ?? config.defaultMarketPriceKrw;
}

async function hasLegacyLibraryMembership(
  userId: string,
  product: MarketplaceCommerceProduct,
): Promise<boolean> {
  const [row] = await db.select({ id: creatorMarketplaceLibraryItems.id })
    .from(creatorMarketplaceLibraryItems)
    .where(and(
      eq(creatorMarketplaceLibraryItems.userId, userId),
      eq(creatorMarketplaceLibraryItems.publisherId, product.publisherId),
      eq(creatorMarketplaceLibraryItems.packageId, product.packageId),
    ))
    .limit(1);
  return Boolean(row);
}

export async function hasMarketplaceCommerceEntitlement(
  userId: string,
  product: MarketplaceCommerceProduct,
): Promise<boolean> {
  if (userId === product.publisherId) return true;
  if (await hasLegacyLibraryMembership(userId, product)) return true;
  const [row] = await db.select({ id: commerceEntitlements.id })
    .from(commerceEntitlements)
    .where(and(
      eq(commerceEntitlements.userId, userId),
      eq(commerceEntitlements.productType, "market-resource"),
      eq(commerceEntitlements.productId, product.productId),
      isNull(commerceEntitlements.revokedAt),
    ))
    .limit(1);
  return Boolean(row);
}

export interface MarketplaceAccessDecision {
  product: MarketplaceCommerceProduct;
  amount: number;
  operationMode: "free" | "paid";
  alreadyEntitled: boolean;
  checkoutRequired: boolean;
  policyNotice: string;
}

export async function resolveMarketplaceAccessDecision(
  releaseId: string,
  userId?: string | null,
): Promise<MarketplaceAccessDecision> {
  const product = await resolveMarketplaceCommerceProduct(releaseId);
  const config = await getCommerceConfig();
  if (config.operationMode === "free") {
    return {
      product,
      amount: 0,
      operationMode: "free",
      alreadyEntitled: false,
      checkoutRequired: false,
      policyNotice: config.freePolicyNotice,
    };
  }
  const amount = await resolveMarketplaceProductPrice(product);
  const alreadyEntitled = userId
    ? await hasMarketplaceCommerceEntitlement(userId, product)
    : false;
  return {
    product,
    amount,
    operationMode: "paid",
    alreadyEntitled,
    checkoutRequired: amount > 0 && !alreadyEntitled,
    policyNotice: config.paidPolicyNotice,
  };
}

export async function assertMarketplaceAcquisitionAllowed(
  userId: string,
  releaseId: string,
): Promise<void> {
  const decision = await resolveMarketplaceAccessDecision(releaseId, userId);
  if (!decision.checkoutRequired) return;
  throw new HttpException({
    code: "commerce_payment_required",
    message: "이 리소스는 결제 후 내 에셋에 추가할 수 있습니다.",
    amount: decision.amount,
    currency: "KRW",
    resourceId: decision.product.resourceId,
  }, 402);
}
