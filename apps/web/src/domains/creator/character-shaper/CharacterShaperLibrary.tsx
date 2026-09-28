import { Check, Plus, Search, UserRound } from "lucide-react";
import { useRef, useState } from "react";

import { resolveVrmLibraryEntryDisplayName } from "../vrm/studio-vrm-display-name";
import { discoverCharacterLibrary } from "./character-shaper-reference-model";

import type { CharacterLibraryCollection } from "./character-shaper-reference-model";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

import { useI18n, useT } from "@/shared/lib/i18n";

/** 등록된 모델의 썸네일만 쓴다. 실패한 이미지를 가상의 고품질 모델로 대체하지 않는다. */
function CharacterPortrait({ entry }: { readonly entry: VrmLibraryEntry }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className="character-library__portrait">
    {entry.thumbnail && entry.thumbnail !== failedUrl ? (
      <img src={entry.thumbnail} alt="" loading="lazy" decoding="async" draggable={false}
        onError={() => setFailedUrl(entry.thumbnail)} />
    ) : <UserRound size={25} aria-hidden />}
  </span>;
}

export function CharacterShaperLibrary({ h, binding }: {
  readonly h: StudioVrmPoserHost;
  readonly binding: CharacterShaperBinding;
}) {
  const t = useT();
  const locale = useI18n((state) => state.lang);
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<CharacterLibraryCollection>("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const entries: readonly VrmLibraryEntry[] = Array.isArray(h.libraryEntries) ? h.libraryEntries : [];
  const visible = discoverCharacterLibrary(entries, query, collection);
  const locked = h.status === "loading" || binding.busyReason !== null || binding.compareActive
    || Boolean(h.isCapturing || h.isThumbnailCapturing || h.isSharingPose || h.texturePaintModeSelected);

  return <aside data-character-library="true" aria-label={t("studio.character.library.title", "캐릭터 라이브러리")}
    className="character-library">
    <header className="character-library__header">
      <div className="character-library__heading"><h3>{t("studio.character.library.characters", "캐릭터")}</h3><span>{entries.length}</span></div>
      <div role="group" aria-label={t("studio.character.library.collection", "캐릭터 모아보기")} className="character-library__collections">
        <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")}>{t("studio.character.library.all", "전체 캐릭터")}</button>
        <button type="button" aria-pressed={collection === "mine"} onClick={() => setCollection("mine")}>{t("studio.character.library.mine", "내 캐릭터")}</button>
      </div>
      <label className="character-library__search"><Search size={14} aria-hidden />
        <input type="text" aria-label={t("studio.character.library.search", "캐릭터 검색")} value={query}
          maxLength={120} autoComplete="off" enterKeyHint="search"
          placeholder={t("studio.character.library.searchPlaceholder", "이름으로 찾기")}
          onChange={(event) => setQuery(event.currentTarget.value)} />
      </label>
    </header>
    <div className="character-library__scroll">
      {visible.length ? <ul className="character-library__list">
        {visible.map((entry) => {
          const name = resolveVrmLibraryEntryDisplayName(entry, locale);
          const selected = entry.id === h.activeModelId;
          return <li key={entry.id}><button type="button" data-character-library-entry={entry.id}
            aria-label={`${t("studio.character.library.select", "캐릭터 선택")}: ${name}`}
            aria-pressed={selected} disabled={locked}
            title={binding.busyReason ?? name}
            onClick={() => {
              if (locked || selected) return;
              binding.cancelPreview?.();
              h.loadModelFromLibraryEntry(entry);
            }}>
            <CharacterPortrait entry={entry} />
            <span className="character-library__name"><strong>{name}</strong><small>{entry.source === "sample"
              ? t("studio.character.library.bundled", "기본 캐릭터") : t("studio.character.library.imported", "가져온 캐릭터")}</small></span>
            {selected ? <Check size={14} aria-hidden className="character-library__check" /> : null}
          </button></li>;
        })}
      </ul> : <p role="status" className="character-library__empty">{query.trim()
        ? t("studio.character.library.noResults", "일치하는 캐릭터가 없습니다.")
        : t("studio.character.library.empty", "내 VRM 파일을 가져와 캐릭터를 추가하세요.")}</p>}
    </div>
    <footer className="character-library__footer">
      <button type="button" className="character-library__import" disabled={locked} onClick={() => fileRef.current?.click()}>
        <Plus size={17} aria-hidden />{t("studio.character.library.import", "캐릭터 가져오기")}
      </button>
      <input ref={fileRef} type="file" accept=".vrm" multiple className="sr-only" tabIndex={-1}
        aria-label={t("studio.character.library.importFile", "라이브러리에 VRM 가져오기")}
        disabled={locked} onChange={(event) => {
          if (locked) return;
          binding.cancelPreview?.();
          void h.handleFileChange?.(event);
        }} />
      <p>{t("studio.character.library.localHint", "내 모델과 저장한 캐릭터로 이어서 작업하세요.")}</p>
    </footer>
  </aside>;
}
