import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import {
  SUPPORTER_DEFAULT_MONTHLY_GOAL_WON,
  SUPPORTER_PAYMENT_MAX_WON,
  SUPPORTER_PAYMENT_MIN_WON,
  SUPPORTER_PAYMENT_PRESETS_WON,
  SUPPORTER_TERMS_VERSION,
  isSupporterPaymentStatus,
  supporterPaymentListLimit,
  validateSupporterCancelReason,
  validateSupporterGoalAmount,
  validateSupporterPaymentConfirmInput,
  validateSupporterPaymentCreateInput,
  validateSupporterPublicWallEnabled,
  type PublicSupporterWallEntry,
  type SupporterFundingSummary,
  type SupporterPaymentPublicEntry,
  type SupporterPaymentStatus,
} from "../../../../../packages/core/src/supporter-payment";
import {
  db,
  supporterFundingSettings,
  supporterPayments,
} from "../../db";
import { isOfficialUser } from "../../server/feedback";
import { ProductionExternalHttpError } from "../production-collaboration/production-integration-http";

import { resolveSupporterPaymentConfig } from "./supporter-payment.config";
import { parseSupporterWebhookIdentity } from "./supporter-payment-webhook";
import {
  cancelSupporterTossPayment,
  confirmSupporterTossPayment,
  querySupporterTossPayment,
  type SupporterTossPayment,
} from "./supporter-toss.provider";

const ORDER_NAME = "ToonSpectrum 운영비 후원";
const ORDER_WINDOW_MS = 10 * 60 * 1000;
const MAX_ORDERS_PER_WINDOW = 300;
const PUBLIC_WALL_LIMIT = 24;

type SupporterPaymentRow = typeof supporterPayments.$inferSelect;
function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function safeReceiptUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}

function latestCanceledAt(payment: SupporterTossPayment): Date | null {
  const values = (payment.cancels ?? [])
    .map((entry) => dateOrNull(entry.canceledAt))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.valueOf() - a.valueOf());
  return values[0] ?? null;
}

function toPublic(row: SupporterPaymentRow): SupporterPaymentPublicEntry {
  return {
    orderId: row.orderId,
    amount: row.amount,
    currency: "KRW",
    status: row.providerStatus,
    mode: row.mode,
    method: row.method,
    receiptUrl: row.receiptUrl,
    canResync: Boolean(row.paymentKey),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
  };
}

