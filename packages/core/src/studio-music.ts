/** Shared, dependency-free contract. Music generation is not the ambient synthesizer. */
export const MUSIC_MOODS = [
  { id: "romance", label: "설레는 로맨스", hint: "첫 만남 · 고백 · 재회", style: "tender romantic piano, warm strings, delicate hopeful melody", scene: "비가 그친 골목, 두 주인공이 같은 우산 아래에서 처음 눈을 마주친다.", bpm: 78 },
  { id: "action", label: "질주하는 액션", hint: "추격 · 결투 · 역전", style: "driving cinematic percussion, tight bass, heroic rhythmic motif", scene: "막다른 옥상에서 주인공이 숨을 고른 뒤 마지막 반격을 시작한다.", bpm: 144 },
  { id: "fantasy", label: "신비로운 판타지", hint: "마법 · 모험 · 새로운 세계", style: "magical orchestral celesta, airy woodwinds, expansive wonder", scene: "오래된 문이 열리자 별빛으로 떠 있는 도서관이 모습을 드러낸다.", bpm: 92 },
  { id: "thriller", label: "숨죽이는 스릴러", hint: "단서 · 잠입 · 반전", style: "sparse dark suspense, muted pulses, evolving tension without jump-scare peaks", scene: "불 꺼진 복도 끝에서 주인공의 발걸음과 똑같은 소리가 들려온다.", bpm: 100 },
  { id: "healing", label: "포근한 일상", hint: "휴식 · 산책 · 작은 행복", style: "cozy acoustic guitar, mellow piano, gentle relaxed rhythm", scene: "작은 빵집에서 하루를 마무리하며 친구들과 갓 구운 빵을 나눈다.", bpm: 72 },
  { id: "sad", label: "먹먹한 이별", hint: "상실 · 회상 · 그리움", style: "intimate felt piano, restrained cello, bittersweet unresolved harmony", scene: "기차가 떠난 자리에서 마지막 편지를 펼쳐 읽는다.", bpm: 64 },
  { id: "comedy", label: "통통 튀는 코미디", hint: "티키타카 · 소동 · 반응", style: "playful pizzicato strings, bouncy clarinet, light comic timing", scene: "완벽한 계획이라 믿었던 도시락 작전이 사소한 실수로 엉망이 된다.", bpm: 118 },
  { id: "epic", label: "벅찬 클라이맥스", hint: "각성 · 승리 · 대단원", style: "triumphant orchestral crescendo, bold brass, emotional soaring melody", scene: "흩어졌던 동료들이 다시 모이고 주인공이 모두를 향해 손을 내민다.", bpm: 126 },
  { id: "noir", label: "도시의 누아르", hint: "비 오는 밤 · 독백 · 비밀", style: "smoky noir jazz, brushed drums, muted trumpet, nocturnal atmosphere", scene: "네온빛이 번지는 창밖을 보며 탐정이 오래된 사건의 사진을 꺼낸다.", bpm: 84 },
  { id: "youth", label: "찬란한 청춘", hint: "성장 · 도전 · 첫 무대", style: "bright indie pop, uplifting guitar, youthful energetic original hook", scene: "텅 빈 공연장에서 연습하던 밴드가 처음으로 서로의 박자를 맞춘다.", bpm: 128 },
  { id: "royal", label: "로판 궁정", hint: "무도회 · 계약 결혼 · 황궁", style: "elegant chamber orchestra, harp, graceful waltz pulse, romantic courtly intrigue", scene: "가면무도회가 끝나기 직전, 황태자가 낯선 영애에게 마지막 춤을 청한다.", bpm: 96 },
  { id: "regression", label: "회귀·각성", hint: "두 번째 삶 · 운명 개척 · 능력 해방", style: "dark clockwork pulses opening into determined cinematic strings and rising synth", scene: "죽음 직전의 기억이 되감기고 주인공은 모든 비극이 시작된 아침에 눈을 뜬다.", bpm: 116 },
  { id: "hunter", label: "헌터·던전", hint: "레이드 · 보스전 · 게이트", style: "hybrid orchestral electronics, tactical percussion, heavy low strings, controlled battle energy", scene: "봉쇄된 게이트 안에서 마지막 파티원이 보스의 약점을 발견한다.", bpm: 138 },
  { id: "martial", label: "무협·동양 판타지", hint: "비무 · 강호 · 검의 깨달음", style: "cinematic East Asian ensemble, bamboo flute, plucked zither, powerful frame drums", scene: "대나무 숲의 바람이 멎고 두 검객이 마지막 초식을 펼친다.", bpm: 108 },
  { id: "horror", label: "공포 스크롤", hint: "금기 · 기척 · 서늘한 발견", style: "minimal horror ambience, bowed textures, distant metallic resonance, slow dread", scene: "끝이 보이지 않는 세로 계단에서 한 칸씩 젖은 발자국이 생겨난다.", bpm: 68 },
  { id: "school", label: "학원·캠퍼스", hint: "등굣길 · 축제 · 첫사랑", style: "fresh pop rock, clean guitar, bright drums, innocent melodic lift", scene: "축제 준비로 남은 교실에서 두 사람만 동시에 웃음을 터뜨린다.", bpm: 124 },
  { id: "office", label: "오피스 로맨스", hint: "야근 · 밀당 · 비밀 연애", style: "polished city pop, warm electric piano, restrained groove, sophisticated romantic tension", scene: "늦은 회의가 끝난 엘리베이터에서 두 사람의 손이 같은 버튼을 누른다.", bpm: 102 },
  { id: "mystery", label: "미스터리 반전", hint: "추리 · 복선 회수 · 진실 공개", style: "precise chamber mystery, ticking percussion, evolving motif, revelation without bombast", scene: "흩어진 사진의 날짜를 맞추자 범인이 처음부터 화면 안에 있었다는 사실이 드러난다.", bpm: 94 },
] as const;

