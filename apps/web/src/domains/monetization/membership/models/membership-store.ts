/**
 * membership-store.ts
 *
 * 팬 멤버십 티어·구독·멤버 전용 게시글의 브라우저 저장소.
 */
import {
  nextBillingDate,
  type MembershipPost,
  type MembershipSubscription,
  type MembershipTier,
  type NewTierInput,
} from "./membership-model";

const TIER_STORAGE_KEY = "toonspectrum:monetization:membership-tiers";
const SUBSCRIPTION_STORAGE_KEY = "toonspectrum:monetization:membership-subscriptions";
const POST_STORAGE_KEY = "toonspectrum:monetization:membership-posts";
export const MEMBERSHIP_STORE_EVENT = "toonspectrum:monetization:membership-changed";

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function readList<T>(key: string, guard: (item: unknown) => item is T): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(guard);
  } catch {
    return [];
  }
}

function writeList(key: string, items: readonly unknown[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(MEMBERSHIP_STORE_EVENT));
    return true;
  } catch {
    return false;
  }
}

function isTier(item: unknown): item is MembershipTier {
  const r = item as Record<string, unknown>;
  return (
    typeof item === "object" && item !== null &&
    typeof r.id === "string" && typeof r.creatorId === "string" &&
    typeof r.name === "string" && typeof r.monthlyPriceKrw === "number"
  );
}

function isSubscription(item: unknown): item is MembershipSubscription {
  const r = item as Record<string, unknown>;
  return (
    typeof item === "object" && item !== null &&
    typeof r.id === "string" && typeof r.tierId === "string" &&
    typeof r.memberId === "string" && typeof r.status === "string"
  );
}

function isPost(item: unknown): item is MembershipPost {
  const r = item as Record<string, unknown>;
  return (
    typeof item === "object" && item !== null &&
    typeof r.id === "string" && typeof r.creatorId === "string" &&
    typeof r.title === "string"
  );
}

/* ── 티어 ── */

export function listTiers(): MembershipTier[] {
  return readList(TIER_STORAGE_KEY, isTier);
}

export function listTiersByCreator(creatorId: string): MembershipTier[] {
  return listTiers()
    .filter((tier) => tier.creatorId === creatorId)
    .sort((a, b) => a.monthlyPriceKrw - b.monthlyPriceKrw);
}

export function getTier(tierId: string): MembershipTier | null {
  return listTiers().find((tier) => tier.id === tierId) ?? null;
}

export function createTier(input: NewTierInput): MembershipTier {
  const now = new Date().toISOString();
  const tier: MembershipTier = {
    id: createId("tier"),
    creatorId: input.creatorId,
    name: input.name.trim(),
    monthlyPriceKrw: Math.round(input.monthlyPriceKrw),
    description: (input.description ?? "").trim(),
    perks: [...input.perks],
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const tiers = listTiers();
  tiers.push(tier);
  writeList(TIER_STORAGE_KEY, tiers);
  return tier;
}

export function updateTier(
  tierId: string,
  patch: Partial<Pick<MembershipTier, "name" | "monthlyPriceKrw" | "description" | "perks" | "isActive">>,
): MembershipTier | null {
  const tiers = listTiers();
  const target = tiers.find((tier) => tier.id === tierId);
  if (!target) return null;
  const updated: MembershipTier = {
    ...target,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : target.name,
    description: patch.description !== undefined ? patch.description.trim() : target.description,
    perks: patch.perks !== undefined ? [...patch.perks] : target.perks,
    updatedAt: new Date().toISOString(),
  };
  writeList(TIER_STORAGE_KEY, tiers.map((tier) => (tier.id === tierId ? updated : tier)));
  return updated;
}

/* ── 구독 ── */

export function listSubscriptions(): MembershipSubscription[] {
  return readList(SUBSCRIPTION_STORAGE_KEY, isSubscription)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function listSubscriptionsByMember(memberId: string): MembershipSubscription[] {
  return listSubscriptions().filter((sub) => sub.memberId === memberId);
}

export function listSubscriptionsByCreator(creatorId: string): MembershipSubscription[] {
  return listSubscriptions().filter((sub) => sub.creatorId === creatorId);
}

export function subscribeToTier(input: {
  tier: MembershipTier;
  memberId: string;
  memberName: string;
}): MembershipSubscription {
  const now = new Date();
  const subscription: MembershipSubscription = {
    id: createId("sub"),
    tierId: input.tier.id,
    creatorId: input.tier.creatorId,
    memberId: input.memberId,
    memberName: input.memberName,
    status: "active",
    monthlyPriceKrw: input.tier.monthlyPriceKrw,
    startedAt: now.toISOString(),
    currentPeriodEnd: nextBillingDate(now),
    cancelledAt: null,
  };
  const subscriptions = listSubscriptions();
  subscriptions.push(subscription);
  writeList(SUBSCRIPTION_STORAGE_KEY, subscriptions);

  const tiers = listTiers();
  const tier = tiers.find((t) => t.id === input.tier.id);
  if (tier) {
    writeList(
      TIER_STORAGE_KEY,
      tiers.map((t) =>
        t.id === tier.id ? { ...t, memberCount: t.memberCount + 1 } : t,
      ),
    );
  }
  return subscription;
}

/** 구독 해지 — 기간 말까지 혜택 유지 후 종료. */
export function cancelSubscription(subscriptionId: string): boolean {
  const subscriptions = listSubscriptions();
  const target = subscriptions.find((sub) => sub.id === subscriptionId);
  if (!target || target.status !== "active") return false;
  const updated: MembershipSubscription = {
    ...target,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  };
  const ok = writeList(
    SUBSCRIPTION_STORAGE_KEY,
    subscriptions.map((sub) => (sub.id === subscriptionId ? updated : sub)),
  );
  if (ok) {
    const tiers = listTiers();
    const tier = tiers.find((t) => t.id === target.tierId);
    if (tier) {
      writeList(
        TIER_STORAGE_KEY,
        tiers.map((t) =>
          t.id === tier.id ? { ...t, memberCount: Math.max(0, t.memberCount - 1) } : t,
        ),
      );
    }
  }
  return ok;
}

/* ── 멤버 전용 게시글 ── */

export function listMembershipPosts(creatorId: string): MembershipPost[] {
  return readList(POST_STORAGE_KEY, isPost)
    .filter((post) => post.creatorId === creatorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createMembershipPost(input: {
  creatorId: string;
  visibleTierIds: readonly string[];
  title: string;
  body: string;
}): MembershipPost {
  const post: MembershipPost = {
    id: createId("mpost"),
    creatorId: input.creatorId,
    visibleTierIds: [...input.visibleTierIds],
    title: input.title.trim(),
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  };
  const posts = readList(POST_STORAGE_KEY, isPost);
  posts.push(post);
  writeList(POST_STORAGE_KEY, posts);
  return post;
}

/** 스토어 변경을 구독한다. 반환값으로 구독을 해제한다. */
export function subscribeMembershipStore(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(MEMBERSHIP_STORE_EVENT, listener);
  return () => window.removeEventListener(MEMBERSHIP_STORE_EVENT, listener);
}
