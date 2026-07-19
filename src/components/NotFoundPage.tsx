import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import { useT } from "@/lib/i18n";
import Link from "@/src/compat/router-link";

export function NotFoundPage() {
  const t = useT();
  return (
    <Container size="wide" className="grid min-h-[56vh] place-items-center py-20 text-center">
      <div>
        <p className="eyebrow text-accent">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("page.notFound.title")}</h1>
        <p className="mt-3 text-sm text-fg-3">{t("page.notFound.message")}</p>
        <Link href="/" className={buttonClass({ className: "mt-6" })}>
          {t("page.notFound.home")}
        </Link>
      </div>
    </Container>
  );
}