export const MUSIC_PURPOSES = [
  { id: "bgm", label: "장면 BGM", direction: "Understated scene underscore; preserve a clear center and leave space for dialogue and reading concentration." },
  { id: "ost", label: "감정 OST", direction: "Memorable emotional theme with a clear beginning, development and resolution." },
  { id: "opening", label: "오프닝 주제가", direction: "Compact opening theme with an original memorable chorus and a decisive ending." },
  { id: "ending", label: "엔딩 테마", direction: "Reflective ending theme that extends the final panel's emotion with a gentle resolution." },
  { id: "trailer", label: "예고편 음악", direction: "Build anticipation towards a short climax, a reveal beat and a clean ending." },
] as const;

export const MUSIC_INSTRUMENTS = [
  { id: "piano", label: "피아노", prompt: "piano" },
  { id: "strings", label: "스트링", prompt: "orchestral strings" },
  { id: "guitar", label: "기타", prompt: "acoustic and clean electric guitar" },
  { id: "synth", label: "신시사이저", prompt: "modern synthesizer" },
  { id: "drums", label: "드럼", prompt: "drums and cinematic percussion" },
  { id: "brass", label: "브라스", prompt: "brass ensemble" },
  { id: "woodwind", label: "목관", prompt: "woodwinds" },
  { id: "bass", label: "베이스", prompt: "acoustic or electric bass" },
  { id: "traditional", label: "전통 악기", prompt: "tasteful Korean and East Asian traditional instruments" },
  { id: "choir", label: "합창 질감", prompt: "wordless cinematic choir texture" },
  { id: "bells", label: "벨·셀레스타", prompt: "celesta and delicate bells" },
  { id: "electronic", label: "전자 퍼커션", prompt: "precise electronic percussion and sound design" },
] as const;

export const MUSIC_INTENSITIES = [
  { id: "subtle", label: "절제", direction: "Restrained dynamics and sparse arrangement; never compete with dialogue or visual focus." },
  { id: "balanced", label: "균형", direction: "Balanced arrangement with a readable lead motif and controlled dynamics." },
  { id: "cinematic", label: "시네마틱", direction: "Layered cinematic arrangement with strong depth while retaining clean separation and safe loudness." },
] as const;

export const MUSIC_ARCS = [
  { id: "steady", label: "일정한 분위기", direction: "Maintain a stable emotional state with small organic variation." },
  { id: "build", label: "점층 상승", direction: "Begin lightly and build in clear stages toward the final third." },
  { id: "twist", label: "반전 전환", direction: "Establish one emotional reading, then pivot convincingly near two-thirds without becoming chaotic." },
  { id: "resolve", label: "여운과 해소", direction: "Carry tension in the first half and resolve it into a lingering, emotionally complete ending." },
] as const;

