/**
 * 캐릭터 토크 — 팬 채팅 페이지 (`/character-chat`, 파일럿).
 *
 * 작가가 챗 공개를 켠(opt-in) 캐릭터와 대화한다. 대화의 근거는 작가가 승인한
 * 캐논 프로필(성격·말투·세계관·금지 주제)뿐이다. 엔진은 어댑터 뒤에 있다 —
 * 파일럿에서는 독자·작가가 등록한 자기 AI 키(BYOK)로 동작하고, 키가 없으면
 * "준비 중/키 등록 안내"를 보여준다. 캐릭터 목록과 인사말은 로그인 없이도
 * 볼 수 있다.
 */

import { KeyRound, MessageCircle, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { USER_AI_SETTINGS_HREF } from "@/shared/ai/user-ai-types";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { CharacterAvatar, CharacterChatThread } from "./CharacterChatThread";
import {
  findPublicProfileForWork,
  selectPublicCharacterChatProfiles,
} from "./character-chat-profile";
import { useCharacterChatStore } from "./character-chat-store";
import { useCharacterChatEngine } from "./use-character-chat-engine";

export function CharacterChatPage() {
  const t = useBilingual("characterChat");
  const { engine, ready } = useCharacterChatEngine();
  const [searchParams] = useSearchParams();
  const profiles = useCharacterChatStore((state) => state.profiles);

  const publicProfiles = useMemo(
    () => selectPublicCharacterChatProfiles(profiles),
    [profiles],
  );

  const workSlugParam = searchParams.get("work");
  const characterParam = searchParams.get("character");
  const workMatched = useMemo(
    () => findPublicProfileForWork(profiles, workSlugParam),
    [profiles, workSlugParam],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedProfile = useMemo(() => {
    const bySelection = selectedId
      ? publicProfiles.find((profile) => profile.id === selectedId)
      : undefined;
    const byParam = characterParam
      ? publicProfiles.find((profile) => profile.id === characterParam)
      : undefined;
    // 직접 고른 캐릭터가 진입 파라미터보다 우선한다(파라미터는 첫 진입용).
    return bySelection ?? byParam ?? workMatched ?? publicProfiles[0] ?? null;
  }, [characterParam, publicProfiles, selectedId, workMatched]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">
            <Sparkles size={13} className="mr-1 inline" aria-hidden />
            {t("파일럿", "Pilot")}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-fg">
            {t("캐릭터 토크", "Character Talk")}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-2">
            {t(
              "작가가 승인한 설정 그대로, 작품 속 캐릭터와 대화해 보세요. 작가가 금지한 주제는 대화에 나오지 않아요.",
              "Chat with characters exactly as their authors approved. Topics the author marked off-limits never come up.",
            )}
          </p>
        </div>
        <Link
          href="/character-chat/manage"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
        >
          <MessageCircle size={14} aria-hidden />
          {t("작가이신가요? 캐릭터 챗 열기", "Are you an author? Open a character chat")}
        </Link>
      </header>

      {!ready ? (
        <section
          aria-label={t("AI 키 등록 안내", "AI key setup notice")}
          className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-4"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
            <KeyRound size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-fg">
              {t("지금은 파일럿 기간이에요", "We're in pilot for now")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
              {t(
                "캐릭터 토크는 등록한 AI 키로 동작해요. 키를 등록하면 바로 대화를 시작할 수 있고, 등록 전에는 캐릭터와 인사말까지만 볼 수 있어요.",
                "Character Talk runs on your own registered AI key. Register a key to start chatting — until then, you can still meet the characters and read their greetings.",
              )}
            </p>
          </div>
          <Link
            href={USER_AI_SETTINGS_HREF}
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90"
          >
            {t("AI 키 등록하러 가기", "Register an AI key")}
          </Link>
        </section>
      ) : null}

      {workSlugParam && !workMatched ? (
        <p role="status" className="mb-4 rounded-xl border border-line bg-panel px-4 py-3 text-xs text-fg-2">
          {t(
            "이 작품은 아직 캐릭터 챗을 열지 않았어요. 대신 지금 열린 캐릭터들과 대화할 수 있어요.",
            "This work hasn't opened a character chat yet. You can still talk with the characters below.",
          )}
        </p>
      ) : null}

      {publicProfiles.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center">
          <p className="text-sm font-bold text-fg">
            {t("아직 열린 캐릭터 챗이 없어요", "No character chats are open yet")}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-fg-3">
            {t(
              "작가가 캐릭터 챗을 공개하면 여기에 나타나요. 작가라면 먼저 내 캐릭터부터 열어 보세요.",
              "When an author opens a character chat, it shows up here. If you're an author, try opening your own character first.",
            )}
          </p>
          <Link
            href="/character-chat/manage"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90"
          >
            {t("캐릭터 챗 관리로 가기", "Go to chat management")}
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <section aria-label={t("대화할 캐릭터", "Characters to chat with")}>
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {publicProfiles.map((profile) => {
                const active = profile.id === selectedProfile?.id;
                return (
                  <li key={profile.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => setSelectedId(profile.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-56 items-center gap-3 rounded-2xl border p-3 text-left lg:w-full",
                        active
                          ? "border-accent bg-accent-soft/50"
                          : "border-line bg-card hover:border-accent/40",
                      )}
                    >
                      <CharacterAvatar profile={profile} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <strong className="truncate text-sm text-fg">{profile.characterName}</strong>
                          {profile.isDemo ? (
                            <span className="rounded-full bg-fg-3/10 px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-3">
                              {t("데모", "Demo")}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-fg-3">
                          {profile.workTitle} · {profile.authorName}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-fg-2">
                          {profile.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {selectedProfile ? (
            <section
              aria-label={t(`${selectedProfile.characterName}와의 대화`, `Chat with ${selectedProfile.characterName}`)}
              className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel"
            >
              <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-3">
                <CharacterAvatar profile={selectedProfile} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-fg">
                    {selectedProfile.characterName}
                    <span className="ml-2 text-xs font-medium text-fg-3">{selectedProfile.workTitle}</span>
                  </p>
                  <p className="truncate text-xs text-fg-3">
                    {t("작가가 승인한 설정으로 대화해요", "Chatting with author-approved canon")}
                  </p>
                </div>
                {selectedProfile.workSlug ? (
                  <Link
                    href={`/title/${encodeURIComponent(selectedProfile.workSlug)}`}
                    className="text-xs font-semibold text-accent hover:text-accent-2"
                  >
                    {t("작품 보러 가기", "View work")}
                  </Link>
                ) : null}
              </div>
              <CharacterChatThread profile={selectedProfile} engine={engine} ready={ready} />
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
