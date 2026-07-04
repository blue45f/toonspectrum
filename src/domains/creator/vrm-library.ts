const DB_NAME = "toonspectrum-studio-vrm-library";
const DB_VERSION = 1;
const MODEL_STORE = "models";
const THUMBNAIL_STORE = "thumbnails";

export const SAMPLE_VRM_ID = "sample-vrm";
export const SAMPLE_VRM_URL = "/vrm/sample.vrm";

export type VrmStoredModelRecord = {
  id: string;
  name: string;
  blob: Blob;
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
};

export type VrmLibraryEntry = {
  id: string;
  name: string;
  source: "sample" | "indexed-db";
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SampleVrm = {
  id: string;
  name: string;
  url: string;
};

type VrmThumbnailRecord = {
  id: string;
  thumbnail: string;
  updatedAt: number;
};

// 기본 번들 VRM 캐릭터. 모든 엔트리는 public/vrm/ 아래 실파일과 1:1 대응한다.
// A-C는 pixiv VRoidPreset 조건, old beta 샘플 4종은 pixiv CC0 조건을 따른다.
// 모델별 출처 URL·라이선스 요약은 public/vrm/LICENSES.md 참고
// (2026-06: madjin/vrm-samples VRoid 공식 샘플 + UniVRM Alicia Solid,
//  2026-07: github.com/ToxSam/open-source-avatars 레지스트리의 Polygonal Mind
//  100Avatars R1~R3 CC0 모델 71종 — 캐릭터/로봇/동물/판타지/SF/푸드 마스코트,
//  그 중 OldMoustache·Eugenia는 "노인" 카테고리 보강).
export const SAMPLE_VRMS: SampleVrm[] = [
  { id: SAMPLE_VRM_ID, name: "루미", url: SAMPLE_VRM_URL },
  { id: "avatar-a", name: "하린", url: "/vrm/AvatarSample_A.vrm" },
  { id: "avatar-b", name: "세라", url: "/vrm/AvatarSample_B.vrm" },
  { id: "avatar-c", name: "유나", url: "/vrm/AvatarSample_C.vrm" },
  { id: "shion", name: "시온", url: "/vrm/Sendagaya_Shibu.vrm" },
  { id: "vivi", name: "비비", url: "/vrm/Vivi.vrm" },
  { id: "vita", name: "비타", url: "/vrm/Vita.vrm" },
  { id: "rubin", name: "루빈", url: "/vrm/Victoria_Rubin.vrm" },
  { id: "orion", name: "오리온 (로봇)", url: "/vrm/Avatar_Orion.vrm" },
  { id: "cryptovoxel", name: "크립토 (복셀봇)", url: "/vrm/cryptovoxels.vrm" },
  { id: "meebit", name: "미빗 (블록맨)", url: "/vrm/meebit_09842.vrm" },
  { id: "seedsan", name: "시드상 (마스코트)", url: "/vrm/Seed_san.vrm" },
  { id: "shino", name: "시노", url: "/vrm/Sendagaya_Shino.vrm" },
  { id: "fumi", name: "후미", url: "/vrm/Sakurada_Fumiriya.vrm" },
  { id: "kage", name: "카게 (다크)", url: "/vrm/Darkness_Shibu.vrm" },
  { id: "mio", name: "미오", url: "/vrm/fem_vroid.vrm" },
  { id: "noa", name: "노아", url: "/vrm/masc_vroid.vrm" },
  { id: "alicia", name: "아리시아", url: "/vrm/AliciaSolid.vrm" },
  { id: "devil", name: "데빌 (악마)", url: "/vrm/Devil.vrm" },
  { id: "polydancer", name: "폴리댄서", url: "/vrm/Polydancer.vrm" },
  { id: "rose", name: "로즈", url: "/vrm/Rose.vrm" },
  { id: "robert", name: "로버트", url: "/vrm/Robert.vrm" },
  { id: "bloody", name: "블러디 (빌런)", url: "/vrm/Bloody.vrm" },
  { id: "rabbit", name: "래빗 (토끼)", url: "/vrm/Rabbit.vrm" },
  { id: "eggplant", name: "에그플랜트 (가지)", url: "/vrm/Eggplant.vrm" },
  { id: "coolbanana", name: "쿨바나나", url: "/vrm/CoolBanana.vrm" },
  { id: "skull", name: "스컬 (해골)", url: "/vrm/Skull.vrm" },
  { id: "cool-alien", name: "쿨에일리언 (외계인)", url: "/vrm/CoolAlien.vrm" },
  { id: "jimmy", name: "지미", url: "/vrm/Jimmy.vrm" },
  { id: "froggy", name: "프로기 (개구리)", url: "/vrm/Froggy.vrm" },
  { id: "teddy", name: "테디 (곰인형)", url: "/vrm/Teddy.vrm" },
  { id: "nightmare", name: "나이트메어 (악몽)", url: "/vrm/Nightmare.vrm" },
  { id: "pumpkin", name: "펌킨 (호박)", url: "/vrm/Pumpkin.vrm" },
  { id: "wizzir", name: "위지르 (마법사)", url: "/vrm/Wizzir.vrm" },
  { id: "clown", name: "클라운 (광대)", url: "/vrm/Clown.vrm" },
  { id: "wolfman", name: "울프맨 (늑대인간)", url: "/vrm/Wolfman.vrm" },
  { id: "mummy", name: "머미 (미라)", url: "/vrm/Mummy.vrm" },
  { id: "kate", name: "케이트", url: "/vrm/Kate.vrm" },
  { id: "witch", name: "위치 (마녀)", url: "/vrm/Witch.vrm" },
  { id: "dracula", name: "드라큘라 (뱀파이어)", url: "/vrm/Dracula.vrm" },
  { id: "zombie", name: "좀비", url: "/vrm/Zombie.vrm" },
  { id: "dino-kid", name: "디노키드 (공룡)", url: "/vrm/DinoKid.vrm" },
  { id: "astronaut", name: "애스트로넛 (우주비행사)", url: "/vrm/Astronaut.vrm" },
  { id: "polybot", name: "폴리봇 (로봇)", url: "/vrm/Polybot.vrm" },
  { id: "jennifer", name: "제니퍼", url: "/vrm/Jennifer.vrm" },
  { id: "erika", name: "에리카", url: "/vrm/Erika.vrm" },
  { id: "olivia", name: "올리비아", url: "/vrm/Olivia.vrm" },
  { id: "avocado", name: "아보카도", url: "/vrm/Avocado.vrm" },
  { id: "ice-cream", name: "아이스크림", url: "/vrm/IceCream.vrm" },
  { id: "pyre-sorcerer", name: "파이어소서러 (화염술사)", url: "/vrm/PyreSorcerer.vrm" },
  { id: "unicorn-person", name: "유니콘퍼슨 (유니콘)", url: "/vrm/UnicornPerson.vrm" },
  { id: "lalo-bot", name: "랄로봇 (로봇)", url: "/vrm/LaloBot.vrm" },
  { id: "shark-person", name: "샤크퍼슨 (상어)", url: "/vrm/SharkPerson.vrm" },
  { id: "chill-penguin", name: "칠펭귄 (펭귄)", url: "/vrm/ChillPenguin.vrm" },
  { id: "cool-turtle", name: "쿨터틀 (거북이)", url: "/vrm/CoolTurtle.vrm" },
  { id: "moon-girl", name: "문걸 (달소녀)", url: "/vrm/MoonGirl.vrm" },
  { id: "eye-wizard", name: "아이위저드 (외눈 마법사)", url: "/vrm/EyeWizard.vrm" },
  { id: "cool-pizza", name: "쿨피자", url: "/vrm/CoolPizza.vrm" },
  { id: "cool-ramen", name: "쿨라멘", url: "/vrm/CoolRamen.vrm" },
  { id: "cool-taco", name: "쿨타코", url: "/vrm/CoolTaco.vrm" },
  { id: "cool-pirate", name: "쿨파이럿 (해적)", url: "/vrm/CoolPirate.vrm" },
  { id: "cosmic-dweller", name: "코스믹드웰러 (우주인)", url: "/vrm/CosmicDweller.vrm" },
  { id: "chill-palm", name: "칠팜 (야자수)", url: "/vrm/ChillPalm.vrm" },
  { id: "good-knight", name: "굿나이트 (기사)", url: "/vrm/GoodKnight.vrm" },
  { id: "bad-bot", name: "배드봇 (로봇)", url: "/vrm/BadBot.vrm" },
  { id: "pirate-bot", name: "파이럿봇 (해적 로봇)", url: "/vrm/PirateBot.vrm" },
  { id: "cyberpal", name: "사이버팔 (사이보그)", url: "/vrm/Cyberpal.vrm" },
  { id: "bao-samurai", name: "바오사무라이", url: "/vrm/BaoSamurai.vrm" },
  { id: "kiba", name: "키바 (늑대)", url: "/vrm/Kiba.vrm" },
  { id: "stitch-witch", name: "스티치위치 (마녀 인형)", url: "/vrm/StitchWitch.vrm" },
  { id: "mega-angel", name: "메가엔젤 (천사)", url: "/vrm/MegaAngel.vrm" },
  { id: "mushroom-fairy", name: "머시룸페어리 (버섯 요정)", url: "/vrm/MushroomFairy.vrm" },
  { id: "weird-cat", name: "위어드캣 (고양이)", url: "/vrm/WeirdCat.vrm" },
  { id: "cute-saurus", name: "큐트사우루스 (공룡)", url: "/vrm/CuteSaurus.vrm" },
  { id: "crowley", name: "크롤리", url: "/vrm/Crowley.vrm" },
  { id: "lady-koi", name: "레이디코이 (비단잉어)", url: "/vrm/LadyKoi.vrm" },
  { id: "yeti-dude", name: "예티듀드 (예티)", url: "/vrm/YetiDude.vrm" },
  { id: "anna", name: "안나", url: "/vrm/Anna.vrm" },
  { id: "megan-the-fox", name: "메간 (여우)", url: "/vrm/MeganTheFox.vrm" },
  { id: "cool-tiger", name: "쿨타이거 (호랑이)", url: "/vrm/CoolTiger.vrm" },
  { id: "lil-ram", name: "릴램 (양)", url: "/vrm/LilRam.vrm" },
  { id: "lady-fawn", name: "레이디폰 (아기사슴)", url: "/vrm/LadyFawn.vrm" },
  { id: "strawberry-princess", name: "스트로베리 프린세스 (공주)", url: "/vrm/StrawberryPrincess.vrm" },
  { id: "blue-pixie", name: "블루픽시 (요정)", url: "/vrm/BluePixie.vrm" },
  { id: "bot-bunny", name: "봇버니 (토끼 로봇)", url: "/vrm/BotBunny.vrm" },
  { id: "sport-mecha", name: "스포츠메카 (메카)", url: "/vrm/SportMecha.vrm" },
  { id: "cosmic-bot", name: "코스믹봇 (로봇)", url: "/vrm/CosmicBot.vrm" },
  { id: "old-moustache", name: "올드무스타치 (할아버지)", url: "/vrm/OldMoustache.vrm" },
  { id: "eugenia", name: "유제니아 (할머니)", url: "/vrm/Eugenia.vrm" },
];
export const SAMPLE_VRM_ENTRIES: VrmLibraryEntry[] = SAMPLE_VRMS.map((s) => ({
  id: s.id,
  name: s.name,
  source: "sample",
  thumbnail: null,
  createdAt: 0,
  updatedAt: 0,
}));
export const SAMPLE_VRM_LIBRARY_ENTRY: VrmLibraryEntry = SAMPLE_VRM_ENTRIES[0];

export function sampleVrmUrl(id: string): string {
  return SAMPLE_VRMS.find((s) => s.id === id)?.url ?? SAMPLE_VRM_URL;
}

function isSampleVrmId(id: string) {
  return SAMPLE_VRMS.some((sample) => sample.id === id);
}

export function isUsableVrmAssetResponse(response: Pick<Response, "ok" | "headers">) {
  if (!response.ok) return false;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const contentDisposition = response.headers.get("content-disposition")?.toLowerCase() ?? "";

  return !contentType.includes("text/html") && !/filename="?index\.html"?/.test(contentDisposition);
}

function createModelId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `vrm-${Date.now()}-${Math.random().toString(36).slice(2)}`; // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
}