export const MUSIC_LYRIC_LANGUAGES = [
  { id: "ko", label: "한국어", prompt: "Korean" },
  { id: "en", label: "영어", prompt: "English" },
  { id: "ja", label: "일본어", prompt: "Japanese" },
] as const;

export interface MusicThemePack {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly mood: string;
  readonly purpose: string;
  readonly bpm: number;
  readonly instruments: readonly string[];
  readonly intensity: string;
  readonly arc: string;
  readonly loop: boolean;
}

export const MUSIC_THEME_PACKS: readonly MusicThemePack[] = [
  { id: "first-confession", label: "첫 고백의 순간", description: "말풍선 사이의 떨림과 마지막 눈맞춤", mood: "romance", purpose: "bgm", bpm: 78, instruments: ["piano", "strings"], intensity: "subtle", arc: "build", loop: false },
  { id: "royal-ball", label: "로판 궁정의 밤", description: "무도회·계약 결혼·비밀스러운 시선", mood: "royal", purpose: "ost", bpm: 96, instruments: ["strings", "woodwind", "piano"], intensity: "balanced", arc: "resolve", loop: false },
  { id: "regression-awakening", label: "회귀와 각성", description: "되감긴 운명에서 시작되는 두 번째 선택", mood: "regression", purpose: "ost", bpm: 116, instruments: ["strings", "synth", "drums"], intensity: "cinematic", arc: "build", loop: false },
  { id: "hunter-raid", label: "헌터 레이드", description: "파티 진입부터 보스 약점 공개까지", mood: "hunter", purpose: "trailer", bpm: 138, instruments: ["drums", "strings", "synth", "bass"], intensity: "cinematic", arc: "twist", loop: false },
  { id: "martial-duel", label: "무협 최후의 비무", description: "정적·발도·초식 충돌의 세 박자", mood: "martial", purpose: "ost", bpm: 108, instruments: ["traditional", "drums", "strings"], intensity: "cinematic", arc: "build", loop: false },
  { id: "fantasy-discovery", label: "판타지 세계 발견", description: "새로운 공간을 길게 스크롤하는 경이감", mood: "fantasy", purpose: "bgm", bpm: 92, instruments: ["bells", "woodwind", "strings"], intensity: "balanced", arc: "build", loop: true },
  { id: "mystery-reveal", label: "복선 회수와 반전", description: "단서가 하나의 진실로 합쳐지는 순간", mood: "mystery", purpose: "bgm", bpm: 94, instruments: ["piano", "strings", "electronic"], intensity: "balanced", arc: "twist", loop: false },
  { id: "vertical-horror", label: "공포 세로 스크롤", description: "긴 여백 뒤에 다가오는 기척", mood: "horror", purpose: "bgm", bpm: 68, instruments: ["strings", "electronic", "bells"], intensity: "subtle", arc: "build", loop: true },
  { id: "campus-youth", label: "학원 청춘 몽타주", description: "등굣길·축제 준비·친구들의 성장", mood: "school", purpose: "opening", bpm: 124, instruments: ["guitar", "drums", "bass"], intensity: "balanced", arc: "build", loop: false },
  { id: "office-tension", label: "오피스 로맨스 밀당", description: "야근 뒤 엘리베이터에서 가까워지는 거리", mood: "office", purpose: "bgm", bpm: 102, instruments: ["piano", "bass", "synth"], intensity: "subtle", arc: "twist", loop: true },
  { id: "healing-day", label: "힐링 일상", description: "독자의 호흡을 쉬게 하는 따뜻한 막간", mood: "healing", purpose: "bgm", bpm: 72, instruments: ["guitar", "piano", "woodwind"], intensity: "subtle", arc: "steady", loop: true },
  { id: "ending-afterglow", label: "엔딩의 긴 여운", description: "마지막 컷 뒤 감정을 닫지 않고 이어 주는 테마", mood: "sad", purpose: "ending", bpm: 64, instruments: ["piano", "strings"], intensity: "subtle", arc: "resolve", loop: false },
] as const;

export const MUSIC_DURATIONS = [15, 30, 45, 60] as const;
export const MUSIC_MAX_BYTES = 1_500_000;
export const MUSIC_TERMS_URL = "https://elevenlabs.io/eleven-music-model-specific-terms";
export type MusicProviderModel = "music_v1" | "music_v2_5";

