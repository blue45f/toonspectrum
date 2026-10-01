/**
 * membership/index.ts
 *
 * 팬 멤버십(월 구독 티어) 도메인 공개 API.
 */
export * from "./models/membership-model";
export * from "./models/membership-store";
export * from "./membership-api";
export { MembershipTierEditor } from "./components/MembershipTierEditor";
export { MembershipJoinDialog } from "./components/MembershipJoinDialog";
export { MyMembershipCard } from "./components/MyMembershipCard";
export { CreatorMembershipPage } from "./pages/CreatorMembershipPage";
export { MyMembershipsPage } from "./pages/MyMembershipsPage";
export { membershipRevenueProvider } from "./models/membership-revenue-provider";

// 수익원 레지스트리에 멤버십 제공자를 등록한다 (수익 대시보드 집계용).
import { registerRevenueSourceProvider } from "../revenue/revenue-registry";
import { membershipRevenueProvider as membershipProvider } from "./models/membership-revenue-provider";
registerRevenueSourceProvider(membershipProvider);
