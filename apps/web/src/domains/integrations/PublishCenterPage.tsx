import { CheckCircle2, CircleAlert, Download, FileCheck2, PackageCheck, Rss, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { getApiErrorMessage } from "@/platform/api";
import { useI18n } from "@/shared/lib/i18n";

import {
  IntegrationError,
  IntegrationLoading,
  IntegrationPage,
} from "./IntegrationUi";
import { INTEGRATION_PROVIDER_STATUS_LABELS } from "./integration-platform-copy";
import { integrationPlatformClient } from "./integration-platform-client";
import {
  downloadIntegrationJson,
  downloadIntegrationText,
} from "./integration-platform-storage";
import type { IntegrationProviderStatus, PublishPackageResponse } from "./integration-platform-types";
import { useIntegrationCatalog } from "./use-integration-catalog";

/**
 * 작품 포스터 그라디언트 — 표지 아트가 없어도 제목이 주인공이 되도록,
 * 제목(없으면 프로젝트 ID) 해시로 색을 정하는 타이포그래픽 포스터.
 * 같은 작품은 언제나 같은 색을 갖는다.
 */
function posterBackground(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return [
    `radial-gradient(120% 90% at 18% 8%, oklch(0.78 0.1 ${hash} / 0.55), transparent 55%)`,
    `linear-gradient(155deg, oklch(0.64 0.13 ${hash}), oklch(0.48 0.14 ${(hash + 42) % 360}) 58%, oklch(0.36 0.11 ${(hash + 84) % 360}))`,
  ].join(", ");
}

function providerDotColor(providerId: string): string {
  let hash = 0;
  for (let index = 0; index < providerId.length; index += 1) {
    hash = (hash * 31 + providerId.charCodeAt(index)) % 360;
  }
  return `oklch(0.62 0.14 ${hash})`;
}

export function PublishCenterPage() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const { catalog, error, loading, refresh } = useIntegrationCatalog();
  const publishingProviders = useMemo(
    () => catalog?.providers.filter((provider) => provider.category === "publishing") ?? [],
    [catalog],
  );
  const [projectId, setProjectId] = useState("demo-project");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState(() => `${globalThis.location?.origin ?? "https://example.com"}/showcase`);
  const [scheduledAt, setScheduledAt] = useState("");
  const [tags, setTags] = useState("");
  const [channels, setChannels] = useState<readonly string[]>(["external-webtoon-platforms", "rss-json-feed"]);
  const [result, setResult] = useState<PublishPackageResponse | null>(null);
  const [feedResult, setFeedResult] = useState<Awaited<ReturnType<typeof integrationPlatformClient.buildFeedPreview>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggleChannel = (id: string) => {
    setChannels((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  const buildPackage = async () => {
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const response = await integrationPlatformClient.buildPublishPackage({
        projectId,
        title,
        description,
        canonicalUrl,
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        channels,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setResult(response);
    } catch (reason) {
      setMessage(await getApiErrorMessage(reason, "게시 패키지를 만들지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const buildFeeds = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const publishedAt = scheduledAt
        ? new Date(scheduledAt).toISOString()
        : new Date().toISOString();
      const response = await integrationPlatformClient.buildFeedPreview({
        title: `${title || "ToonStudio"} feed`,
        homePageUrl: canonicalUrl,
        feedUrl: `${canonicalUrl.replace(/\/$/u, "")}/feed.xml`,
        description,
        items: [{
          id: `${projectId}:${publishedAt}`,
          url: canonicalUrl,
          title: title || "Untitled release",
          summary: description,
          datePublished: publishedAt,
        }],
      });
      setFeedResult(response);
    } catch (reason) {
      setMessage(await getApiErrorMessage(reason, "피드 미리보기를 만들지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const trimmedTitle = title.trim();
  const canBuild = Boolean(trimmedTitle && canonicalUrl.trim() && channels.length > 0);
  const missingHints = [
    !trimmedTitle ? (ko ? "제목" : "a title") : null,
    !canonicalUrl.trim() ? (ko ? "정본 URL" : "a canonical URL") : null,
    channels.length === 0 ? (ko ? "채널 한 곳" : "at least one channel") : null,
  ].filter((hint): hint is string => hint !== null);
  const scheduledLabel = scheduledAt
    ? new Date(scheduledAt).toLocaleString(ko ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <IntegrationPage
      eyebrow={ko ? "배포 · 게시 패키지" : "Delivery · publication package"}
      title={ko ? "세상과 만날 시간입니다" : "Share your story"}
      description={ko
        ? "공식 API 채널과 수동 업로드 채널을 같은 패키지에서 준비합니다. 공식 승인 없는 웹툰 플랫폼은 규격 검사·ZIP·복사·수동 확인까지만 제공합니다."
        : "Prepare official API channels and manual handoff channels in one package. Platforms without approved APIs remain validation and human-confirmed upload flows."}
    >
      {loading ? <IntegrationLoading /> : null}
      {error ? <IntegrationError message={error} onRetry={refresh} /> : null}
      {catalog ? (
        <div className="space-y-6">
          {/* 발행할 작품 히어로 — 제목 포스터·준비 상태·다음 행동을 한눈에. */}
          <section className="overflow-hidden rounded-3xl border border-line bg-card" aria-label={ko ? "발행할 작품" : "Work to publish"}>
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
              <div
                aria-hidden="true"
                className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-2xl sm:w-36"
                style={{ background: posterBackground(trimmedTitle || projectId) }}
              >
                <span className="absolute -right-3 -top-5 select-none text-[6.5rem] font-black leading-none text-[oklch(0.98_0.01_70/0.22)]">
                  {(trimmedTitle || projectId).slice(0, 1)}
                </span>
                <span className="absolute inset-x-3 bottom-3 line-clamp-3 text-sm font-black leading-snug text-[oklch(0.98_0.01_70)]">
                  {trimmedTitle || (ko ? "제목 없는 작품" : "Untitled work")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
                  {ko ? "이번에 발행할 작품" : "Publishing this time"}
                </p>
                <h2 className="mt-1.5 truncate text-2xl font-black tracking-tight text-fg">
                  {trimmedTitle || (ko ? "제목 없는 작품" : "Untitled work")}
                </h2>
                <p className="mt-1 truncate text-sm text-fg-3">
                  {projectId} · {canonicalUrl.trim() || (ko ? "정본 URL 미입력" : "No canonical URL yet")}
                </p>
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={ko ? "준비 상태" : "Readiness"}>
                  <li className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${trimmedTitle ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
                    {trimmedTitle ? <CheckCircle2 size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />}
                    {ko ? "제목" : "Title"} {trimmedTitle ? (ko ? "입력됨" : "set") : (ko ? "비어 있음" : "missing")}
                  </li>
                  <li className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${channels.length > 0 ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
                    {channels.length > 0 ? <CheckCircle2 size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />}
                    {ko ? `채널 ${channels.length}곳 선택` : `${channels.length} channel(s) selected`}
                  </li>
                  <li className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-fg-2">
                    {scheduledLabel
                      ? (ko ? `예약 ${scheduledLabel}` : `Scheduled ${scheduledLabel}`)
                      : (ko ? "예약 없음 · 바로 발행" : "No schedule · publish now")}
                  </li>
                  {result ? (
                    <li className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${result.ready ? "bg-good/10 text-good" : "bg-danger/10 text-danger"}`}>
                      <PackageCheck size={13} aria-hidden />
                      {result.ready ? (ko ? "패키지 준비 완료" : "Package ready") : (ko ? "규격 검사 실패" : "Validation failed")}
                    </li>
                  ) : null}
                </ul>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={busy || !canBuild}
                    onClick={() => void buildPackage()}
                    className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-50"
                  >
                    <Send size={16} aria-hidden /> {busy ? (ko ? "생성 중" : "Building") : (ko ? "패키지 만들기" : "Build package")}
                  </button>
                  <p className="text-sm leading-6 text-fg-2" role="status">
                    {result
                      ? (ko ? "패키지가 준비됐어요. 아래 결과에서 채널별 검사를 확인하세요." : "Your package is ready. Review each channel below.")
                      : missingHints.length > 0
                        ? (ko ? `${missingHints.join(" · ")}만 채우면 만들 수 있어요.` : `Add ${missingHints.join(", ")} and you can build.`)
                        : (ko ? "준비가 끝났어요. 패키지를 만들면 채널별 규격 검사가 함께 돌아요." : "All set. Building runs each channel's spec check too.")}
                  </p>
                </div>
              </div>
            </div>
          </section>
          {message ? <p className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger" role="alert">{message}</p> : null}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-on-accent" aria-hidden>1</span>
                  <FileCheck2 size={19} aria-hidden /> {ko ? "게시 정보" : "Publication details"}
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-fg-2">
                    {ko ? "프로젝트 ID" : "Project ID"}
                    <input value={projectId} onChange={(event) => setProjectId(event.currentTarget.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                  </label>
                  <label className="text-sm font-semibold text-fg-2">
                    {ko ? "제목" : "Title"}
                    <input required value={title} onChange={(event) => setTitle(event.currentTarget.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                  </label>
                  <label className="text-sm font-semibold text-fg-2 sm:col-span-2">
                    {ko ? "정본 URL" : "Canonical URL"}
                    <input type="url" value={canonicalUrl} onChange={(event) => setCanonicalUrl(event.currentTarget.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                  </label>
                  <label className="text-sm font-semibold text-fg-2">
                    {ko ? "예약 시각" : "Schedule"}
                    <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.currentTarget.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                  </label>
                  <label className="text-sm font-semibold text-fg-2">
                    {ko ? "태그(쉼표 구분)" : "Tags (comma separated)"}
                    <input value={tags} onChange={(event) => setTags(event.currentTarget.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                  </label>
                  <label className="text-sm font-semibold text-fg-2 sm:col-span-2">
                    {ko ? "설명" : "Description"}
                    <textarea value={description} onChange={(event) => setDescription(event.currentTarget.value)} rows={4} className="mt-1 w-full rounded-xl border border-line bg-canvas p-3 text-fg" />
                  </label>
                </div>
              </section>
              <section className="rounded-2xl border border-line bg-card p-5">
                <fieldset>
                  <legend className="flex items-center gap-2 text-lg font-bold text-fg">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-on-accent" aria-hidden>2</span>
                    {ko ? "어디에 내보낼까요" : "Where to publish"}
                  </legend>
                  <p className="mt-2 text-sm leading-6 text-fg-2">
                    {ko
                      ? "카드를 눌러 채널을 고르세요. 승인 API가 없는 플랫폼은 직접 업로드용 패키지로 준비됩니다."
                      : "Tap a card to pick a channel. Platforms without an approved API are prepared as manual-upload packages."}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {publishingProviders.map((provider) => (
                      <ChannelCard
                        key={provider.id}
                        provider={provider}
                        selected={channels.includes(provider.id)}
                        ko={ko}
                        onToggle={() => toggleChannel(provider.id)}
                      />
                    ))}
                    <div className="flex flex-col rounded-2xl border border-dashed border-line bg-panel/50 p-4">
                      <strong className="flex items-center gap-2 text-sm text-fg">
                        <Rss size={16} aria-hidden className="text-accent" /> {ko ? "내 피드로 내보내기" : "Export as my feed"}
                      </strong>
                      <span className="mt-1.5 text-xs leading-5 text-fg-3">
                        {ko
                          ? "RSS · JSON Feed · ActivityPub — 외부 계정 없이 구독 링크를 만들어요."
                          : "RSS · JSON Feed · ActivityPub — subscription links without any external account."}
                      </span>
                      <button
                        type="button"
                        disabled={busy || !canonicalUrl.trim()}
                        onClick={() => void buildFeeds()}
                        className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg disabled:opacity-50"
                      >
                        <Rss size={15} aria-hidden /> {ko ? "피드 미리보기" : "Preview feeds"}
                      </button>
                    </div>
                  </div>
                </fieldset>
              </section>
            </div>
            <aside className="space-y-5">
              <section className="rounded-2xl border border-line bg-card p-5" aria-label={ko ? "패키지 결과" : "Package result"}>
                <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-on-accent" aria-hidden>3</span>
                  {ko ? "패키지 결과" : "Package result"}
                </h2>
                {!result ? <p className="mt-3 text-sm leading-6 text-fg-2">{ko ? "입력과 채널을 확인한 뒤 게시 패키지를 생성하세요." : "Build a package after reviewing details and channels."}</p> : (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-panel p-3"><p className="text-xs text-fg-3">{ko ? "규격" : "Valid"}</p><p className="mt-1 font-bold text-fg">{result.ready ? "통과" : "실패"}</p></div>
                      <div className="rounded-xl bg-panel p-3"><p className="text-xs text-fg-3">{ko ? "직접 실행" : "Direct"}</p><p className="mt-1 font-bold text-fg">{result.directlyExecutable ? "바로 실행" : "전달 필요"}</p></div>
                    </div>
                    <ul className="mt-4 space-y-2">
                      {result.channels.map((channel) => (
                        <li key={channel.id} className="flex gap-3 rounded-xl border border-line p-3 text-sm">
                          {channel.valid
                            ? <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-good" />
                            : <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-danger" />}
                          <div className="min-w-0">
                            <strong className="text-fg">{channel.name ?? channel.id}</strong>
                            <span className="mt-0.5 block text-xs text-fg-3">
                              {channel.mode} · {channel.status ?? "unsupported"} · {channel.executable ? (ko ? "바로 실행 가능" : "Executable") : (ko ? "전달 후 수동 확인" : "Manual confirmation")}
                            </span>
                            {channel.reason ? <span className="mt-1 block text-xs leading-5 text-fg-2">{channel.reason}</span> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {result.notices.map((notice) => (
                      <p key={notice} className="mt-3 rounded-xl bg-warn/10 p-3 text-xs leading-5 text-warn">{notice}</p>
                    ))}
                    <p className="mt-4 break-all rounded-xl bg-panel p-3 font-mono text-[0.68rem] text-fg-3">sha256:{result.packageDigest}</p>
                    <button type="button" onClick={() => downloadIntegrationJson(`publish-${result.projectId}.json`, result)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg">
                      <Download size={15} aria-hidden /> {ko ? "패키지 다운로드" : "Download package"}
                    </button>
                  </>
                )}
              </section>
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="text-lg font-bold text-fg">RSS · JSON Feed · ActivityPub</h2>
                {!feedResult ? <p className="mt-3 text-sm leading-6 text-fg-2">{ko ? "공개 구독용 피드는 외부 계정 없이 생성할 수 있습니다." : "Open subscription feeds can be generated without a provider account."}</p> : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => downloadIntegrationText("feed.xml", feedResult.rss, "application/rss+xml;charset=utf-8")} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">RSS</button>
                    <button type="button" onClick={() => downloadIntegrationJson("feed.json", feedResult.jsonFeed)} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">JSON Feed</button>
                    <button type="button" onClick={() => downloadIntegrationJson("activitypub.json", feedResult.activityPub)} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">ActivityPub</button>
                    <p className="w-full break-all pt-2 font-mono text-[0.68rem] text-fg-3">sha256:{feedResult.digest}</p>
                  </div>
                )}
              </section>
              <section className="rounded-2xl border border-line bg-panel/50 p-5 text-sm leading-6 text-fg-2">
                <strong className="block text-fg">{ko ? "자동 게시 경계" : "Automation boundary"}</strong>
                {ko
                  ? "공급자 승인과 자격 증명이 확인된 공식 API만 직접 실행할 수 있습니다. 네이버·카카오·WEBTOON 등 승인 API가 없는 채널은 비밀번호나 Headless Browser를 사용하지 않고 수동 업로드 영수증으로 종료합니다."
                  : "Only approved official APIs with active credentials can execute directly. Channels without approved APIs end in a manual upload receipt without passwords or headless browser automation."}
              </section>
            </aside>
          </div>
        </div>
      ) : null}
    </IntegrationPage>
  );
}

function ChannelCard({
  provider,
  selected,
  ko,
  onToggle,
}: Readonly<{
  provider: IntegrationProviderStatus;
  selected: boolean;
  ko: boolean;
  onToggle: () => void;
}>) {
  const inputId = `publish-channel-${provider.id}`;
  const ready = provider.status === "ready" || provider.status === "manual";
  return (
    <label
      htmlFor={inputId}
      className={`flex cursor-pointer flex-col rounded-2xl border p-4 transition ${
        selected
          ? "border-accent bg-accent/5 ring-1 ring-accent"
          : "border-line bg-card hover:border-fg-3"
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <strong className="flex items-center gap-2 text-sm text-fg">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: providerDotColor(provider.id) }} />
          {provider.name}
        </strong>
        <input
          id={inputId}
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-0.5 h-5 w-5 shrink-0 [accent-color:var(--color-accent)]"
        />
      </span>
      <span className="mt-2 line-clamp-2 text-xs leading-5 text-fg-2">{provider.summary}</span>
      <span className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${ready ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
          {INTEGRATION_PROVIDER_STATUS_LABELS[provider.status]}
        </span>
        <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[0.7rem] text-fg-3">
          {provider.connectionMode}
        </span>
      </span>
      {provider.status === "manual" ? (
        <span className="mt-2 text-xs font-semibold text-fg-2">
          {ko ? "직접 업로드용 패키지로 준비돼요" : "Prepared as a manual-upload package"}
        </span>
      ) : null}
    </label>
  );
}
