import { createHash, randomUUID } from "node:crypto";

import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  and,
  desc,
  eq,
  or,
} from "drizzle-orm";

import {
  isCommerceOrderStatus,
  type CommerceOrderPublicEntry,
} from "../../../../../packages/core/src/commerce";
import {
  commerceEntitlements,
  commerceOrders,
  commercePaymentEvents,
  commerceProductPrices,
  db,
} from "../../db";
import { isAdminUser } from "../../server/app-config";
import {
  getCommerceConfig,
  setCommerceConfig,
} from "../../server/commerce-config";
import { logAuditAction } from "../admin/admin-types";
import {
  cancelSupporterTossPayment,
  confirmSupporterTossPayment,
  querySupporterTossPayment,
  type SupporterTossPayment,
} from "../supporter-payment/supporter-toss.provider";
import { parseSupporterWebhookIdentity } from "../supporter-payment/supporter-payment-webhook";

import {
  resolveMarketplaceAccessDecision,
  resolveMarketplaceCommerceProduct,
} from "./commerce-market-policy";
import { resolveCommerceProviderRuntime } from "./commerce-runtime";

type CommerceOrderRow = typeof commerceOrders.$inferSelect;

interface CommerceOrderResponse extends CommerceOrderPublicEntry {
  clientKey: string | null;
  mockPaymentKey: string | null;
  paymentMethods: readonly string[];
  policyNotice: string;
}

function requireUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

function boundedString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function projectOrder(row: CommerceOrderRow): CommerceOrderPublicEntry {
  return {
    orderId: row.orderId,
    productType: row.productType,
    productId: row.productId,
    productName: row.productName,
    amount: row.amount,
    balanceAmount: row.balanceAmount,
    currency: "KRW",
    provider: row.provider,
    providerMode: row.providerMode,
    status: row.providerStatus,
    method: row.method,
    receiptUrl: row.receiptUrl,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
  };
}

function createOrderId(): string {
  return "TSM_" + Date.now().toString(36) + "_" + randomUUID().replaceAll("-", "").slice(0, 16);
}

function mockPaymentKey(): string {
  return "mock_" + randomUUID().replaceAll("-", "");
}

function eventHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function eventType(value: unknown): string {
  if (!value || typeof value !== "object") return "payment-sync";
  const type = boundedString((value as Record<string, unknown>).eventType, 80)
    || boundedString((value as Record<string, unknown>).type, 80);
  return type || "payment-sync";
}

@Injectable()
export class CommerceService {
  async getPublicConfig() {
    const config = await getCommerceConfig();
    const runtime = resolveCommerceProviderRuntime(config.provider);
    return {
      operationMode: config.operationMode,
      provider: config.provider,
      providerMode: runtime.providerMode,
      checkoutEnabled: config.operationMode === "paid" && runtime.checkoutEnabled,
      disabledReason: config.operationMode === "free" ? null : runtime.disabledReason,
      clientKey: runtime.clientKey,
      currency: "KRW" as const,
      paymentMethods: config.paymentMethods,
      defaultMarketPriceKrw: config.defaultMarketPriceKrw,
      policyNotice: config.operationMode === "free"
        ? config.freePolicyNotice
        : config.paidPolicyNotice,
      termsVersion: config.termsVersion,
    };
  }

  async getMarketplaceQuote(releaseId: string, userId?: string) {
    const [decision, config] = await Promise.all([
      resolveMarketplaceAccessDecision(releaseId, userId),
      getCommerceConfig(),
    ]);
    const runtime = resolveCommerceProviderRuntime(config.provider);
    return {
      resourceId: decision.product.resourceId,
      productId: decision.product.productId,
      productType: "market-resource" as const,
      productName: decision.product.productName,
      operationMode: decision.operationMode,
      checkoutRequired: decision.checkoutRequired,
      alreadyEntitled: decision.alreadyEntitled,
      amount: decision.amount,
      currency: "KRW" as const,
      provider: config.provider,
      providerMode: runtime.providerMode,
      checkoutEnabled: !decision.checkoutRequired || runtime.checkoutEnabled,
      disabledReason: decision.checkoutRequired ? runtime.disabledReason : null,
      paymentMethods: config.paymentMethods,
      policyNotice: decision.policyNotice,
    };
  }

