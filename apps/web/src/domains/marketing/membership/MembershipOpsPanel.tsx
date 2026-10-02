import { ArrowRight } from "lucide-react";

import { useT } from "@/shared/lib/i18n";
import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/shared/navigation/router-link";

import { COPY } from "./membership-copy";

/** 운영 원칙 탭: 안전 한도·포인트 유효기간·크레딧 지급 같은 여섯 가지 원칙과 바로 가기. */
export function MembershipOpsPanel({ pointExpiryDays, formatter }: {
  readonly pointExpiryDays: number | null;
  readonly formatter: Intl.NumberFormat;
}) {
  const t = useT();
  const items = [
    t(COPY.opsItem1),
    t(COPY.opsItem2),
    pointExpiryDays == null ? t(COPY.opsItem3Indefinite) : t(COPY.opsItem3, { days: formatter.format(pointExpiryDays) }),
    t(COPY.opsItem4),
    t(COPY.opsItem5),
    t(COPY.opsItem6),
  ];
  return (
    <section className="rounded-3xl border border-line bg-panel p-4 sm:p-8" aria-labelledby="membership-ops-title">
      <h2 id="membership-ops-title" className="text-xl font-black text-fg sm:text-2xl">{t(COPY.opsTitle)}</h2>
      <ul className="mt-4 grid gap-3 text-sm leading-6 text-fg-2 md:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="rounded-2xl bg-card/55 p-4">• {item}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/settings" className={buttonClass({ size: "lg", className: "w-full whitespace-normal text-center sm:w-auto" })}>
          {t(COPY.linkSettings)}<ArrowRight size={17} aria-hidden="true" />
        </Link>
        <Link href="/events" className={buttonClass({ variant: "outline", size: "lg", className: "w-full whitespace-normal text-center sm:w-auto" })}>
          {t(COPY.linkEvents)}
        </Link>
      </div>
    </section>
  );
}
