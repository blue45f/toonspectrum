import { Download, FileCheck2, Rss, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { getApiErrorMessage } from "@/platform/api";
import { useI18n } from "@/shared/lib/i18n";

import { IntegrationError, IntegrationLoading, IntegrationPage } from "./IntegrationUi";
import { integrationPlatformClient } from "./integration-platform-client";
import {
  downloadIntegrationJson,
  downloadIntegrationText,
} from "./integration-platform-storage";
import type { PublishPackageResponse } from "./integration-platform-types";
import { useIntegrationCatalog } from "./use-integration-catalog";

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

  return (
    <IntegrationPage
      eyebrow={ko ? "배포 · 게시 패키지" : "Delivery · publication package"}
      title={ko ? "게시·배포 센터" : "Publish center"}
      description={ko
        ? "공식 API 채널과 수동 업로드 채널을 같은 패키지에서 준비합니다. 공식 승인 없는 웹툰 플랫폼은 규격 검사·ZIP·복사·수동 확인까지만 제공합니다."
        : "Prepare official API channels and manual handoff channels in one package. Platforms without approved APIs remain validation and human-confirmed upload flows."}
    >
      {loading ? <IntegrationLoading /> : null}
      {error ? <IntegrationError message={error} onRetry={refresh} /> : null}
      {catalog ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><FileCheck2 size={19} aria-hidden /> {ko ? "게시 정보" : "Publication details"}</h2>
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
            <fieldset className="mt-6">
              <legend className="text-sm font-bold text-fg">{ko ? "게시 채널" : "Channels"}</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {publishingProviders.map((provider) => {
                  const inputId = `publish-channel-${provider.id}`;
                  return (
                    <div key={provider.id} className="flex items-start gap-3 rounded-xl border border-line bg-panel/50 p-3">
                      <input id={inputId} type="checkbox" checked={channels.includes(provider.id)} onChange={() => toggleChannel(provider.id)} className="mt-1" />
                      <label htmlFor={inputId} className="cursor-pointer">
                        <strong className="block text-sm text-fg">{provider.name}</strong>
                        <span className="block text-xs leading-5 text-fg-3">{provider.status} · {provider.connectionMode}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !title.trim() || !canonicalUrl.trim() || channels.length === 0}
                onClick={() => void buildPackage()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-50"
              >
                <Send size={16} aria-hidden /> {busy ? (ko ? "생성 중" : "Building") : (ko ? "패키지 만들기" : "Build package")}
              </button>
              <button type="button" disabled={busy || !canonicalUrl.trim()} onClick={() => void buildFeeds()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold text-fg">
                <Rss size={16} aria-hidden /> {ko ? "피드 미리보기" : "Preview feeds"}
              </button>
            </div>
            {message ? <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{message}</p> : null}
          </section>
          <aside className="space-y-5">
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="text-lg font-bold text-fg">{ko ? "패키지 결과" : "Package result"}</h2>
              {!result ? <p className="mt-3 text-sm leading-6 text-fg-2">{ko ? "입력과 채널을 확인한 뒤 게시 패키지를 생성하세요." : "Build a package after reviewing details and channels."}</p> : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-panel p-3"><p className="text-xs text-fg-3">{ko ? "규격" : "Valid"}</p><p className="mt-1 font-bold text-fg">{result.ready ? "PASS" : "FAIL"}</p></div>
                    <div className="rounded-xl bg-panel p-3"><p className="text-xs text-fg-3">{ko ? "직접 실행" : "Direct"}</p><p className="mt-1 font-bold text-fg">{result.directlyExecutable ? "READY" : "HANDOFF"}</p></div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {result.channels.map((channel) => (
                      <li key={channel.id} className="rounded-xl border border-line p-3 text-sm">
                        <strong className="text-fg">{channel.name ?? channel.id}</strong>
                        <span className="mt-1 block text-xs text-fg-3">{channel.mode} · {channel.status ?? "unsupported"}</span>
                      </li>
                    ))}
                  </ul>
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
      ) : null}
    </IntegrationPage>
  );
}