export interface MusicBrief {
  title: string;
  scene: string;
  mood: string;
  purpose: string;
  seconds: number;
  bpm: number;
  instruments: string[];
  vocals: boolean;
  lyrics: string;
  lyricsLanguage: string;
  loop: boolean;
  intensity: string;
  arc: string;
  workId: string;
  episodeId: string;
  rightsConfirmed: boolean;
}

export interface MusicStatus {
  enabled: boolean;
  reason: "ready" | "disabled" | "configuration-required";
  provider: "elevenlabs";
  maxSeconds: number;
}

export interface MusicTrackMetadata {
  id: string;
  createdAt: string;
  provider: "elevenlabs";
  model: MusicProviderModel;
  format: "mp3_44100_128";
  songId?: string;
  brief: MusicBrief;
  termsUrl: string;
}

export function defaultMusicBrief(): MusicBrief {
  return {
    title: "나의 첫 사운드트랙",
    scene: "",
    mood: "romance",
    purpose: "bgm",
    seconds: 30,
    bpm: 78,
    instruments: ["piano", "strings"],
    vocals: false,
    lyrics: "",
    lyricsLanguage: "ko",
    loop: false,
    intensity: "balanced",
    arc: "steady",
    workId: "",
    episodeId: "",
    rightsConfirmed: false,
  };
}

function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") throw new Error(`${label} 형식을 확인해 주세요.`);
  const result = value.trim();
  if (result.length > max || (required && !result)) throw new Error(`${label}은 ${required ? "1~" : "최대 "}${max}자까지 입력해 주세요.`);
  return result;
}

export function parseMusicBrief(input: unknown): MusicBrief {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("음악 설정을 확인해 주세요.");
  const b = input as Record<string, unknown>;
  const defaults = defaultMusicBrief();
  const known = Object.keys(defaults);
  if (Object.keys(b).some((key) => !known.includes(key))) throw new Error("지원하지 않는 음악 설정입니다.");
  const title = text(b.title, "제목", 80, true);
  const scene = text(b.scene, "장면 설명", 600, true);
  const lyrics = text(b.lyrics, "가사", 1200);
  const workId = text(b.workId, "작품 ID", 80);
  const episodeId = text(b.episodeId ?? defaults.episodeId, "회차 ID", 80);
  const intensity = b.intensity ?? defaults.intensity;
  const arc = b.arc ?? defaults.arc;
  const lyricsLanguage = b.lyricsLanguage ?? defaults.lyricsLanguage;
  if (workId && !/^[a-zA-Z0-9_-]+$/u.test(workId)) throw new Error("작품 ID 형식을 확인해 주세요.");
  if (episodeId && !/^[a-zA-Z0-9_-]+$/u.test(episodeId)) throw new Error("회차 ID 형식을 확인해 주세요.");
  if (episodeId && !workId) throw new Error("회차 음악은 먼저 작품에 연결해 주세요.");
  if (!MUSIC_MOODS.some((mood) => mood.id === b.mood) || !MUSIC_PURPOSES.some((purpose) => purpose.id === b.purpose)) throw new Error("분위기와 음악 용도를 선택해 주세요.");
  if (!MUSIC_INTENSITIES.some((entry) => entry.id === intensity) || !MUSIC_ARCS.some((entry) => entry.id === arc)) throw new Error("음악 강도와 감정 곡선을 선택해 주세요.");
  if (!MUSIC_LYRIC_LANGUAGES.some((entry) => entry.id === lyricsLanguage)) throw new Error("가사 언어를 선택해 주세요.");
  if (!MUSIC_DURATIONS.some((seconds) => seconds === b.seconds)) throw new Error("음악 길이는 15·30·45·60초 중 선택해 주세요.");
  if (typeof b.bpm !== "number" || !Number.isInteger(b.bpm) || b.bpm < 60 || b.bpm > 180) throw new Error("템포는 60~180 BPM 범위입니다.");
  if (!Array.isArray(b.instruments) || b.instruments.length < 1 || b.instruments.length > 4 || new Set(b.instruments).size !== b.instruments.length || b.instruments.some((instrument) => !MUSIC_INSTRUMENTS.some((knownInstrument) => knownInstrument.id === instrument))) throw new Error("서로 다른 악기를 1~4개 선택해 주세요.");
  if (typeof b.vocals !== "boolean" || typeof b.loop !== "boolean" || b.rightsConfirmed !== true) throw new Error("원본 콘텐츠 이용 권한과 외부 AI 전송 안내를 확인해 주세요.");
  if (!b.vocals && lyrics) throw new Error("보컬을 켜거나 가사를 지워 주세요.");
  if (b.vocals && !lyrics) throw new Error("보컬 주제가에 사용할 직접 작성한 가사를 입력해 주세요.");
  return {
    title,
    scene,
    mood: b.mood as string,
    purpose: b.purpose as string,
    seconds: b.seconds as number,
    bpm: b.bpm,
    instruments: [...b.instruments] as string[],
    vocals: b.vocals,
    lyrics,
    lyricsLanguage: lyricsLanguage as string,
    loop: b.loop,
    intensity: intensity as string,
    arc: arc as string,
    workId,
    episodeId,
    rightsConfirmed: true,
  };
}