function normalizeVrmName(fileName: string) {
  const normalized = fileName.trim().replace(/\.vrm$/i, "").trim();
  return normalized || "VRM 캐릭터";
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function createIndexedDbError() {
  return new Error("이 브라우저에서는 VRM 라이브러리 저장소를 사용할 수 없습니다.");
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? createIndexedDbError());
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? createIndexedDbError());
    transaction.onabort = () => reject(transaction.error ?? createIndexedDbError());
  });
}

function openLibraryDatabase() {
  if (!hasIndexedDb()) {
    return Promise.reject(createIndexedDbError());
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        db.createObjectStore(MODEL_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(THUMBNAIL_STORE)) {
        db.createObjectStore(THUMBNAIL_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? createIndexedDbError());
  });
}

async function withDatabase<T>(callback: (db: IDBDatabase) => Promise<T>) {
  const db = await openLibraryDatabase();
  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

export function createUploadedVrmRecord(file: File, id = createModelId(), now = Date.now()): VrmStoredModelRecord {
  return {
    id,
    name: normalizeVrmName(file.name),
    blob: file,
    thumbnail: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function withDefaultVrmEntry(storedModels: VrmStoredModelRecord[], sampleThumbnails: Partial<Record<string, string | null>> = {}): VrmLibraryEntry[] {
  const sampleEntries = SAMPLE_VRM_ENTRIES.map((entry) => ({
    ...entry,
    thumbnail: sampleThumbnails[entry.id] ?? entry.thumbnail,
  }));
  const uploadedEntries = storedModels
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<VrmLibraryEntry>((model) => ({
      id: model.id,
      name: model.name,
      source: "indexed-db",
      thumbnail: model.thumbnail ?? null,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    }));

  return [...sampleEntries, ...uploadedEntries];
}

export function getDeletableModelIds(entries: VrmLibraryEntry[]) {
  return entries.filter((entry) => entry.source === "indexed-db").map((entry) => entry.id);
}

export async function listStoredVrmModels() {
  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const records = await requestResult<VrmStoredModelRecord[]>(store.getAll());
    await done;
    return records;
  });
}

export async function getStoredVrmModel(id: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const record = await requestResult<VrmStoredModelRecord | undefined>(store.get(id));
    await done;
    return record ?? null;
  });
}

