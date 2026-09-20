import type { HiringResumeInput, HiringSlotTerms } from "../../../../../../packages/contracts/src/creator-hiring";

export const emptyResume = (): HiringResumeInput => ({ title: "", expectedRevision: 0, content: { penName: "", summary: "", roles: [], tools: [], formats: [], languages: [], experiences: [], portfolio: [] } });
export const optionsOf = (items: readonly string[]) => Object.fromEntries(items.map((v) => [v, v]));
export const rateLabels = { hour: "시간", cut: "컷", episode: "회차", task: "작업" };
export const compensationLabels = { paid: "유급", unpaid: "무급", "revenue-share": "수익 분배" };
export const policyLabels = { allowed: "허용", "approval-required": "사전 승인 필요", prohibited: "금지" };
export const dateInput = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const emptyTerms = (): HiringSlotTerms => ({ model: "freelance-task", role: "lineart", publicScope: "", quantity: 1, quantityUnit: "cut", startsAt: new Date(Date.now() + 3600000).toISOString(), dueAt: new Date(Date.now() + 86400000).toISOString(), timeZone: "Asia/Seoul", compensation: "paid", currency: "KRW", minRate: 10000, maxRate: 10000, rateUnit: "cut", tools: [], formats: [], revisionRounds: 1, acceptanceCriteria: "", ndaRequired: false, creditPolicy: "", portfolioPolicy: "approval-required", aiPolicy: "approval-required" });

export function newOfferRequest() { return { expiresAt: new Date(Date.now() + 30 * 60000).toISOString(), mutationId: crypto.randomUUID() }; }
