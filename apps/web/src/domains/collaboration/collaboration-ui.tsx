import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowUpRight, Bookmark, CalendarDays, MapPin } from "lucide-react";

import {
  COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES, COLLABORATION_STATUS,
  COLLABORATION_TYPES, collaborationBudget, safeCollaborationUrl,
} from "../../../../../packages/core/src/collaboration";

import type { CollaborationPost } from "../../../../../packages/core/src/collaboration";
import type { ReactNode } from "react";

import Link from "@/compat/router-link";

export const collabInput = "mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-50";
export const collabButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-panel px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent/60 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
export const collabPrimary = `${collabButton} border-accent bg-accent text-on-accent hover:bg-accent-2`;
export function CollabField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block min-w-0 text-sm font-semibold text-fg">{label}{children}{hint && <span className="mt-2 block text-xs font-normal leading-relaxed text-fg-3">{hint}</span>}</label>;
}
export function CollabNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "en", "alert") : translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "en", "status")} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "en", "rounded-2xl border p-4 text-sm leading-relaxed {v0}"), { v0: String(error ? "border-bad/40 bg-bad/10 text-bad" : "border-accent/30 bg-accent/10 text-fg") })}>{children}</div>;
}
export function CollabLogin() {
  return <CollabNotice>{translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "공고 열람은 누구나 가능해요. 등록·지원·저장은 로그인 후 이용할 수 있어요. ")}<Link href="/me" className="font-bold underline underline-offset-4">{translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "로그인 / 회원가입")}</Link></CollabNotice>;
}
export function PortfolioLink({ url, children = "포트폴리오 보기" }: { url: string; children?: ReactNode }) {
  const safe = safeCollaborationUrl(url);
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent underline-offset-4 hover:underline">{children}<ArrowUpRight size={15} aria-hidden="true" /></a> : null;
}
export function CollaborationCard({ post, onSave, busy }: { post: CollaborationPost; onSave: () => void; busy: boolean }) {
  const status = post.status === "open" && post.expired ? "closed" : post.status;
  return <article className="flex h-full flex-col rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent/50">
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-accent/10 px-3 py-1.5 text-accent">{COLLABORATION_TYPES[post.type]}</span><span className="rounded-full bg-raised px-3 py-1.5 text-fg-2">{COLLABORATION_ROLES[post.role]}</span></div>
      <button type="button" onClick={onSave} disabled={busy} aria-label={post.saved ? formatI18nTemplate(translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "{v0} 저장 취소"), { v0: String(post.title) }) : formatI18nTemplate(translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "{v0} 저장"), { v0: String(post.title) })} aria-pressed={post.saved} className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line text-accent hover:bg-raised disabled:opacity-50"><Bookmark size={18} fill={post.saved ? translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "en", "currentColor") : translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "en", "none")} aria-hidden="true" /></button>
    </div>
    <Link href={formatI18nTemplate(translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "en", "/collaborate/{v0}"), { v0: String(post.id) })} className="mt-4 block text-lg font-bold leading-snug text-fg hover:text-accent"><h2>{post.title}</h2></Link>
    <p className="mt-3 text-base font-bold text-accent">{collaborationBudget(post)}</p>
    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-2">{post.details.description}</p>
    <div className="mt-4 flex flex-wrap gap-2 text-xs text-fg-2">{post.details.tools.slice(0, 4).map((tool) => <span key={tool} className="rounded-md bg-raised px-2 py-1">{tool}</span>)}<span className="rounded-md bg-raised px-2 py-1">{COLLABORATION_PAY[post.payType]}</span></div>
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-fg-3"><span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{COLLABORATION_MODES[post.workMode]}{post.details.location ? ` · ${post.details.location}` : ""}</span><span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" />{post.details.deadline || translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "상시 접수")}</span></div>
    <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs"><span className="text-fg-3">{post.author.name}</span><span className={status === "open" ? translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "en", "font-semibold text-accent") : translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "en", "text-fg-3")}>{post.hidden ? translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "운영자 비공개") : COLLABORATION_STATUS[status]}</span></div>
  </article>;
}
export function CollaborationSafety() {
  return <section className="rounded-2xl border border-line bg-panel p-5"><h2 className="font-bold text-fg">{translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "안전한 협업을 위한 약속")}</h2><p className="mt-3 text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "보수와 지급일, 회차·컷 수, 수정 횟수, 납품 형식, 저작권과 크레딧을 작업 전에 서면으로 합의하세요. 과도한 무상 테스트나 선입금을 요구하는 공고는 주의해 주세요.")}</p><p className="mt-3 text-xs leading-6 text-fg-3">{translateCurrentStaticSourceText("domains.collaboration.collaboration.ui", "ko", "게시판 이용은 무료입니다. ToonStudio는 결제·에스크로·계약 체결을 중개하거나 거래 이행을 보증하지 않아요. 개인정보와 미공개 원고는 공개 본문에 넣지 마세요.")}</p></section>;
}
