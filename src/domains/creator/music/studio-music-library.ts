import { MUSIC_MAX_BYTES, parseMusicBrief } from "@/lib/studio-music";

import type { LocalMusicTrack } from "./studio-music-client";

const DATABASE = "toonstudio-music-v1";
const STORE = "tracks";
const MAX_TRACKS = 20;
interface StoredTrack extends LocalMusicTrack { id: string }
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("이 브라우저는 음원 보관함을 지원하지 않습니다.")); return; }
    const request = indexedDB.open(DATABASE, 1);
    let finished = false;
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("기기 보관함 연결이 지연되고 있습니다. MP3를 별도로 다운로드해 주세요."), 5000);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("owner", "ownerId");
    };
    request.onerror = () => fail("음원 보관함을 열지 못했습니다. MP3를 다운로드해 주세요.");
    request.onblocked = () => fail("다른 창에서 음원 보관함을 사용하고 있습니다.");
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      finished = true;
      clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
function validTrack(value: unknown, ownerId: string): value is StoredTrack {
  if (!value || typeof value !== "object") return false;
  const track = value as StoredTrack;
  if (track.ownerId !== ownerId || !(track.audio instanceof Blob) || track.audio.type !== "audio/mpeg" || track.audio.size < 11 || track.audio.size > MUSIC_MAX_BYTES || !track.metadata || track.id !== track.metadata.id || !/^[a-f0-9-]{36}$/.test(track.id) || !Number.isFinite(Date.parse(track.metadata.createdAt))) return false;
  try { parseMusicBrief(track.metadata.brief); return true; } catch { return false; }
}
export async function loadMusicTracks(ownerId: string): Promise<LocalMusicTrack[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).index("owner").getAll(IDBKeyRange.only(ownerId), MAX_TRACKS);
      transaction.oncomplete = () => resolve((request.result as unknown[]).filter((value): value is StoredTrack => validTrack(value, ownerId)).sort((a, b) => b.metadata.createdAt.localeCompare(a.metadata.createdAt)));
      transaction.onerror = () => reject(new Error("보관함을 읽지 못했습니다."));
      transaction.onabort = () => reject(new Error("보관함 읽기가 취소되었습니다."));
    });
  } finally { db.close(); }
}
export async function saveMusicTrack(track: LocalMusicTrack): Promise<void> {
  if (!validTrack({ ...track, id: track.metadata.id }, track.ownerId)) throw new Error("저장할 음원을 확인해 주세요.");
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.index("owner").getAll(IDBKeyRange.only(track.ownerId), MAX_TRACKS + 1);
      let full = false;
      request.onsuccess = () => {
        if (request.result.length >= MAX_TRACKS && !request.result.some((item: StoredTrack) => item.id === track.metadata.id)) { full = true; transaction.abort(); return; }
        store.put({ ...track, id: track.metadata.id });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("기기 저장 공간이 부족하거나 보관함에 접근할 수 없습니다. MP3를 다운로드해 주세요."));
      transaction.onabort = () => reject(new Error(full ? "보관함은 계정당 20곡까지입니다. MP3를 먼저 다운로드하거나 기존 곡을 삭제해 주세요." : "음원을 저장하지 못했습니다. MP3를 다운로드해 주세요."));
    });
  } finally { db.close(); }
}
export async function deleteMusicTrack(id: string, ownerId: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.get(id);
      request.onsuccess = () => { if (request.result?.ownerId === ownerId) store.delete(id); };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("음원을 삭제하지 못했습니다."));
      transaction.onabort = () => reject(new Error("삭제가 취소되었습니다."));
    });
  } finally { db.close(); }
}
