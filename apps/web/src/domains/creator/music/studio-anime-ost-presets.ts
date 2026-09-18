import type { MusicBrief } from "@toonspectrum/core/studio-music";

export interface AnimeOstStarter {
  readonly id: string;
  readonly label: string;
  readonly badge: string;
  readonly description: string;
  readonly patch: Partial<MusicBrief>;
}

export const ANIME_OST_STARTERS: readonly AnimeOstStarter[] = [
  {
    id: "opening-youth",
    label: "청춘 애니 OP",
    badge: "OPENING",
    description: "첫 3초 훅 → 달리는 벌스 → 터지는 후렴",
    patch: { title: "페이지 너머로", mood: "youth", purpose: "opening", bpm: 148, instruments: ["guitar", "drums", "bass", "synth"], vocals: true, vocalStyle: "bright-heroine", songStructure: "anime-op", lyricTheme: "미완성인 우리도 함께 달리면 다음 페이지를 열 수 있다", intensity: "cinematic", arc: "build", loop: false },
  },
  {
    id: "ending-afterglow",
    label: "감성 애니 ED",
    badge: "ENDING",
    description: "마지막 컷의 여운을 보컬과 피아노로 길게 연결",
    patch: { title: "별이 된 컷", mood: "sad", purpose: "ending", bpm: 74, instruments: ["piano", "strings", "guitar"], vocals: true, vocalStyle: "emotional-heroine", songStructure: "anime-ed", lyricTheme: "헤어져도 같은 별빛 아래에서 서로의 기억은 이어진다", intensity: "balanced", arc: "resolve", loop: false },
  },
  {
    id: "fantasy-theme",
    label: "판타지 메인 테마",
    badge: "MAIN THEME",
    description: "세계관의 신비감과 모험의 상승감을 한 곡에",
    patch: { title: "문 너머의 세계", mood: "fantasy", purpose: "ost", bpm: 124, instruments: ["strings", "bells", "drums", "synth"], vocals: true, vocalStyle: "dreamy-air", songStructure: "anime-op", lyricTheme: "닫힌 문을 넘어 낯선 세계에서 스스로의 이름과 용기를 찾아간다", intensity: "cinematic", arc: "build", loop: false },
  },
  {
    id: "romance-theme",
    label: "로맨스 캐릭터 송",
    badge: "CHARACTER",
    description: "두 인물의 감정 차이를 벌스와 후렴에 대비",
    patch: { title: "같은 장면, 다른 마음", mood: "romance", purpose: "ost", bpm: 96, instruments: ["piano", "guitar", "strings"], vocals: true, vocalStyle: "duet", songStructure: "character-song", lyricTheme: "같은 순간을 서로 다르게 기억하는 두 사람의 엇갈린 고백", intensity: "balanced", arc: "resolve", loop: false },
  },
  {
    id: "battle-theme",
    label: "액션 각성 테마",
    badge: "BATTLE",
    description: "빠른 드럼·기타와 파워 보컬로 각성 순간을 압축",
    patch: { title: "한계를 넘어", mood: "action", purpose: "opening", bpm: 164, instruments: ["drums", "guitar", "bass", "synth"], vocals: true, vocalStyle: "power-vocal", songStructure: "battle-insert", lyricTheme: "무너질수록 더 강하게 일어나 끝내 자신의 한계를 깨뜨린다", intensity: "cinematic", arc: "build", loop: false },
  },
  {
    id: "creator-theme",
    label: "창작자 테마 송",
    badge: "TOONSTUDIO",
    description: "빈 캔버스에서 세계가 완성되는 ToonSpectrum 시그니처 곡",
    patch: { title: "우리가 그린 세계", mood: "youth", purpose: "opening", bpm: 138, instruments: ["guitar", "drums", "synth", "strings"], vocals: true, vocalStyle: "youthful-hero", songStructure: "anime-op", lyricTheme: "빈 캔버스에 각자의 상상을 겹쳐 하나의 세계를 완성한다", intensity: "cinematic", arc: "build", loop: false },
  },
  {
    id: "city-pop-character",
    label: "시티팝 캐릭터 송",
    badge: "CITY POP",
    description: "네온빛 밤거리와 캐릭터의 솔직한 속마음을 매끈한 그루브로",
    patch: { title: "네온 사이의 진심", mood: "office", purpose: "ost", bpm: 112, instruments: ["piano", "bass", "synth", "drums"], vocals: true, vocalStyle: "bright-heroine", songStructure: "city-pop", lyricTheme: "도시의 불빛 속에서는 숨기던 마음도 조금씩 솔직해진다", intensity: "balanced", arc: "resolve", loop: false },
  },
] as const;