export async function getCachedVrmThumbnail(id: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction(THUMBNAIL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(THUMBNAIL_STORE);
    const record = await requestResult<VrmThumbnailRecord | undefined>(store.get(id));
    await done;
    return record?.thumbnail ?? null;
  });
}

export async function listVrmLibraryEntries() {
  const [storedModels, cachedSampleThumbnails] = await Promise.all([
    listStoredVrmModels(),
    Promise.all(SAMPLE_VRM_ENTRIES.map(async (entry) => [entry.id, await getCachedVrmThumbnail(entry.id)] as const)),
  ]);
  return withDefaultVrmEntry(storedModels, Object.fromEntries(cachedSampleThumbnails));
}

export async function saveUploadedVrm(file: File) {
  const record = createUploadedVrmRecord(file);

  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).put(record);
    await done;
    return record;
  });
}

export async function saveVrmThumbnail(id: string, thumbnail: string) {
  const existingModel = await getStoredVrmModel(id);

  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);

    if (existingModel) {
      transaction.objectStore(MODEL_STORE).put({ ...existingModel, thumbnail, updatedAt: Date.now() });
    } else {
      transaction.objectStore(THUMBNAIL_STORE).put({ id, thumbnail, updatedAt: Date.now() } satisfies VrmThumbnailRecord);
    }

    await done;
  });
}

export async function deleteStoredVrmModel(id: string) {
  if (isSampleVrmId(id)) return;

  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).delete(id);
    transaction.objectStore(THUMBNAIL_STORE).delete(id);
    await done;
  });
}
