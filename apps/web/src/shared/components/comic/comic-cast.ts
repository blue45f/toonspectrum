/** Lightweight metadata for the existing original cast; no calculation-engine dependency. */
export const COMIC_CAST = [
  { id: "ara", name: "아라", title: "사서", style: "다정한 해설", intro: "자, 오늘의 주인공을 위한 책장을 펼쳐 볼까요?", aside: "완벽한 결말보다, 마음에 남는 한 컷이면 충분해요." },
  { id: "danwoo", name: "단우", title: "도깨비", style: "유쾌한 참견", intro: "오호라! 오늘의 주인공 등장! 내가 옆에서 한마디 보태도 되지?", aside: "잠깐! 주인공의 결정권까지 내가 가져가는 건 반칙이지!" },
  { id: "leona", name: "레오나", title: "점술가", style: "상상력 한 스푼", intro: "반짝이는 단서를 따라, 아직 그리지 않은 장면을 만나 봐요.", aside: "별은 배경일 뿐, 이야기의 방향은 당신이 정해요." },
  { id: "gaon", name: "가온", title: "검객", style: "담백한 응원", intro: "긴 설명보다 한 컷. 오늘 할 수 있는 작은 선택부터 보자.", aside: "남의 속도에 맞추지 마. 네 다음 컷은 네가 그리는 거야." },
] as const;
export type ComicCastId = (typeof COMIC_CAST)[number]["id"];
export type ComicMood = "spark" | "heart" | "quest" | "rest";
export function comicCast(value: unknown) {
  return COMIC_CAST.find((actor) => actor.id === value) ?? COMIC_CAST[0];
}
export function comicMood(value: unknown): ComicMood {
  return value === "heart" || value === "quest" || value === "rest" ? value : "spark";
}
export function comicPortrait(id: ComicCastId): string {
  return `/images/characters/${comicCast(id).id}.jpg`;
}
/** Allowlisted presentation choices only; personal input is never serialized. */
export function comicPlayLink(cast: ComicCastId, mood: ComicMood = "spark"): string {
  return `/play?game=motion-panel&cast=${comicCast(cast).id}&mood=${comicMood(mood)}`;
}