  async createMarketplaceOrder(
    userIdValue: string | undefined,
    releaseId: string,
    input: unknown,
  ): Promise<CommerceOrderResponse> {
    const userId = requireUserId(userIdValue);
    const requestId = boundedString(
      input && typeof input === "object"
        ? (input as Record<string, unknown>).requestId
        : "",
      80,
    );
    if (!/^[0-9a-f-]{36}$/iu.test(requestId)) {
      throw new BadRequestException({
        code: "commerce_request_id_invalid",
        message: "결제 요청 식별자가 올바르지 않습니다.",
      });
    }
    const acceptedTerms = input && typeof input === "object"
      && (input as Record<string, unknown>).acceptedTerms === true;
    if (!acceptedTerms) {
      throw new BadRequestException({
        code: "commerce_terms_required",
        message: "결제 및 이용 정책 동의가 필요합니다.",
      });
    }

    const existing = await this.findByCreateKey(userId, requestId);
    if (existing) return this.orderResponse(existing);

    const [decision, config] = await Promise.all([
      resolveMarketplaceAccessDecision(releaseId, userId),
      getCommerceConfig(),
    ]);
    if (!decision.checkoutRequired) {
      throw new ConflictException({
        code: "commerce_checkout_not_required",
        message: "현재 이 리소스는 결제 없이 이용할 수 있습니다.",
      });
    }
    if (decision.amount < 1) {
      throw new ConflictException({
        code: "commerce_invalid_price",
        message: "유료 상품 가격이 올바르지 않습니다.",
      });
    }

    const runtime = resolveCommerceProviderRuntime(config.provider);
    if (!runtime.checkoutEnabled || !runtime.providerMode) {
      throw new ServiceUnavailableException({
        code: "commerce_checkout_unavailable",
        message: "결제 설정이 아직 준비되지 않았습니다.",
        reason: runtime.disabledReason,
      });
    }

    const id = randomUUID();
    const paymentKey = config.provider === "mock" ? mockPaymentKey() : null;
    const now = new Date();
    const row: typeof commerceOrders.$inferInsert = {
      id,
      orderId: createOrderId(),
      userId,
      productType: "market-resource",
      productId: decision.product.productId,
      resourceId: decision.product.resourceId,
      productName: decision.product.productName,
      amount: decision.amount,
      balanceAmount: decision.amount,
      currency: "KRW",
      provider: config.provider,
      providerMode: runtime.providerMode,
      providerStatus: "READY",
      paymentKey,
      termsVersion: config.termsVersion,
      createIdempotencyKey: requestId,
      confirmIdempotencyKey: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    try {
      const [created] = await db.insert(commerceOrders).values(row).returning();
      if (!created) throw new Error("commerce_order_insert_failed");
      return this.orderResponse(created);
    } catch (error) {
      const raced = await this.findByCreateKey(userId, requestId);
      if (raced) return this.orderResponse(raced);
      throw error;
    }
  }

  async listMyOrders(userIdValue: string | undefined) {
    const userId = requireUserId(userIdValue);
    const rows = await db.select().from(commerceOrders)
      .where(eq(commerceOrders.userId, userId))
      .orderBy(desc(commerceOrders.createdAt))
      .limit(100);
    return { items: rows.map(projectOrder) };
  }

  async confirm(
    userIdValue: string | undefined,
    input: unknown,
  ): Promise<CommerceOrderPublicEntry> {
    const userId = requireUserId(userIdValue);
    const source = input && typeof input === "object"
      ? input as Record<string, unknown>
      : {};
    const orderId = boundedString(source.orderId, 64);
    const paymentKey = boundedString(source.paymentKey, 200);
    const amount = Number(source.amount);
    if (!orderId || !paymentKey || !Number.isInteger(amount) || amount < 1) {
      throw new BadRequestException({
        code: "commerce_confirm_invalid",
        message: "결제 승인 정보가 올바르지 않습니다.",
      });
    }

    const row = await this.requireOwnedOrder(userId, orderId);
    if (amount !== row.amount) {
      throw new ConflictException({
        code: "commerce_amount_mismatch",
        message: "서버 주문 금액과 결제 승인 금액이 일치하지 않습니다.",
      });
    }
    if (row.providerStatus === "DONE") {
      await this.ensureEntitlement(row);
      return projectOrder(row);
    }
    if (row.paymentKey && row.paymentKey !== paymentKey) {
      throw new ConflictException({
        code: "commerce_payment_key_mismatch",
        message: "주문에 연결된 결제 식별자가 일치하지 않습니다.",
      });
    }

    const payment = row.provider === "mock"
      ? this.confirmMock(row, paymentKey)
      : await this.confirmToss(row, paymentKey);
    const updated = await this.applyVerifiedPayment(row, payment, false);
    return projectOrder(updated);
  }

  async handleTossWebhook(input: unknown): Promise<{ ok: true }> {
    const identity = parseSupporterWebhookIdentity(input);
    if (!identity) {
      throw new BadRequestException({
        code: "commerce_webhook_invalid",
        message: "결제 웹훅 식별 정보가 올바르지 않습니다.",
      });
    }
    const row = await this.findOrderByProviderIdentity(identity.orderId, identity.paymentKey);
    if (!row || row.provider !== "toss") {
      throw new NotFoundException({
        code: "commerce_order_not_found",
        message: "결제 주문을 찾을 수 없습니다.",
      });
    }

    const runtime = resolveCommerceProviderRuntime("toss");
    if (!runtime.tossConfig?.serverReady || !row.paymentKey && !identity.paymentKey) {
      throw new ServiceUnavailableException("결제 공급자 조회 설정이 준비되지 않았습니다.");
    }
    const paymentKey = row.paymentKey || identity.paymentKey;
    const payment = await querySupporterTossPayment({
      config: runtime.tossConfig,
      paymentKey,
    });
    const updated = await this.applyVerifiedPayment(row, payment, true);
    const hash = eventHash(input);
    await db.insert(commercePaymentEvents).values({
      id: randomUUID(),
      orderId: updated.id,
      provider: "toss",
      eventKey: hash,
      eventType: eventType(input),
      verified: true,
      payloadHash: hash,
      createdAt: new Date(),
    }).onConflictDoNothing();
    return { ok: true };
  }

  async getAdminSettings(userId: string | undefined) {
    await this.requireAdmin(userId);
    const config = await getCommerceConfig();
    const runtime = resolveCommerceProviderRuntime(config.provider);
    return {
      ...config,
      providerMode: runtime.providerMode,
      checkoutEnabled: runtime.checkoutEnabled,
      disabledReason: runtime.disabledReason,
    };
  }

  async updateAdminSettings(userIdValue: string | undefined, input: unknown) {
    const userId = await this.requireAdmin(userIdValue);
    const next = await setCommerceConfig(input);
    void logAuditAction(userId, "COMMERCE_SETTINGS_UPDATE", "system", null, {
      operationMode: next.operationMode,
      provider: next.provider,
      defaultMarketPriceKrw: next.defaultMarketPriceKrw,
      paymentMethods: next.paymentMethods,
    });
    return this.getAdminSettings(userId);
  }

  async listAdminOrders(userId: string | undefined) {
    await this.requireAdmin(userId);
    const rows = await db.select().from(commerceOrders)
      .orderBy(desc(commerceOrders.createdAt))
      .limit(200);
    return { items: rows.map(projectOrder) };
  }

  async setMarketplacePrice(
    userIdValue: string | undefined,
    releaseId: string,
    input: unknown,
  ) {
    const userId = await this.requireAdmin(userIdValue);
    const amount = Number(
      input && typeof input === "object"
        ? (input as Record<string, unknown>).amount
        : NaN,
    );
    if (!Number.isInteger(amount) || amount < 0 || amount > 10_000_000) {
      throw new BadRequestException("가격은 0원 이상 10,000,000원 이하 정수여야 합니다.");
    }
    const product = await resolveMarketplaceCommerceProduct(releaseId);
    const now = new Date();
    await db.insert(commerceProductPrices).values({
      id: randomUUID(),
      productType: "market-resource",
      productId: product.productId,
      amount,
      currency: "KRW",
      active: true,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [commerceProductPrices.productType, commerceProductPrices.productId],
      set: {
        amount,
        active: true,
        updatedBy: userId,
        updatedAt: now,
      },
    });
    void logAuditAction(userId, "COMMERCE_MARKET_PRICE_UPDATE", "market-resource", releaseId, {
      productId: product.productId,
      amount,
    });
    return { ok: true, resourceId: releaseId, productId: product.productId, amount, currency: "KRW" };
  }

  async cancelAdminOrder(
    userIdValue: string | undefined,
    orderId: string,
    input: unknown,
  ): Promise<CommerceOrderPublicEntry> {
    const adminId = await this.requireAdmin(userIdValue);
    const [row] = await db.select().from(commerceOrders)
      .where(eq(commerceOrders.orderId, orderId)).limit(1);
    if (!row) throw new NotFoundException("결제 주문을 찾을 수 없습니다.");
    if (row.providerStatus === "CANCELED") return projectOrder(row);
    if (row.providerStatus !== "DONE" && row.providerStatus !== "PARTIAL_CANCELED") {
      throw new ConflictException("승인 완료된 결제만 환불할 수 있습니다.");
    }
    const reason = boundedString(
      input && typeof input === "object"
        ? (input as Record<string, unknown>).reason
        : "",
      200,
    ) || "관리자 요청 환불";
    const cancelKey = row.cancelIdempotencyKey || randomUUID();

    let payment: SupporterTossPayment;
    if (row.provider === "mock") {
      payment = {
        paymentKey: row.paymentKey || mockPaymentKey(),
        orderId: row.orderId,
        orderName: row.productName,
        status: "CANCELED",
        currency: "KRW",
        totalAmount: row.amount,
        balanceAmount: 0,
        method: "mock",
        approvedAt: row.approvedAt?.toISOString() ?? null,
        cancels: [{
          cancelAmount: row.amount,
          cancelReason: reason,
          canceledAt: new Date().toISOString(),
        }],
      };
    } else {
      if (!row.paymentKey) throw new ConflictException("결제 공급자 키가 없습니다.");
      const runtime = resolveCommerceProviderRuntime("toss");
      if (!runtime.tossConfig?.serverReady) {
        throw new ServiceUnavailableException("결제 공급자 취소 설정이 준비되지 않았습니다.");
      }
      payment = await cancelSupporterTossPayment({
        config: runtime.tossConfig,
        paymentKey: row.paymentKey,
        reason,
        idempotencyKey: cancelKey,
      });
    }

    await db.update(commerceOrders).set({
      cancelIdempotencyKey: cancelKey,
      cancelReason: reason,
      updatedAt: new Date(),
    }).where(eq(commerceOrders.id, row.id));
    const current = { ...row, cancelIdempotencyKey: cancelKey, cancelReason: reason };
    const updated = await this.applyVerifiedPayment(current, payment, false);
    void logAuditAction(adminId, "COMMERCE_PAYMENT_CANCEL", "commerce-order", orderId, {
      reason,
      amount: row.amount,
      provider: row.provider,
    });
    return projectOrder(updated);
  }

  private async requireAdmin(userId: string | undefined): Promise<string> {
    const normalized = requireUserId(userId);
    if (!await isAdminUser(normalized)) {
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }
    return normalized;
  }

  private async findByCreateKey(userId: string, requestId: string) {
    const [row] = await db.select().from(commerceOrders)
      .where(and(
        eq(commerceOrders.userId, userId),
        eq(commerceOrders.createIdempotencyKey, requestId),
      ))
      .limit(1);
    return row ?? null;
  }

  private async requireOwnedOrder(userId: string, orderId: string): Promise<CommerceOrderRow> {
    const [row] = await db.select().from(commerceOrders)
      .where(and(
        eq(commerceOrders.userId, userId),
        eq(commerceOrders.orderId, orderId),
      ))
      .limit(1);
    if (!row) {
      throw new NotFoundException({
        code: "commerce_order_not_found",
        message: "결제 주문을 찾을 수 없습니다.",
      });
    }
    return row;
  }

  private async findOrderByProviderIdentity(orderId: string, paymentKey: string) {
    const predicates = [];
    if (orderId) predicates.push(eq(commerceOrders.orderId, orderId));
    if (paymentKey) predicates.push(eq(commerceOrders.paymentKey, paymentKey));
    if (!predicates.length) return null;
    const [row] = await db.select().from(commerceOrders)
      .where(predicates.length === 1 ? predicates[0] : or(...predicates))
      .limit(1);
    return row ?? null;
  }

  private async orderResponse(row: CommerceOrderRow): Promise<CommerceOrderResponse> {
    const config = await getCommerceConfig();
    const runtime = resolveCommerceProviderRuntime(row.provider);
    return {
      ...projectOrder(row),
      clientKey: row.provider === "toss" ? runtime.clientKey : null,
      mockPaymentKey: row.provider === "mock" ? row.paymentKey : null,
      paymentMethods: config.paymentMethods,
      policyNotice: config.paidPolicyNotice,
    };
  }

  private confirmMock(row: CommerceOrderRow, paymentKey: string): SupporterTossPayment {
    const runtime = resolveCommerceProviderRuntime("mock");
    if (!runtime.checkoutEnabled || !row.paymentKey || row.paymentKey !== paymentKey) {
      throw new ForbiddenException({
        code: "commerce_mock_payment_forbidden",
        message: "개발용 모의 결제를 사용할 수 없습니다.",
      });
    }
    return {
      paymentKey,
      orderId: row.orderId,
      orderName: row.productName,
      status: "DONE",
      currency: "KRW",
      totalAmount: row.amount,
      balanceAmount: row.amount,
      method: "mock",
      approvedAt: new Date().toISOString(),
      receipt: null,
    };
  }

  private async confirmToss(
    row: CommerceOrderRow,
    paymentKey: string,
  ): Promise<SupporterTossPayment> {
    const runtime = resolveCommerceProviderRuntime("toss");
    if (!runtime.tossConfig?.serverReady) {
      throw new ServiceUnavailableException({
        code: "commerce_provider_unavailable",
        message: "결제 공급자 승인 설정이 준비되지 않았습니다.",
      });
    }
    return confirmSupporterTossPayment({
      config: runtime.tossConfig,
      paymentKey,
      orderId: row.orderId,
      amount: row.amount,
      idempotencyKey: row.confirmIdempotencyKey,
    });
  }

  private assertPaymentMatchesOrder(
    row: CommerceOrderRow,
    payment: SupporterTossPayment,
  ): void {
    if (
      payment.orderId !== row.orderId
      || payment.totalAmount !== row.amount
      || payment.currency !== "KRW"
      || !payment.paymentKey
      || (row.paymentKey && row.paymentKey !== payment.paymentKey)
    ) {
      throw new BadGatewayException({
        code: "commerce_provider_payload_mismatch",
        message: "결제 공급자 응답과 서버 주문이 일치하지 않습니다.",
      });
    }
    if (!isCommerceOrderStatus(payment.status)) {
      throw new BadGatewayException({
        code: "commerce_provider_status_unknown",
        message: "지원하지 않는 결제 상태가 반환되었습니다.",
      });
    }
  }

  private async applyVerifiedPayment(
    row: CommerceOrderRow,
    payment: SupporterTossPayment,
    webhookVerified: boolean,
  ): Promise<CommerceOrderRow> {
    this.assertPaymentMatchesOrder(row, payment);
    const status = payment.status;
    const balanceAmount = Math.max(
      0,
      Math.min(
        row.amount,
        payment.balanceAmount ?? (status === "CANCELED" ? 0 : row.amount),
      ),
    );
    const lastCancel = payment.cancels?.at(-1);
    const canceledAt = parseDate(lastCancel?.canceledAt)
      ?? (status === "CANCELED" ? new Date() : row.canceledAt);
    const now = new Date();
    const [updated] = await db.update(commerceOrders).set({
      providerStatus: status,
      paymentKey: payment.paymentKey,
      balanceAmount,
      method: boundedString(payment.method, 80),
      receiptUrl: boundedString(payment.receipt?.url, 1_000),
      approvedAt: parseDate(payment.approvedAt) ?? row.approvedAt,
      canceledAt,
      webhookVerifiedAt: webhookVerified ? now : row.webhookVerifiedAt,
      updatedAt: now,
    }).where(eq(commerceOrders.id, row.id)).returning();
    if (!updated) throw new Error("commerce_order_update_failed");

    if (status === "DONE" || (status === "PARTIAL_CANCELED" && balanceAmount > 0)) {
      await this.ensureEntitlement(updated);
    } else if (status === "CANCELED" || balanceAmount === 0) {
      await this.revokeEntitlement(updated);
    }
    return updated;
  }

  private async ensureEntitlement(row: CommerceOrderRow): Promise<void> {
    const now = new Date();
    await db.insert(commerceEntitlements).values({
      id: randomUUID(),
      userId: row.userId,
      productType: row.productType,
      productId: row.productId,
      sourceOrderId: row.id,
      grantedAt: row.approvedAt ?? now,
      revokedAt: null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [
        commerceEntitlements.userId,
        commerceEntitlements.productType,
        commerceEntitlements.productId,
      ],
      set: {
        sourceOrderId: row.id,
        grantedAt: row.approvedAt ?? now,
        revokedAt: null,
        updatedAt: now,
      },
    });
  }

  private async revokeEntitlement(row: CommerceOrderRow): Promise<void> {
    const now = new Date();
    await db.update(commerceEntitlements).set({
      revokedAt: now,
      updatedAt: now,
    }).where(and(
      eq(commerceEntitlements.userId, row.userId),
      eq(commerceEntitlements.productType, row.productType),
      eq(commerceEntitlements.productId, row.productId),
    ));
  }
}
