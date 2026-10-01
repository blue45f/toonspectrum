/**
 * tipping/index.ts
 *
 * 에피소드 후원(팁/슈퍼라이크) 도메인 공개 API.
 */
export * from "./models/tip-model";
export * from "./models/tip-store";
export * from "./tipping-api";
export * from "./hooks/use-episode-tips";
export { TipButton } from "./components/TipButton";
export { TipDialog } from "./components/TipDialog";
export { EpisodeTipRanking } from "./components/EpisodeTipRanking";
export { tipRevenueProvider } from "./models/tip-revenue-provider";

// 수익원 레지스트리에 후원 제공자를 등록한다 (수익 대시보드 집계용).
import { registerRevenueSourceProvider } from "../revenue/revenue-registry";
import { tipRevenueProvider as tipProvider } from "./models/tip-revenue-provider";
registerRevenueSourceProvider(tipProvider);
