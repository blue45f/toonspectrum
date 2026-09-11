import { CircleAlert, ExternalLink } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

import {
  studioExternalJoinHref,
  studioExternalPresentationHref,
  studioExternalReviewHref,
  validateStudioExternalToken,
} from "../studio-route-registry";

type Locale = "ko" | "en";
type EntryKind = "join" | "present" | "review";

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function InvalidExternalEntry({ kind, locale }: { readonly kind: EntryKind; readonly locale: Locale }) {
  const title = locale === "ko" ? "이 링크를 열 수 없어요" : "This link cannot be opened";
  const descriptions: Readonly<Record<EntryKind, Readonly<Record<Locale, string>>>> = {
    review: {
      ko: "검토 링크가 잘렸거나 만료됐을 수 있습니다. 링크를 보낸 사람에게 새 링크를 요청해 주세요.",
      en: "The review link may be incomplete or expired. Ask the sender for a new link.",
    },
    present: {
      ko: "발표 링크가 올바르지 않습니다. 발표자가 공유한 전체 주소를 다시 확인해 주세요.",
      en: "The presentation link is invalid. Check the complete address shared by the presenter.",
    },
    join: {
      ko: "초대 링크가 올바르지 않습니다. 프로젝트 관리자에게 새 초대를 요청해 주세요.",
      en: "The invitation link is invalid. Ask the project administrator for a new invitation.",
    },
  };
  return (
    <main className="min-h-[70vh] bg-canvas">
      <Container size="narrow" className="py-16 sm:py-24">
        <section className="rounded-3xl border border-line bg-card p-6 text-center shadow-sm sm:p-10">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft/25 text-warning">
            <CircleAlert size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-black text-fg">{title}</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-2">
            {descriptions[kind][locale]}
          </p>
          <Link href="/studio" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent">
            <ExternalLink size={16} aria-hidden="true" />
            {locale === "ko" ? "ToonStudio로 이동" : "Open ToonStudio"}
          </Link>
        </section>
      </Container>
    </main>
  );
}

function ExternalEntry({ kind }: { readonly kind: EntryKind }) {
  const params = useParams<{
    inviteToken?: string;
    presentationToken?: string;
    shareToken?: string;
  }>();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const token = kind === "review"
    ? params.shareToken
    : kind === "present"
      ? params.presentationToken
      : params.inviteToken;
  if (!validateStudioExternalToken(token)) {
    return <InvalidExternalEntry kind={kind} locale={locale} />;
  }
  const href = kind === "review"
    ? studioExternalReviewHref(token)
    : kind === "present"
      ? studioExternalPresentationHref(token)
      : studioExternalJoinHref(token);
  return <Navigate to={href} replace />;
}

export function StudioExternalReviewRoute() {
  return <ExternalEntry kind="review" />;
}

export function StudioExternalPresentationRoute() {
  return <ExternalEntry kind="present" />;
}

export function StudioExternalJoinRoute() {
  return <ExternalEntry kind="join" />;
}
