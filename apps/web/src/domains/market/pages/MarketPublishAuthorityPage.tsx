import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileJson,
  LoaderCircle,
  Palette,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { MarketNavHeader } from "../components/MarketNavHeader";
import {
  marketAuthorityErrorMessage,
  parseAuthoritativeMarketManifest,
} from "../models/market-authority";
import { marketKindMeta, marketLicenseMeta } from "../models/market-kind";
import { marketStudioResourceHref } from "../models/market-studio-handoff";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { useSession } from "@/src/compat/auth-session-store";
import Link from "@/src/compat/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/src/hooks/use-document-title";
import { publishCreatorMarketplaceResource } from "@/src/infrastructure/creator-marketplace-client";

const MAX_SOURCE_FILE_BYTES = 512 * 1024;

export function MarketPublishPage() {
  useDocumentTitle("에셋 등록 · 툰스튜디오 에셋");
  useMetaDescription(
    "Studio에서 만든 검증 가능한 manifest를 서버에 게시하고 공개 릴리스 상태를 확인하세요.",
  );

  const { ready, status } = useSession();
  const authenticated = ready && status === "authenticated";
  const fileRef = useRef<HTMLButtonElement>(null);
  const [manifestText, setManifestText] = useState("");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedRecord, setPublishedRecord] =
    useState<CreatorMarketplaceResourceRecord | null>(null);
  const parsed = useMemo(
    () => parseAuthoritativeMarketManifest(manifestText),
    [manifestText],
  );

  async function loadManifestFile(file: File): Promise<void> {
    setError(null);
    setPublishedRecord(null);
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setError("manifest 파일은 512KB 이하여야 합니다.");
      return;
    }
    try {
      const text = await file.text();
      setManifestText(text);
      setSourceName(file.name);
    } catch (caught) {
      setError(marketAuthorityErrorMessage(caught, "manifest 파일을 읽지 못했습니다."));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!authenticated || submitting || parsed.state !== "valid") return;

    setSubmitting(true);
    setError(null);
    setPublishedRecord(null);
    try {
      const record = await publishCreatorMarketplaceResource(parsed.manifest);
      // Only the server response can create the public-success state.
      setPublishedRecord(record);
    } catch (caught) {
      setError(marketAuthorityErrorMessage(
        caught,
        "서버 게시에 실패했습니다. 에셋은 공개되지 않았습니다.",
      ));
    } finally {
      setSubmitting(false);
    }
  }

  function startAnotherRelease(): void {
    setPublishedRecord(null);
    setManifestText("");
    setSourceName(null);
    setError(null);
    fileRef.current?.focus();
  }

  return (
    <Container size="wide" className="min-w-0 py-7 sm:py-10">
      <MarketNavHeader />

      <Link
        href="/market/manage"
        className="inline-flex min-h-11 items-center gap-1.5 text-xs text-fg-2 hover:text-fg"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        판매자 센터로 돌아가기
      </Link>

      {publishedRecord ? (
        <section
          aria-labelledby="market-publish-success-title"
          className="mx-auto mt-6 max-w-2xl rounded-2xl border border-good/40 bg-card p-6 text-center shadow-xl sm:p-8"
        >
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-good/15 text-good">
            <CheckCircle2 className="size-9" aria-hidden="true" />
          </div>
          <h1 id="market-publish-success-title" className="mt-4 text-xl font-bold text-fg">
            서버 게시가 완료되었습니다
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-fg-2">
            공개 성공 상태는 서버가 반환한 immutable 릴리스 ID를 기준으로 확정했습니다.
            브라우저 임시 저장은 공개 게시로 처리하지 않습니다.
          </p>

          <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-panel px-4 text-left text-xs">
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-fg-3">에셋</dt>
              <dd className="text-right font-semibold text-fg">{publishedRecord.name}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-fg-3">릴리스</dt>
              <dd className="numeral tnum text-right font-semibold text-fg">
                v{publishedRecord.resourceVersion} · {publishedRecord.id}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-fg-3">종류·사용권</dt>
              <dd className="text-right font-semibold text-fg">
                {marketKindMeta(publishedRecord.kind).label} · {marketLicenseMeta(publishedRecord.license).label}
              </dd>
            </div>
          </dl>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Link
              href={`/market/resource/${publishedRecord.id}`}
              className={buttonClass({ variant: "solid", size: "md" })}
            >
              공개 상세 보기
            </Link>
            <Link
              href={marketStudioResourceHref(publishedRecord.id)}
              className={buttonClass({ variant: "outline", size: "md" })}
            >
              <Palette className="size-4" aria-hidden="true" />
              Studio에서 검증
            </Link>
          </div>
          <button
            type="button"
            onClick={startAnotherRelease}
            className={buttonClass({ variant: "ghost", size: "sm", className: "mt-3" })}
          >
            다른 릴리스 게시
          </button>
        </section>
      ) : (
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="min-w-0 rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-accent">Server-authoritative publish</p>
                <h1 className="mt-1 text-2xl font-bold text-fg">검증된 manifest 게시</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
                  Studio 또는 제작 워크숍에서 생성한 manifest JSON을 불러옵니다. 계약 검증과
                  서버 게시가 모두 성공한 경우에만 공개 완료로 표시됩니다.
                </p>
              </div>
              <Link
                href="/studio?assetMarket=community&communityView=share"
                className={buttonClass({ variant: "outline", size: "sm" })}
              >
                Studio에서 패키지 만들기
              </Link>
            </div>

            <div className="mt-6 rounded-xl border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileJson className="size-5 text-accent" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-fg">
                      {sourceName ?? "manifest JSON 파일"}
                    </p>
                    <p className="text-xs text-fg-3">권장 확장자: .toonmarket.json · 최대 512KB</p>
                  </div>
                </div>
                <button
                  ref={fileRef}
                  type="button"
                  onClick={() => document.getElementById("market-authority-manifest-file")?.click()}
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  파일 선택
                </button>
              </div>
              <input
                id="market-authority-manifest-file"
                type="file"
                accept=".json,.toonmarket,application/json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void loadManifestFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </div>

            <label htmlFor="market-authority-manifest" className="mt-5 block text-sm font-semibold text-fg">
              Manifest JSON
            </label>
            <textarea
              id="market-authority-manifest"
              rows={20}
              value={manifestText}
              spellCheck={false}
              onChange={(event) => {
                setManifestText(event.target.value);
                setSourceName(null);
                setPublishedRecord(null);
                setError(null);
              }}
              placeholder="Studio에서 내보낸 manifest JSON을 붙여넣으세요."
              className="mt-2 min-h-[28rem] w-full resize-y rounded-xl border border-line bg-canvas p-4 font-mono text-xs leading-relaxed text-fg outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
              aria-describedby="market-authority-validation"
            />

            <div
              id="market-authority-validation"
              role="status"
              className={cn(
                "mt-3 rounded-lg border px-3 py-2.5 text-xs leading-relaxed",
                parsed.state === "valid"
                  ? "border-good/40 bg-good/10 text-good"
                  : parsed.state === "invalid"
                    ? "border-warn/40 bg-warn/10 text-fg-2"
                    : "border-line bg-panel text-fg-3",
              )}
            >
              {parsed.message}
            </div>

            {error ? (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
                <div>
                  <p className="font-semibold">게시되지 않았습니다</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-2">{error}</p>
                </div>
              </div>
            ) : null}

            {!ready ? (
              <p role="status" className="mt-4 text-xs text-fg-3">로그인 세션을 확인하고 있습니다.</p>
            ) : !authenticated ? (
              <div className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-fg">
                <p className="font-semibold">로그인이 필요합니다</p>
                <p className="mt-1 text-xs leading-relaxed text-fg-2">
                  입력한 JSON은 이 화면에 유지되지만 로그인 전에는 서버 공개 게시를 실행하지 않습니다.
                </p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!authenticated || submitting || parsed.state !== "valid"}
              className={buttonClass({
                variant: "solid",
                size: "md",
                className: "mt-5 w-full disabled:cursor-not-allowed disabled:opacity-45",
              })}
            >
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-4" aria-hidden="true" />
              )}
              {submitting ? "서버에서 검증·게시 중" : "서버에 검수·게시"}
            </button>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-xl border border-line bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
                <ShieldCheck className="size-4 text-good" aria-hidden="true" />
                공개 성공 기준
              </h2>
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-fg-2">
                <li>1. manifest 계약 검증 통과</li>
                <li>2. entry·manifest 무결성 검증 통과</li>
                <li>3. 로그인한 제작자 권한 확인</li>
                <li>4. 서버가 immutable 릴리스 ID 반환</li>
              </ol>
            </section>
            <section className="rounded-xl border border-line bg-panel p-4">
              <h2 className="text-sm font-bold text-fg">브라우저 임시 데이터 정책</h2>
              <p className="mt-2 text-xs leading-relaxed text-fg-2">
                네트워크 실패, 로컬 저장 성공, 미리보기 레코드는 공개 게시로 승격되지 않습니다.
                실패한 요청은 성공 화면이나 공개 상세 링크를 만들지 않습니다.
              </p>
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
