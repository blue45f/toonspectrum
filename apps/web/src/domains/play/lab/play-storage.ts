import { useEffect, useState } from "react";

import { koreaDay } from "./creative-core";

const PREFIX = "toonstudio.play.";
const CHANGE = "toonstudio:play-journal";
const JOURNAL_KEY = `${PREFIX}journal.v1`;
export type PlayResult = { id: string; game: string; label: string; day: string; score?: number };
export type PlayJournal = { favorites: string[]; recent: string[]; results: PlayResult[] };
const emptyJournal = (): PlayJournal => ({ favorites: [], recent: [], results: [] });
const validId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,100}$/.test(value);
const isResult = (value: unknown): value is PlayResult => {
  if (!value || typeof value !== "object") return false;
  const r = value as PlayResult;
  return validId(r.id) && validId(r.game) && typeof r.label === "string" && r.label.length <= 160 && /^\d{4}-\d{2}-\d{2}$/.test(r.day) && (r.score === undefined || (Number.isFinite(r.score) && r.score >= 0 && r.score <= 100));
};
export function readJournal(): PlayJournal {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "null");
    if (!value || typeof value !== "object") return emptyJournal();
    const journal = value as PlayJournal;
    const ids = (values: unknown) => Array.isArray(values) ? [...new Set(values.filter(validId))].slice(0, 40) : [];
    return { favorites: ids(journal.favorites), recent: ids(journal.recent).slice(0, 6), results: Array.isArray(journal.results) ? journal.results.filter(isResult).slice(0, 100) : [] };
  } catch { return emptyJournal(); }
}
function writeJournal(value: PlayJournal): boolean {
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGE));
    return true;
  } catch { return false; }
}
export function recordVisit(game: string): void {
  if (!validId(game)) return;
  const journal = readJournal();
  if (journal.recent[0] === game) return;
  writeJournal({ ...journal, recent: [game, ...journal.recent.filter((id) => id !== game)].slice(0, 6) });
}
export function recordResult(result: Omit<PlayResult, "day">): boolean {
  const entry = { ...result, day: koreaDay() };
  if (!isResult(entry)) return false;
  const journal = readJournal();
  if (journal.results.some((r) => r.id === entry.id)) return true;
  return writeJournal({ ...journal, results: [entry, ...journal.results].slice(0, 100) });
}
export function usePlayJournal() {
  const [journal, setJournal] = useState(readJournal);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    const sync = () => setJournal(readJournal());
    const storage = (event: StorageEvent) => { if (!event.key || event.key === JOURNAL_KEY) sync(); };
    window.addEventListener(CHANGE, sync); window.addEventListener("storage", storage);
    return () => { window.removeEventListener(CHANGE, sync); window.removeEventListener("storage", storage); };
  }, []);
  const toggleFavorite = (game: string) => {
    const current = readJournal();
    const favorites = current.favorites.includes(game) ? current.favorites.filter((id) => id !== game) : [...current.favorites, game].slice(-40);
    const next = { ...current, favorites };
    setJournal(next);
    setWarning(writeJournal(next) ? "" : "저장 공간을 사용할 수 없어 즐겨찾기는 새로고침 후 유지되지 않습니다.");
  };
  return { journal, toggleFavorite, warning };
}
/** Bounded, validated local drafts. Storage failure never prevents editing. */
export function usePlayDraft<T>(name: string, initial: () => T, validate: (value: unknown) => value is T) {
  const key = `${PREFIX}${name}.v1`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw && raw.length < 2000000) {
        const parsed: unknown = JSON.parse(raw);
        if (validate(parsed)) return parsed;
      }
    } catch { /* Editing must remain available with blocked or corrupted storage. */ }
    return initial();
  });
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    try {
      const raw = JSON.stringify(value);
      if (raw.length >= 2000000) { setSaved(false); return; }
      localStorage.setItem(key, raw); setSaved(true);
    } catch { setSaved(false); }
  }, [key, value]);
  return { value, setValue, saved };
}
