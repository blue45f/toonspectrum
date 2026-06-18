/**
 * Studio Clips — 재사용 클립 보관함(코미포/툰스푼식 에셋 재사용).
 *
 * 선택한 요소(또는 그룹)를 "클립"으로 저장해 두고, 다른 컷·다른 회차에서 한 번에 다시
 * 꺼내 쓴다. 포즈 잡은 캐릭터, 스타일 맞춘 말풍선 세트, 자주 쓰는 효과 조합 등을 매번
 * 새로 만들지 않아 연재 제작 시간을 크게 줄인다.
 *
 * 이 모듈은 저장소(localStorage 호환 인터페이스)를 주입받아 순수하게 동작한다 — 요소
 * 직렬화(els)는 메인 루프가 El로 캐스팅한다. JSON 파싱 실패·저장소 부재는 안전하게 무시.
 */

export interface StudioClip {
  id: string;
  name: string;
  createdAt: number;
  /** 직렬화된 요소 배열(원점 기준으로 정규화되어 저장됨). 메인 루프가 El[]로 캐스팅. */
  els: unknown[];
}

export interface ClipStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CLIPS_KEY = "toonspectrum-studio-clips";
export const MAX_CLIPS = 40;

function isClip(v: unknown): v is StudioClip {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.createdAt === "number" &&
    Array.isArray(o.els)
  );
}

/** 저장된 클립 목록(최신 우선). 저장소 부재·파싱 실패 시 빈 배열. */
export function listClips(storage: ClipStorage | null | undefined): StudioClip[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CLIPS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isClip);
  } catch {
    return [];
  }
}

function persist(storage: ClipStorage | null | undefined, clips: StudioClip[]): void {
  if (!storage) return;
  try {
    storage.setItem(CLIPS_KEY, JSON.stringify(clips));
  } catch {
    // 저장 불가(쿼터 초과·시크릿 모드) — 무시
  }
}

/** 클립 저장(맨 앞에 추가, 같은 id는 교체, 최대 MAX_CLIPS개로 제한). 새 목록 반환. */
export function saveClip(storage: ClipStorage | null | undefined, clip: StudioClip): StudioClip[] {
  const next = [clip, ...listClips(storage).filter((c) => c.id !== clip.id)].slice(0, MAX_CLIPS);
  persist(storage, next);
  return next;
}

/** 클립 삭제. 새 목록 반환. */
export function removeClip(storage: ClipStorage | null | undefined, id: string): StudioClip[] {
  const next = listClips(storage).filter((c) => c.id !== id);
  persist(storage, next);
  return next;
}
