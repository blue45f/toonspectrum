/**
 * 캐릭터 챗 관리 — 작가 측 승인 캐논 편집 (`/character-chat/manage`).
 *
 * 여기서 저장하는 성격·말투·세계관·금지 주제가 곧 팬 챗의 근거(승인 캐논)가
 * 된다. 저장하지 않은 설정은 챗에 쓰이지 않는다. 챗 공개는 프로필마다
 * 작가가 직접 켜는 opt-in이며, 끄면 팬 목록에서 바로 사라진다.
 *
 * 파일럿 동안 프로필은 이 브라우저에 저장된다(로그인하면 서버 미러 시도).
 * 팬 반응은 대화 내용이 아니라 활동 요약(대화 수·메시지 수·차단 횟수)으로만
 * 보여준다 — 팬의 대화를 작가가 엿보는 구조는 만들지 않는다.
 */

import { Eye, EyeOff, MessageCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { CharacterAvatar, CharacterChatThread } from "./CharacterChatThread";
import {
  characterChatProfileToDraft,
  validateCharacterChatProfileDraft,
} from "./character-chat-profile";
import { useCharacterChatStore } from "./character-chat-store";
import type {
  CharacterChatProfile,
  CharacterChatProfileDraft,
} from "./character-chat-types";
import { useCharacterChatEngine } from "./use-character-chat-engine";

const EMPTY_DRAFT: CharacterChatProfileDraft = {
  characterName: "",
  workTitle: "",
  workSlug: "",
  authorName: "",
  description: "",
  personality: "",
  speechStyle: "",
  worldview: "",
  greeting: "",
  forbiddenTopics: [],
  appearanceHint: "",
  avatarUrl: "",
  canonSheetId: "",
  chatEnabled: false,
};

function parseForbiddenTopicsInput(value: string): string[] {
  return value
    .split(/[,，、\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-fg-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[0.65rem] leading-relaxed text-fg-3">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none";

function ProfileCard({
  profile,
  onEdit,
  onToggleEnabled,
  onDelete,
  testOpen,
  onToggleTest,
}: {
  readonly profile: CharacterChatProfile;
  readonly onEdit: () => void;
  readonly onToggleEnabled: () => void;
  readonly onDelete: () => void;
  readonly testOpen: boolean;
  readonly onToggleTest: () => void;
}) {
  const t = useBilingual("characterChat");
  const activitySummary = useCharacterChatStore((state) => state.activitySummary);
  const { engine, ready } = useCharacterChatEngine();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const summary = activitySummary(profile.id);

  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <CharacterAvatar profile={profile} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <strong className="text-sm text-fg">{profile.characterName}</strong>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                profile.chatEnabled ? "bg-good/10 text-good" : "bg-fg-3/10 text-fg-3",
              )}
            >
              {profile.chatEnabled ? t("챗 공개 중", "Chat open") : t("비공개", "Private")}
            </span>
            {profile.isDemo ? (
              <span className="rounded-full bg-fg-3/10 px-2 py-0.5 text-[0.62rem] font-bold text-fg-3">
                {t("파일럿 데모", "Pilot demo")}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-fg-3">
            {profile.workTitle} · {profile.authorName || t("작가 이름 없음", "No author name")}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-2">{profile.description}</p>
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-fg-3">
            <div className="flex gap-1">
              <dt>{t("대화", "Chats")}</dt>
              <dd className="font-bold text-fg-2">{summary.sessionCount}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("팬 메시지", "Fan messages")}</dt>
              <dd className="font-bold text-fg-2">{summary.fanMessageCount}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("캐릭터 답변", "Replies")}</dt>
              <dd className="font-bold text-fg-2">{summary.characterMessageCount}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("금지 주제 차단", "Blocked topics")}</dt>
              <dd className="font-bold text-fg-2">{summary.blockedCount}</dd>
            </div>
            {summary.lastActiveAt ? (
              <div className="flex gap-1">
                <dt>{t("마지막 대화", "Last chat")}</dt>
                <dd className="font-bold text-fg-2">
                  {new Date(summary.lastActiveAt).toLocaleDateString()}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onToggleEnabled}
          aria-pressed={profile.chatEnabled}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
        >
          {profile.chatEnabled ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
          {profile.chatEnabled ? t("공개 끄기", "Close chat") : t("챗 공개하기", "Open chat")}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
        >
          <Pencil size={14} aria-hidden />
          {t("설정 수정", "Edit canon")}
        </button>
        <button
          type="button"
          onClick={onToggleTest}
          aria-expanded={testOpen}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
        >
          <MessageCircle size={14} aria-hidden />
          {t("테스트 대화", "Test chat")}
        </button>
        {profile.chatEnabled ? (
          <Link
            href={`/character-chat?character=${encodeURIComponent(profile.id)}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
          >
            {t("팬 화면에서 보기", "Open fan view")}
          </Link>
        ) : null}
        {confirmingDelete ? (
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={onDelete}
              className="min-h-11 rounded-lg bg-bad px-3 text-xs font-bold text-on-accent hover:bg-bad/90"
            >
              {t("정말 삭제", "Delete for real")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="min-h-11 rounded-lg border border-line px-3 text-xs font-bold text-fg-2"
            >
              {t("취소", "Cancel")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-2 hover:border-bad/50 hover:text-bad"
          >
            <Trash2 size={14} aria-hidden />
            {t("삭제", "Delete")}
          </button>
        )}
      </div>

      {testOpen ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-panel">
          <p className="border-b border-line bg-card px-4 py-2 text-xs font-bold text-fg-2">
            {t("테스트 대화 — 공개 전에도 여기서 캐릭터를 시험할 수 있어요", "Test chat — try the character here before opening it")}
            {!ready ? (
              <span className="ml-2 font-medium text-fg-3">
                {t("(AI 키를 등록하면 답변이 동작해요)", "(Replies need a registered AI key)")}
              </span>
            ) : null}
          </p>
          <CharacterChatThread profile={profile} engine={engine} ready={ready} />
        </div>
      ) : null}
    </li>
  );
}

export function CharacterChatManagePage() {
  const t = useBilingual("characterChat");
  const actorId = useAuthActorId();
  const profiles = useCharacterChatStore((state) => state.profiles);
  const createProfile = useCharacterChatStore((state) => state.createProfile);
  const updateProfile = useCharacterChatStore((state) => state.updateProfile);
  const removeProfile = useCharacterChatStore((state) => state.removeProfile);
  const setProfileChatEnabled = useCharacterChatStore((state) => state.setProfileChatEnabled);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CharacterChatProfileDraft>(EMPTY_DRAFT);
  const [forbiddenInput, setForbiddenInput] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [testOpenId, setTestOpenId] = useState<string | null>(null);

  const myProfiles = useMemo(
    () => profiles.filter((profile) => !profile.isDemo),
    [profiles],
  );
  const demoProfiles = useMemo(
    () => profiles.filter((profile) => profile.isDemo),
    [profiles],
  );

  const openNew = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setForbiddenInput("");
    setErrors([]);
    setEditorOpen(true);
  };

  const openEdit = (profile: CharacterChatProfile) => {
    setEditingId(profile.id);
    setDraft(characterChatProfileToDraft(profile));
    setForbiddenInput(profile.forbiddenTopics.join(", "));
    setErrors([]);
    setEditorOpen(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextDraft: CharacterChatProfileDraft = {
      ...draft,
      forbiddenTopics: parseForbiddenTopicsInput(forbiddenInput),
    };
    const validationErrors = validateCharacterChatProfileDraft(nextDraft);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    const saved = editingId
      ? updateProfile(editingId, nextDraft)
      : createProfile(nextDraft);
    if (!saved) {
      setErrors([t("저장할 수 있는 프로필 수를 넘었어요. 오래된 프로필을 지우고 다시 시도해 주세요.", "You've reached the profile limit. Delete an old profile and try again.")]);
      return;
    }
    setEditorOpen(false);
    setEditingId(null);
    setStatus(
      saved.chatEnabled
        ? t(`"${saved.characterName}" 챗을 공개했어요. 팬 화면에서 바로 대화할 수 있어요.`, `Opened the chat for "${saved.characterName}". Fans can talk right away.`)
        : t(`"${saved.characterName}" 설정을 저장했어요. 공개는 목록에서 켤 수 있어요.`, `Saved "${saved.characterName}". You can open the chat from the list.`),
    );
  };

  const renderCard = (profile: CharacterChatProfile) => (
    <ProfileCard
      key={profile.id}
      profile={profile}
      onEdit={() => openEdit(profile)}
      onToggleEnabled={() => setProfileChatEnabled(profile.id, !profile.chatEnabled)}
      onDelete={() => {
        removeProfile(profile.id);
        setStatus(t(`"${profile.characterName}" 프로필을 지웠어요.`, `Deleted "${profile.characterName}".`));
      }}
      testOpen={testOpenId === profile.id}
      onToggleTest={() => setTestOpenId((current) => (current === profile.id ? null : profile.id))}
    />
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-fg">
            {t("캐릭터 챗 관리", "Manage Character Chats")}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-2">
            {t(
              "여기서 저장한 성격·말투·세계관이 팬 챗의 근거가 돼요. 저장하지 않은 설정은 챗에 쓰이지 않고, 금지한 주제는 대화에서 다뤄지지 않아요.",
              "The personality, voice, and world you save here become the ground truth for fan chats. Unsaved canon is never used, and off-limits topics stay out of the conversation.",
            )}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Link
            href="/character-chat"
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
          >
            {t("팬 화면 보기", "Fan view")}
          </Link>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90"
          >
            <Plus size={14} aria-hidden />
            {t("새 캐릭터 챗", "New character chat")}
          </button>
        </div>
      </header>

      {!actorId ? (
        <p className="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-xs leading-relaxed text-fg-2">
          {t(
            "게스트로 쓰는 중이에요 — 프로필은 이 브라우저에만 저장돼요. 로그인하면 서버에도 보관돼서 다른 기기에서 이어 쓸 수 있어요(파일럿).",
            "You're browsing as a guest — profiles live in this browser only. Sign in to also keep them on the server and continue on other devices (pilot).",
          )}
        </p>
      ) : null}

      {status ? (
        <p role="status" className="mb-4 rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-xs font-semibold text-good">
          {status}
        </p>
      ) : null}

      {editorOpen ? (
        <form
          onSubmit={handleSubmit}
          aria-label={t("캐릭터 챗 설정 폼", "Character chat canon form")}
          className="mb-6 rounded-2xl border border-line bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-black text-fg">
              {editingId ? t("승인 캐논 수정", "Edit approved canon") : t("새 캐릭터 챗 만들기", "New character chat")}
            </h2>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              aria-label={t("폼 닫기", "Close form")}
              className="grid size-11 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-fg"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          {errors.length > 0 ? (
            <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3">
              <p className="text-xs font-bold text-bad">{t("저장 전에 확인해 주세요", "Check before saving")}</p>
              <ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-bad">
                {errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("캐릭터 이름 *", "Character name *")}>
              <input
                value={draft.characterName}
                onChange={(event) => setDraft({ ...draft, characterName: event.target.value })}
                maxLength={60}
                required
                className={inputClass}
                placeholder={t("예: 레이나", "e.g. Reina")}
              />
            </Field>
            <Field label={t("작품 이름 *", "Work title *")}>
              <input
                value={draft.workTitle}
                onChange={(event) => setDraft({ ...draft, workTitle: event.target.value })}
                maxLength={80}
                required
                className={inputClass}
              />
            </Field>
            <Field
              label={t("작품 슬러그", "Work slug")}
              hint={t("작품 페이지 주소의 slug와 같으면 작품 페이지에서 바로 연결돼요.", "Match the work page URL slug to link from the work page.")}
            >
              <input
                value={draft.workSlug}
                onChange={(event) => setDraft({ ...draft, workSlug: event.target.value })}
                maxLength={80}
                className={inputClass}
              />
            </Field>
            <Field label={t("작가 표시 이름", "Author display name")}>
              <input
                value={draft.authorName}
                onChange={(event) => setDraft({ ...draft, authorName: event.target.value })}
                maxLength={60}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("한 줄 소개", "One-line intro")} hint={t("캐릭터 목록에 보여요.", "Shown in the character list.")}>
                <input
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  maxLength={160}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("성격 *", "Personality *")} hint={t("어떤 사람인지, 무엇을 소중히 여기는지.", "Who they are and what they value.")}>
                <textarea
                  value={draft.personality}
                  onChange={(event) => setDraft({ ...draft, personality: event.target.value })}
                  rows={3}
                  maxLength={800}
                  required
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("말투 *", "Speech style *")} hint={t("예: 짧은 반말, 조심스러운 존댓말, 사투리.", "e.g. blunt short sentences, careful honorifics, dialect.")}>
                <textarea
                  value={draft.speechStyle}
                  onChange={(event) => setDraft({ ...draft, speechStyle: event.target.value })}
                  rows={2}
                  maxLength={400}
                  required
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                label={t("세계관·배경", "World & background")}
                hint={t("챗을 공개하려면 필요해요. 캐릭터가 아는 세계의 범위를 정합니다.", "Required to open the chat. Defines what the character knows.")}
              >
                <textarea
                  value={draft.worldview}
                  onChange={(event) => setDraft({ ...draft, worldview: event.target.value })}
                  rows={4}
                  maxLength={1500}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("첫 인사말", "Greeting")} hint={t("대화를 열 때 캐릭터가 먼저 건네는 말. 비우면 기본 인사를 써요.", "The first line the character says. Leave empty for a default greeting.")}>
                <textarea
                  value={draft.greeting}
                  onChange={(event) => setDraft({ ...draft, greeting: event.target.value })}
                  rows={2}
                  maxLength={300}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                label={t("금지 주제 (쉼표로 구분)", "Off-limits topics (comma separated)")}
                hint={t("스포일러나 다루기 싫은 주제를 적으면 입력과 답변 양쪽에서 막아요.", "Spoilers or topics you don't want handled — blocked in both input and replies.")}
              >
                <input
                  value={forbiddenInput}
                  onChange={(event) => setForbiddenInput(event.target.value)}
                  className={inputClass}
                  placeholder={t("예: 최종화 결말, 주인공의 정체", "e.g. the finale ending, the hero's identity")}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("외모 단서", "Appearance hint")} hint={t("팬이 캐릭터를 알아보는 단서예요.", "Cues so fans recognize the character.")}>
                <textarea
                  value={draft.appearanceHint}
                  onChange={(event) => setDraft({ ...draft, appearanceHint: event.target.value })}
                  rows={2}
                  maxLength={300}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label={t("캐릭터 이미지 URL", "Character image URL")} hint={t("http(s) 또는 사이트 내 경로만.", "http(s) or site-relative paths only.")}>
              <input
                value={draft.avatarUrl}
                onChange={(event) => setDraft({ ...draft, avatarUrl: event.target.value })}
                maxLength={500}
                className={inputClass}
              />
            </Field>
            <Field label={t("캐논 시트 ID (선택)", "Canon sheet ID (optional)")} hint={t("스튜디오 캐릭터 캐논과 연결할 때만 적어요.", "Only when linking a Studio character canon sheet.")}>
              <input
                value={draft.canonSheetId}
                onChange={(event) => setDraft({ ...draft, canonSheetId: event.target.value })}
                maxLength={80}
                className={inputClass}
              />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-fg-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.chatEnabled}
                onChange={(event) => setDraft({ ...draft, chatEnabled: event.target.checked })}
                className="size-4 accent-current"
              />
              {t("저장하면서 바로 챗 공개하기", "Open the chat as soon as I save")}
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent hover:bg-accent/90"
            >
              {editingId ? t("승인 캐논 저장", "Save approved canon") : t("캐릭터 챗 만들기", "Create character chat")}
            </button>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-fg-2 hover:border-accent/50"
            >
              {t("취소", "Cancel")}
            </button>
          </div>
        </form>
      ) : null}

      <section aria-label={t("내 캐릭터 챗", "My character chats")}>
        <h2 className="mb-3 text-base font-black text-fg">{t("내 캐릭터 챗", "My character chats")}</h2>
        {myProfiles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center text-xs leading-relaxed text-fg-3">
            {t(
              "아직 만든 캐릭터 챗이 없어요. 위의 '새 캐릭터 챗'으로 첫 캐릭터를 열어 보세요.",
              "You haven't created a character chat yet. Use 'New character chat' above to open your first one.",
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">{myProfiles.map(renderCard)}</ul>
        )}
      </section>

      {demoProfiles.length > 0 ? (
        <section aria-label={t("파일럿 데모 캐릭터", "Pilot demo characters")} className="mt-8">
          <h2 className="mb-1 text-base font-black text-fg">{t("파일럿 데모 캐릭터", "Pilot demo characters")}</h2>
          <p className="mb-3 text-xs leading-relaxed text-fg-3">
            {t(
              "파일럿 확인용으로 넣어 둔 가상의 캐릭터예요. 감을 잡는 데 쓰고, 지워도 돼요.",
              "Fictional characters included to try the pilot. Get a feel, then delete them if you like.",
            )}
          </p>
          <ul className="flex flex-col gap-3">{demoProfiles.map(renderCard)}</ul>
        </section>
      ) : null}
    </main>
  );
}
