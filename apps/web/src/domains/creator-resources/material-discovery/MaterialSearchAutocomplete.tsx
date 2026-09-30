import { useEffect, useId, useRef, useState } from "react";
import { Clock3, Search, TrendingUp, X } from "lucide-react";

import type { MaterialAsset } from "../material-atlas/model";
import { RESOURCE_INPUT } from "../navigation";
import {
  TRENDING_MATERIAL_KEYWORDS,
  buildMaterialSuggestions,
  clearRecentMaterialSearches,
  getRecentMaterialSearches,
} from "./material-search-ux";
import "./material-discovery.css";

interface Props {
  value: string;
  assets: readonly MaterialAsset[];
  onChange: (value: string) => void;
  onSubmitSearch: (value: string) => void;
}

/** 자동완성·인기 검색어·최근 검색을 담은 소재 검색창. */
export function MaterialSearchAutocomplete({ value, assets, onChange, onSubmitSearch }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(() => getRecentMaterialSearches());
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = `${inputId}-suggest`;
  const suggestions = buildMaterialSuggestions(value, assets);
  const showDropdown = open && (suggestions.length > 0 || recent.length > 0 || !value.trim());

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);
  useEffect(() => { setActive(-1); }, [value]);

  const flatOptions: string[] = [
    ...(!value.trim() ? [] : suggestions.map((s) => s.value)),
    ...(!value.trim() ? [...TRENDING_MATERIAL_KEYWORDS.slice(0, 6)] : []),
    ...recent.filter((term) => !value.trim() || term.toLowerCase().includes(value.trim().toLowerCase())),
  ].filter((term, index, all) => all.indexOf(term) === index).slice(0, 10);

  const choose = (term: string) => {
    onChange(term);
    setRecent(getRecentMaterialSearches());
    setOpen(false);
    onSubmitSearch(term);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" && flatOptions.length) { event.preventDefault(); setActive((i) => (i + 1) % flatOptions.length); }
    else if (event.key === "ArrowUp" && flatOptions.length) { event.preventDefault(); setActive((i) => (i - 1 + flatOptions.length) % flatOptions.length); }
    else if (event.key === "Enter" && active >= 0 && flatOptions[active]) { event.preventDefault(); choose(flatOptions[active]); }
    else if (event.key === "Escape") { setOpen(false); }
  };
  return <div ref={wrapRef} className="md-search-wrap min-w-0">
    <label htmlFor={inputId} className="min-w-0 text-sm font-semibold">검색어</label>
    <div className="relative mt-2">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
      <input id={inputId} type="search" autoComplete="off" role="combobox" aria-expanded={showDropdown} aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className={`${RESOURCE_INPUT} pl-9 pr-9`} value={value} maxLength={80}
        placeholder="예: 벚꽃 배경, 한복 캐릭터, 나무 질감…"
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => { setRecent(getRecentMaterialSearches()); setOpen(true); }}
        onKeyDown={onKeyDown} />
      {value && <button type="button" aria-label="검색어 지우기" onClick={() => onChange("")}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-fg-3 hover:bg-raised hover:text-fg"><X size={15} aria-hidden="true" /></button>}
    </div>
    {showDropdown && <div id={listId} role="listbox" aria-label="검색어 제안" className="md-suggest">
      {!value.trim() && <>
        <p className="md-suggest-section"><TrendingUp size={12} aria-hidden="true" className="mr-1 inline" />인기 검색어</p>
        {TRENDING_MATERIAL_KEYWORDS.slice(0, 6).map((term, index) => <button type="button" key={term} role="option" id={`${listId}-${index}`}
          aria-selected={active === index} data-active={active === index} onClick={() => choose(term)}>
          <TrendingUp size={14} aria-hidden="true" className="text-accent" />{term}<span className="md-suggest-kind">인기</span></button>)}
      </>}
      {value.trim() && suggestions.length > 0 && <>
        <p className="md-suggest-section">추천 검색어</p>
        {suggestions.map((suggestion, index) => <button type="button" key={`${suggestion.kind}:${suggestion.value}`} role="option" id={`${listId}-${index}`}
          aria-selected={active === index} data-active={active === index} onClick={() => choose(suggestion.value)}>
          <Search size={14} aria-hidden="true" className="text-fg-3" />{suggestion.value}
          <span className="md-suggest-kind">{suggestion.kind === "tag" ? `소재 ${suggestion.count}개` : suggestion.kind === "keyword" ? "인기" : "제목"}</span></button>)}
      </>}
      {recent.length > 0 && <>
        <p className="md-suggest-section"><Clock3 size={12} aria-hidden="true" className="mr-1 inline" />최근 검색어
          <button type="button" className="ml-2 font-normal normal-case tracking-normal underline" onClick={(event) => { event.stopPropagation(); clearRecentMaterialSearches(); setRecent([]); }}>지우기</button></p>
        {recent.filter((term) => !value.trim() || term.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 5).map((term) => <button type="button" key={`recent:${term}`} role="option" aria-selected={false}
          onClick={() => choose(term)}><Clock3 size={14} aria-hidden="true" className="text-fg-3" />{term}<span className="md-suggest-kind">최근</span></button>)}
      </>}
    </div>}
  </div>;
}
