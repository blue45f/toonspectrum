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
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketplaceAuthoringWorkshop } from "../components/MarketplaceAuthoringWorkshop";
import {
  marketAuthorityErrorMessage,
  authoringUpdateResourceId,
  parseAuthoritativeMarketManifest,
} from "../models/market-authority";
import { marketKindMeta, marketLicenseMeta } from "../models/market-kind";
import { marketStudioResourceHref } from "../models/market-studio-handoff";

import type { CreatorMarketplaceResourceIdentity, CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { useSession } from "@/src/compat/auth-session-store";
import Link from "@/src/compat/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/src/hooks/use-document-title";
import { getCreatorMarketplaceResourceIdentity, publishCreatorMarketplaceResource } from "@/src/infrastructure/creator-marketplace-client";

const MAX_SOURCE_FILE_BYTES = 512 * 1024;

export function MarketPublishPage() {
  useDocumentTitle("에셋 등록 · 툰스튜디오 에셋");
  useMetaDescription(
    "Studio 저작 초안을 이어서 편집하고, 검증 가능한 manifest만 서버 공개 릴리스로 게시하세요.",
  );

  const { data: session, ready, status } = useSession();
  const authenticated = ready && status === "authenticated";
  const userId = authenticated ? session.user.id : null;
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const [manifestText, setManifestText] = useState("");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedRecord, setPublishedRecord] =
    useState<CreatorMarketplaceResourceRecord | null>(null);
  const [updateParent, setUpdateParent] = useState<CreatorMarketplaceResourceIdentity | null>(null);
  const [parentError, setParentError] = useState<string | null>(null);
  const [parentLookupAttempt, setParentLookupAttempt] = useState(0);
  const updateTarget = authoringUpdateResourceId(manifestText);

  useEffect(() => {
    setUpdateParent(null);
    setParentError(null);
    if (!userId || !updateTarget) return;
    let current = true;
    const controller = new AbortController();
    void getCreatorMarketplaceResourceIdentity(updateTarget, controller.signal).then((parent) => {
      if (parent.publisherId !== userId) throw new Error("본인이 게시한 에셋만 업데이트할 수 있습니다.");
      if (current) setUpdateParent(parent);
    }).catch((caught: unknown) => {
      if (current) setParentError(marketAuthorityErrorMessage(caught, "업데이트할 기존 에셋을 확인하지 못했습니다."));
    });
    return () => { current = false; controller.abort(); };
  }, [userId, updateTarget, parentLookupAttempt]);

  const parsed = useMemo(
    () => parseAuthoritativeMarketManifest(manifestText,
      updateParent?.id === updateTarget && updateParent?.publisherId === userId ? updateParent : null),
    [manifestText, updateParent, updateTarget, userId],
  );

  async function loadManifestFile(file: File): Promise<void> {
    setError(null);
    setPublishedRecord(null);
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setError("공개 manifest JSON은 512KB 이하여야 합니다.");
      return;
    }
    if (!/json|toonmarket/iu.test(`${file.type} ${file.name}`)) {
      setError("서버 게시 단계에는 JSON manifest 파일을 선택해 주세요.");
      return;
    }
    try {
      setManifestText(await file.text());
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
    fileButtonRef.current?.focus();
  }

  return (
    <Container size="wide" className="min-w-0 py-7 sm:py-10">
      <MarketNavHeader />

      <Link href="/market/manage" className="inline-flex min-h-11 items-center gap-1.5 text-xs text-fg-2 hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        판매자 센터로 돌아가기
      </Link>

      <section aria-labelledby="market-authoring-workshop-heading" className="mt-5">
        <div className="mb-3 rounded-xl border border-line bg-panel px-4 py-3">
          <h1 id="market-authoring-workshop-heading" className="text-base font-bold text-fg">
            제작 워크숍
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">
            Brush Studio와 Studio에서 전달한 저작 handoff를 여기서 이어서 편집합니다.
            워크숍 초안과 소스 패키지는 공개 릴리스가 아니며, 아래 서버 게시 검증을 통과해야 공개됩니다.
          </p>
        </div>
        <MarketplaceAuthoringWorkshop />
      </section>

      <section id="market-server-publish" aria-labelledby="market-server-publish-heading" className="mt-8 border-t border-line pt-8">
        {publishedRecord ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-good/40 bg-card p-6 text-center shadow-xl sm:p-8">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-good/15 text-good">
              <CheckCircle2 className="size-9" aria-hidden="true" />
            </div>
            <h2 id="market-server-publish-heading" className="mt-4 text-xl font-bold text-fg">
              서버 게시가 완료되었습니다
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-fg-2">
              서버가 반환한 immutable 릴리스 ID로 공개 성공을 확정했습니다. 브라우저 초안과
              패키지 생성 성공만으로는 공개 상태를 만들지 않습니다.
            </p>

            <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-panel px-4 text-left text-xs">
              <MetaRow label="에셋" value={publishedRecord.name} />
              <MetaRow label="릴리스" value={`v${publishedRecord.resourceVersion} · ${publishedRecord.id}`} numeric />
              <MetaRow
                label="종류·사용권"
                value={`${marketKindMeta(publishedRecord.kind).label} · ${marketLicenseMeta(publishedRecord.license).label}`}
              />
            </dl>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Link href={`/market/resource/${publishedRecord.id}`} className={buttonClass({ variant: "solid", size: "md" })}>
                공개 상세 보기
              </Link>
              <Link href={marketStudioResourceHref(publishedRecord.id)} className={buttonClass({ variant: "outline", size: "md" })}>
                <Palette className="size-4" aria-hidden="true" />
                Studio에서 검증
              </Link>
            </div>
            <button type="button" onClick={startAnotherRelease} className={buttonClass({ variant: "ghost", size: "sm", className: "mt-3" })}>
              다른 릴리스 게시
            </button>
          </div>
        ) : (
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <form onSubmit={(event) => void handleSubmit(event)} className="min-w-0 rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-accent">Server-authoritative publish</p>
                  <h2 id="market-server-publish-heading" className="mt-1 text-2xl font-bold text-fg">
                    검증된 manifest 게시
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
                    Studio 런타임 계약에 맞는 공개 manifest JSON을 불러옵니다. 계약 검증과
                    서버 게시가 모두 성공한 경우에만 공개 완료로 표시됩니다.
                  </p>
                </div>
                <Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "outline", size: "sm" })}>
                  Studio에서 패키지 만들기
                </Link>
              </div>

              <div className="mt-6 rounded-xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileJson className="size-5 text-accent" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-fg">{sourceName ?? "공개 manifest JSON 파일"}</p>
                      <p className="text-xs text-fg-3">권장 확장자: .toonmarket.json · 최대 512KB</p>
                    </div>
                  </div>
                  <button
                    ref={fileButtonRef}
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
                공개 Manifest JSON
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
                placeholder="Studio에서 내보낸 공개 manifest JSON을 붙여넣으세요."
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

              {parentError && updateTarget ? (
                <div role="alert" className="mt-3 rounded-lg border border-warn/40 p-3 text-xs text-fg-2">
                  <p>{parentError}</p>
                  <button type="button" className={buttonClass({ variant: "ghost", size: "sm", className: "mt-2" })}
                    onClick={() => setParentLookupAttempt((attempt) => attempt + 1)}>
                    업데이트 대상 다시 확인
                  </button>
                </div>
              ) : null}

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
                    입력한 JSON은 화면에 유지되지만 로그인 전에는 서버 공개 게시를 실행하지 않습니다.
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!authenticated || submitting || parsed.state !== "valid"}
                className={buttonClass({ variant: "solid", size: "md", className: "mt-5 w-full disabled:cursor-not-allowed disabled:opacity-45" })}
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
                <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
                  <ShieldCheck className="size-4 text-good" aria-hidden="true" />
                  공개 성공 기준
                </h3>
                <ol className="mt-3 space-y-2 text-xs leading-relaxed text-fg-2">
                  <li>1. 공개 manifest 계약 검증 통과</li>
                  <li>2. entry·manifest 무결성 검증 통과</li>
                  <li>3. 로그인 제작자 권한 확인</li>
                  <li>4. 서버가 immutable 릴리스 ID 반환</li>
                </ol>
              </section>
              <section className="rounded-xl border border-line bg-panel p-4">
                <h3 className="text-sm font-bold text-fg">초안과 공개 상태 분리</h3>
                <p className="mt-2 text-xs leading-relaxed text-fg-2">
                  워크숍 자동 저장, 소스 패키지 생성, 네트워크 실패는 공개 성공이 아닙니다.
                  실패한 요청은 성공 화면이나 공개 상세 링크를 만들지 않습니다.
                </p>
              </section>
            </aside>
          </div>
        )}
      </section>
    </Container>
  );
}

function MetaRow({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-fg-3">{label}</dt>
      <dd className={cn("text-right font-semibold text-fg", numeric && "numeral tnum")}>{value}</dd>
    </div>
  );
}