function toAdmin(row: SupporterPaymentRow) {
  return {
    id: row.id,
    orderId: row.orderId,
    amount: row.amount,
    balanceAmount: row.balanceAmount,
    currency: row.currency,
    status: row.providerStatus,
    mode: row.mode,
    supporterName: row.visibility === "name" ? row.supporterName : "",
    visibility: row.visibility,
    showAmount: row.showAmount,
    showMessage: row.showMessage,
    publicHidden: row.publicHidden,
    message: row.message,
    method: row.method,
    receiptUrl: row.receiptUrl,
    cancelReason: row.cancelReason,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    webhookVerifiedAt: row.webhookVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
type VerifiedSupporterTossPayment = SupporterTossPayment & { readonly status: SupporterPaymentStatus };
function assertPaymentMatches(
  row: SupporterPaymentRow,
  payment: SupporterTossPayment,
): asserts payment is VerifiedSupporterTossPayment {
  if (payment.orderId !== row.orderId
    || payment.totalAmount !== row.amount
    || payment.currency !== "KRW"
    || !isSupporterPaymentStatus(payment.status)) {
    throw new Error("supporter_payment_provider_mismatch");
  }
}

function kstMonthWindow(now = new Date()) {
  const kst = new Date(now.valueOf() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const monthIndex = kst.getUTCMonth();
  const offsetMs = 9 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(year, monthIndex, 1) - offsetMs);
  const end = new Date(Date.UTC(year, monthIndex + 1, 1) - offsetMs);
  return {
    start,
    end,
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
  };
}

@Injectable()
export class SupporterPaymentService {
  getPublicConfig() {
    const config = resolveSupporterPaymentConfig();
    return {
      enabled: config.checkoutEnabled,
      mode: config.checkoutEnabled ? config.mode : null,
      clientKey: config.checkoutEnabled ? config.clientKey : null,
      disabledReason: config.disabledReason,
      currency: "KRW" as const,
      minAmount: SUPPORTER_PAYMENT_MIN_WON,
      maxAmount: SUPPORTER_PAYMENT_MAX_WON,
      presets: SUPPORTER_PAYMENT_PRESETS_WON,
      orderName: ORDER_NAME,
    };
  }

  async getPublicFundingSummary(): Promise<SupporterFundingSummary> {
    const config = resolveSupporterPaymentConfig();
    const settings = await this.getFundingSettings();
    const { start, end, month } = kstMonthWindow();
    if (!config.mode) {
      return {
        month,
        goalAmount: settings.monthlyGoalAmount,
        supportedAmount: 0,
        progressPercent: 0,
        supporterCount: 0,
        publicWallEnabled: settings.publicWallEnabled,
        mode: null,
      };
    }
    const [summary] = await db
      .select({
        supportedAmount: sql<number>`coalesce(sum(${supporterPayments.balanceAmount}), 0)::int`,
        supporterCount: sql<number>`count(*)::int`,
      })
      .from(supporterPayments)
      .where(and(
        eq(supporterPayments.mode, config.mode),
        inArray(supporterPayments.providerStatus, ["DONE", "PARTIAL_CANCELED"]),
        gte(supporterPayments.approvedAt, start),
        lt(supporterPayments.approvedAt, end),
      ));
    const supportedAmount = summary?.supportedAmount ?? 0;
    const goalAmount = settings.monthlyGoalAmount;
    return {
      month,
      goalAmount,
      supportedAmount,
      progressPercent: goalAmount > 0
        ? Math.min(999, Math.round((supportedAmount / goalAmount) * 100))
        : 0,
      supporterCount: summary?.supporterCount ?? 0,
      publicWallEnabled: settings.publicWallEnabled,
      mode: config.mode,
    };
  }

  async listPublicSupporters(limitValue: unknown): Promise<PublicSupporterWallEntry[]> {
    const config = resolveSupporterPaymentConfig();
    const settings = await this.getFundingSettings();
    if (!settings.publicWallEnabled || !config.mode) return [];
    const limit = Math.min(PUBLIC_WALL_LIMIT, supporterPaymentListLimit(limitValue));
    const rows = await db
      .select()
      .from(supporterPayments)
      .where(and(
        eq(supporterPayments.mode, config.mode),
        eq(supporterPayments.visibility, "name"),
        eq(supporterPayments.publicHidden, false),
        inArray(supporterPayments.providerStatus, ["DONE", "PARTIAL_CANCELED"]),
        isNotNull(supporterPayments.approvedAt),
      ))
      .orderBy(desc(supporterPayments.approvedAt))
      .limit(limit);
    return rows
      .filter((row) => row.supporterName.trim().length >= 2)
      .map((row) => ({
        displayName: row.supporterName,
        amount: row.showAmount ? row.balanceAmount : null,
        message: row.showMessage ? row.message : "",
        supportedAt: (row.approvedAt ?? row.createdAt).toISOString(),
      }));
  }

  async createOrder(input: unknown) {
    const config = resolveSupporterPaymentConfig();
    if (!config.checkoutEnabled || !config.mode || !config.clientKey) {
      throw new ServiceUnavailableException("운영비 후원 결제가 현재 활성화되어 있지 않아요.");
    }
    const validated = validateSupporterPaymentCreateInput(input);
    if (!validated.ok) throw new BadRequestException(validated.error);
    if (validated.spam || !validated.value) return { received: true } as const;

    const recentCutoff = new Date(Date.now() - ORDER_WINDOW_MS);
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supporterPayments)
      .where(gte(supporterPayments.createdAt, recentCutoff));
    if ((countRow?.count ?? 0) >= MAX_ORDERS_PER_WINDOW) {
      throw new HttpException(
        "결제 요청이 많아요. 잠시 후 다시 시도해 주세요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const value = validated.value;
    const now = new Date();
    const orderId = `TS_SUPPORT_${randomUUID().replaceAll("-", "")}`;
    await db.insert(supporterPayments).values({
      id: randomUUID(),
      orderId,
      amount: value.amount,
      balanceAmount: value.amount,
      currency: "KRW",
      orderName: ORDER_NAME,
      supporterName: value.supporterName,
      message: value.message,
      visibility: value.visibility,
      showAmount: value.showAmount,
      showMessage: value.showMessage,
      termsVersion: SUPPORTER_TERMS_VERSION,
      mode: config.mode,
      providerStatus: "READY",
      confirmIdempotencyKey: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });

    return {
      orderId,
      orderName: ORDER_NAME,
      amount: value.amount,
      currency: "KRW" as const,
      mode: config.mode,
      clientKey: config.clientKey,
    };
  }

  async getOrderStatus(orderIdValue: string): Promise<SupporterPaymentPublicEntry> {
    const orderId = orderIdValue.trim();
    if (!/^[A-Za-z0-9_-]{6,64}$/u.test(orderId)) {
      throw new BadRequestException("주문번호를 확인해 주세요.");
    }
    const [row] = await db.select().from(supporterPayments)
      .where(eq(supporterPayments.orderId, orderId)).limit(1);
    if (!row) throw new NotFoundException("후원 주문을 찾을 수 없어요.");
    return toPublic(row);
  }
  async confirm(input: unknown): Promise<SupporterPaymentPublicEntry> {
    const validated = validateSupporterPaymentConfirmInput(input);
    if (!validated.ok) throw new BadRequestException(validated.error);
    const { paymentKey, orderId, amount } = validated.value;
    const [row] = await db.select().from(supporterPayments)
      .where(eq(supporterPayments.orderId, orderId)).limit(1);
    if (!row) throw new NotFoundException("후원 주문을 찾을 수 없어요.");
    if (row.amount !== amount) {
      throw new BadRequestException("결제 금액이 주문 금액과 일치하지 않아요.");
    }
    if (row.paymentKey && row.paymentKey !== paymentKey) {
      throw new BadRequestException("주문의 결제 키가 일치하지 않아요.");
    }
    if ((row.providerStatus === "DONE" || row.providerStatus === "WAITING_FOR_DEPOSIT")
      && row.paymentKey === paymentKey) {
      return toPublic(row);
    }

    const config = this.configForRow(row);
    let payment: SupporterTossPayment;
    try {
      payment = await confirmSupporterTossPayment({
        config,
        paymentKey,
        orderId,
        amount: row.amount,
        idempotencyKey: row.confirmIdempotencyKey,
      });
    } catch (error) {
      if (!(error instanceof ProductionExternalHttpError) || !error.uncertain) {
        throw new BadRequestException("결제 승인에 실패했어요. 결제 상태를 확인해 주세요.");
      }
      try {
        payment = await querySupporterTossPayment({ config, paymentKey });
      } catch {
        throw new ServiceUnavailableException(
          "결제 승인 결과를 확인하고 있어요. 잠시 후 다시 시도해 주세요.",
        );
      }
    }
    if (payment.paymentKey !== paymentKey) {
      throw new BadRequestException("결제 응답을 확인할 수 없어요.");
    }
    return this.reconcile(row, payment, false);
  }

  async receiveTossWebhook(input: unknown) {
    const identity = parseSupporterWebhookIdentity(input);
    if (!identity) return { received: true } as const;
    const { orderId, paymentKey } = identity;
    const conditions = [];
    if (orderId) conditions.push(eq(supporterPayments.orderId, orderId));
    if (paymentKey) conditions.push(eq(supporterPayments.paymentKey, paymentKey));
    const [row] = await db.select().from(supporterPayments)
      .where(conditions.length === 2 ? or(conditions[0], conditions[1]) : conditions[0])
      .limit(1);
    if (!row) return { received: true } as const;

    const key = paymentKey || row.paymentKey || "";
    if (!key) return { received: true } as const;
    const payment = await querySupporterTossPayment({
      config: this.configForRow(row),
      paymentKey: key,
    });
    await this.reconcile(row, payment, true);
    return { received: true } as const;
  }

  async listForAdmin(
    userId: string,
    statusValue: unknown,
    modeValue: unknown,
    queryValue: unknown,
    limitValue: unknown,
  ) {
    await this.requireOperator(userId);
    const status = statusValue === undefined || statusValue === "" ? null : statusValue;
    if (status !== null && !isSupporterPaymentStatus(status)) {
      throw new BadRequestException("결제 상태 필터를 확인해 주세요.");
    }
    const mode = modeValue === "test" || modeValue === "live" ? modeValue : null;
    if (modeValue && !mode) throw new BadRequestException("결제 환경 필터를 확인해 주세요.");
    const query = typeof queryValue === "string" ? queryValue.trim().slice(0, 80) : "";
    const conditions = [];
    if (status) conditions.push(eq(supporterPayments.providerStatus, status));
    if (mode) conditions.push(eq(supporterPayments.mode, mode));
    if (query) {
      const term = `%${query}%`;
      conditions.push(or(
        ilike(supporterPayments.orderId, term),
        ilike(supporterPayments.supporterName, term),
        ilike(supporterPayments.message, term),
      ));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const limit = supporterPaymentListLimit(limitValue);
    const [rows, countRows, statsRows] = await Promise.all([
      db.select().from(supporterPayments).where(where)
        .orderBy(desc(supporterPayments.createdAt)).limit(limit),
      db.select({ count: sql<number>`count(*)::int` }).from(supporterPayments).where(where),
      db.select({
        totalAmount: sql<number>`coalesce(sum(${supporterPayments.balanceAmount}) filter (where ${supporterPayments.providerStatus} in ('DONE','PARTIAL_CANCELED')), 0)::int`,
        doneCount: sql<number>`count(*) filter (where ${supporterPayments.providerStatus} in ('DONE','PARTIAL_CANCELED'))::int`,
        waitingCount: sql<number>`count(*) filter (where ${supporterPayments.providerStatus} = 'WAITING_FOR_DEPOSIT')::int`,
        canceledCount: sql<number>`count(*) filter (where ${supporterPayments.providerStatus} = 'CANCELED')::int`,
      }).from(supporterPayments).where(mode ? eq(supporterPayments.mode, mode) : undefined),
    ]);
    return {
      items: rows.map(toAdmin),
      total: countRows[0]?.count ?? 0,
      summary: statsRows[0] ?? {
        totalAmount: 0,
        doneCount: 0,
        waitingCount: 0,
        canceledCount: 0,
      },
    };
  }

  async resyncForAdmin(userId: string, idValue: string) {
    await this.requireOperator(userId);
    const id = idValue.trim();
    const [row] = await db.select().from(supporterPayments)
      .where(eq(supporterPayments.id, id)).limit(1);
    if (!row) throw new NotFoundException("후원 결제를 찾을 수 없어요.");
    if (!row.paymentKey) throw new BadRequestException("아직 결제 키가 없는 주문이에요.");
    const payment = await querySupporterTossPayment({
      config: this.configForRow(row),
      paymentKey: row.paymentKey,
    });
    await this.reconcile(row, payment, true);
    const [updated] = await db.select().from(supporterPayments)
      .where(eq(supporterPayments.id, row.id)).limit(1);
    return updated ? toAdmin(updated) : toAdmin(row);
  }
  async getSettingsForAdmin(userId: string) {
    await this.requireOperator(userId);
    return this.getFundingSettings();
  }

  async updateSettingsForAdmin(userId: string, input: unknown) {
    await this.requireOperator(userId);
    if (!input || typeof input !== "object") {
      throw new BadRequestException("운영비 후원 설정을 확인해 주세요.");
    }
    const body = input as Record<string, unknown>;
    const monthlyGoalAmount = validateSupporterGoalAmount(body.monthlyGoalAmount);
    const publicWallEnabled = validateSupporterPublicWallEnabled(body.publicWallEnabled);
    if (monthlyGoalAmount === null || publicWallEnabled === null) {
      throw new BadRequestException("월 목표 금액 또는 공개 후원자 벽 설정을 확인해 주세요.");
    }
    const now = new Date();
    const [row] = await db.update(supporterFundingSettings)
      .set({ monthlyGoalAmount, publicWallEnabled, updatedAt: now })
      .where(eq(supporterFundingSettings.id, "default"))
      .returning();
    if (!row) throw new ServiceUnavailableException("운영비 후원 설정 마이그레이션이 필요해요.");
    return row;
  }

  async setPublicVisibilityForAdmin(
    userId: string,
    idValue: string,
    hiddenValue: unknown,
  ) {
    await this.requireOperator(userId);
    if (typeof hiddenValue !== "boolean") {
      throw new BadRequestException("공개 후원자 숨김 설정을 확인해 주세요.");
    }
    const id = idValue.trim();
    const [row] = await db.update(supporterPayments)
      .set({ publicHidden: hiddenValue, updatedAt: new Date() })
      .where(eq(supporterPayments.id, id))
      .returning();
    if (!row) throw new NotFoundException("후원 결제를 찾을 수 없어요.");
    return toAdmin(row);
  }

  async cancelForAdmin(userId: string, idValue: string, reasonValue: unknown) {
    await this.requireOperator(userId);
    const reason = validateSupporterCancelReason(reasonValue);
    if (!reason) throw new BadRequestException("환불 사유를 2자 이상 입력해 주세요.");
    const id = idValue.trim();
    if (!id || id.length > 100) throw new BadRequestException("결제 ID를 확인해 주세요.");
    let [row] = await db.select().from(supporterPayments)
      .where(eq(supporterPayments.id, id)).limit(1);
    if (!row) throw new NotFoundException("후원 결제를 찾을 수 없어요.");
    if (!row.paymentKey) throw new BadRequestException("승인된 결제 키가 없어요.");
    const paymentKey = row.paymentKey;
    if (row.providerStatus === "CANCELED") return toAdmin(row);
    if (row.providerStatus !== "DONE" && row.providerStatus !== "WAITING_FOR_DEPOSIT") {
      throw new BadRequestException("현재 상태에서는 전액 취소할 수 없어요.");
    }
    if (row.method === "가상계좌" && row.providerStatus === "DONE") {
      throw new BadRequestException(
        "입금 완료 가상계좌는 환불계좌 확인이 필요해 Toss 결제관리에서 처리해 주세요.",
      );
    }
    if (!row.cancelIdempotencyKey) {
      const cancelIdempotencyKey = randomUUID();
      const updated = await db.update(supporterPayments)
        .set({ cancelIdempotencyKey, updatedAt: new Date() })
        .where(eq(supporterPayments.id, row.id)).returning();
      if (updated[0]) row = updated[0];
    }

    const config = this.configForRow(row);
    let payment: SupporterTossPayment;
    try {
      payment = await cancelSupporterTossPayment({
        config,
        paymentKey,
        reason,
        idempotencyKey: row.cancelIdempotencyKey ?? randomUUID(),
      });
    } catch (error) {
      if (!(error instanceof ProductionExternalHttpError) || !error.uncertain) {
        throw new BadRequestException(
          "결제 취소에 실패했어요. Toss 결제 상태를 확인해 주세요.",
        );
      }
      payment = await querySupporterTossPayment({ config, paymentKey });
    }
    await this.reconcile(row, payment, false, reason);
    const [updated] = await db.select().from(supporterPayments)
      .where(eq(supporterPayments.id, row.id)).limit(1);
    return updated ? toAdmin(updated) : toAdmin(row);
  }

  private async reconcile(
    row: SupporterPaymentRow,
    payment: SupporterTossPayment,
    webhookVerified: boolean,
    cancelReason = row.cancelReason,
  ): Promise<SupporterPaymentPublicEntry> {
    assertPaymentMatches(row, payment);
    const now = new Date();
    const balanceAmount = Math.max(
      0,
      Math.min(row.amount, payment.balanceAmount ?? payment.totalAmount),
    );
    const [updated] = await db.update(supporterPayments)
      .set({
        paymentKey: payment.paymentKey,
        providerStatus: payment.status,
        balanceAmount,
        method: payment.method ?? "",
        receiptUrl: safeReceiptUrl(payment.receipt?.url),
        approvedAt: dateOrNull(payment.approvedAt),
        canceledAt: latestCanceledAt(payment),
        webhookVerifiedAt: webhookVerified ? now : row.webhookVerifiedAt,
        cancelReason,
        updatedAt: now,
      })
      .where(eq(supporterPayments.id, row.id))
      .returning();
    if (!updated) throw new Error("supporter_payment_reconcile_failed");
    return toPublic(updated);
  }
  private configForRow(row: SupporterPaymentRow) {
    const config = resolveSupporterPaymentConfig();
    if (!config.serverReady || config.mode !== row.mode) {
      throw new ServiceUnavailableException(
        "결제 제공자 설정이 주문 환경과 일치하지 않아요.",
      );
    }
    return config;
  }

  private async getFundingSettings() {
    const [row] = await db.select().from(supporterFundingSettings)
      .where(eq(supporterFundingSettings.id, "default")).limit(1);
    return row ?? {
      id: "default",
      monthlyGoalAmount: SUPPORTER_DEFAULT_MONTHLY_GOAL_WON,
      publicWallEnabled: true,
      updatedAt: new Date(0),
    };
  }

  private async requireOperator(userId: string) {
    if (!userId || !(await isOfficialUser(userId))) {
      throw new ForbiddenException("운영자 권한이 필요해요.");
    }
  }
}