export function applyMusicThemePack(brief: MusicBrief, themeId: string): MusicBrief {
  const theme = MUSIC_THEME_PACKS.find((entry) => entry.id === themeId);
  if (!theme) throw new Error("웹툰 음악 테마를 찾을 수 없습니다.");
  const mood = MUSIC_MOODS.find((entry) => entry.id === theme.mood)!;
  return {
    ...brief,
    mood: theme.mood,
    purpose: theme.purpose,
    bpm: theme.bpm,
    instruments: [...theme.instruments],
    intensity: theme.intensity,
    arc: theme.arc,
    loop: theme.loop,
    scene: brief.scene.trim() || mood.scene,
    rightsConfirmed: false,
  };
}

export function buildMusicPrompt(brief: MusicBrief): string {
  const b = parseMusicBrief(brief);
  const mood = MUSIC_MOODS.find((item) => item.id === b.mood)!;
  const purpose = MUSIC_PURPOSES.find((item) => item.id === b.purpose)!;
  const intensity = MUSIC_INTENSITIES.find((item) => item.id === b.intensity)!;
  const arc = MUSIC_ARCS.find((item) => item.id === b.arc)!;
  const lyricLanguage = MUSIC_LYRIC_LANGUAGES.find((item) => item.id === b.lyricsLanguage)!;
  return [
    "Compose a fully original soundtrack for a Korean webtoon.",
    "Do not imitate or reference any existing artist, song, franchise theme, copyrighted melody or identifiable voice.",
    purpose.direction,
    `Mood and genre language: ${mood.style}. Tempo: approximately ${b.bpm} BPM.`,
    intensity.direction,
    arc.direction,
    `Featured instruments: ${b.instruments.map((id) => MUSIC_INSTRUMENTS.find((item) => item.id === id)!.prompt).join(", ")}.`,
    `Scene context (creative reference, not literal sound-effect instructions): ${b.scene}`,
    b.vocals
      ? `Use an original singing voice with clear natural ${lyricLanguage.prompt} diction. Sing only these user-provided original lyrics; do not add quoted or copyrighted lyrics:\n${b.lyrics}`
      : "Strictly instrumental. No singing, spoken words, chants, humming or vocal samples.",
    b.loop
      ? "Create a musically seamless loop: match the ending energy, harmony and ambience to the opening; avoid a final hit or long tail."
      : "Give the piece an intentional musical ending without cutting off a note.",
    "Keep loudness controlled, transitions smooth and the mix clean for long-form mobile webtoon reading.",
  ].join("\n");
}

export function musicFilename(title: string): string {
  if (typeof title !== "string") throw new TypeError("Music title must be a string");
  const safe = title.replace(/[\\/:*?"<>|]/gu, "_").split("")
    .map((character) => character.charCodeAt(0) < 32 ? "_" : character).join("");
  let start = 0;
  let end = safe.length;
  while (start < end && safe[start] === ".") start++;
  while (end > start && safe[end - 1] === ".") end--;
  return (safe.slice(start, end).trim().slice(0, 80) || "toonstudio-music") + ".mp3";
}

export function isMp3(bytes: Uint8Array): boolean {
  return bytes.length > 10 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}
