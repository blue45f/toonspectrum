/** Metadata-only research index: excludes covers, synopses and estimated scores. */
export interface ResearchWork {
  id: string; slug: string; title: string; author: string;
  type: "webtoon" | "webnovel"; status: string; year: number | null;
  genres: string[]; tags: string[]; platforms: string[]; mature: boolean;
}
export type ResearchRow = [string, string, string, number, number, number, number | null, number[], number[], number[], boolean];
export interface ResearchSnapshot {
  version: 1; sourceVersion: string; sourceHash: string;
  collectedAt: string | null; enrichedAt: string | null;
  inputCount: number; excludedCount: number; dictionary: string[]; rows: ResearchRow[];
}
export interface ResearchDataset { snapshot: ResearchSnapshot; works: ResearchWork[] }
export interface ResearchFilters {
  q: string; genre: string; tag: string; platform: string;
  type: string; status: string; sort: "title" | "year"; mature: boolean;
}
export const RESEARCH_STATUSES = ["ongoing", "completed", "hiatus"];
export const RESEARCH_STATUS_LABELS: Record<string, string> = { ongoing: "연재", completed: "완결", hiatus: "휴재" };
export const RESEARCH_NOTE_KEY = "toonstudio.catalog-research.notebook.v1";
export const RESEARCH_LIMIT = 4;
export const RESEARCH_PAGE_SIZE = 24;
const MAX_RECORDS = 100000;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 200): string => typeof value === "string" ? value.replace(/\p{Cc}/gu, " ").trim().slice(0, max) : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.slice(0, 40).map((item) => text(item, 100)).filter(Boolean))] : [];
const date = (value: unknown): string | null => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
export const normalizeResearchText = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/gu, " ").trim();

export function buildResearchSnapshot(input: readonly unknown[], metadata: unknown, sourceHash: string): ResearchSnapshot {
  const dictionary: string[] = []; const indices = new Map<string, number>();
  const intern = (value: string): number => {
    const existing = indices.get(value); if (existing !== undefined) return existing;
    const index = dictionary.length; dictionary.push(value); indices.set(value, index); return index;
  };
  const seen = new Set<string>(); const rows: ResearchRow[] = [];
  for (const value of input) {
    const item = record(value); const id = text(item.id, 120); const title = text(item.title);
    if (!id || !title || seen.has(id) || (item.type !== "webtoon" && item.type !== "webnovel")) continue;
    seen.add(id);
    const platforms = Array.isArray(item.availability) ? strings(item.availability.map((entry) => record(entry).platformId)) : [];
    const year = typeof item.releaseYear === "number" && Number.isInteger(item.releaseYear) && item.releaseYear >= 1800 && item.releaseYear <= 2100 ? item.releaseYear : null;
    rows.push([id, text(item.slug, 240) || id, title, intern(text(item.author, 160)), item.type === "webtoon" ? 0 : 1,
      RESEARCH_STATUSES.indexOf(text(item.status)), year, strings(item.genres).map(intern), strings(item.tags).map(intern), platforms.map(intern), item.ageRating === "19"]);
  }
  const meta = record(metadata);
  return { version: 1, sourceVersion: text(meta.sourceVersion), sourceHash: text(sourceHash, 64),
    collectedAt: date(meta.crawledAt), enrichedAt: date(record(record(meta.metadata).kmas).updatedAt),
    inputCount: input.length, excludedCount: input.length - rows.length, dictionary, rows };
}

export function parseResearchSnapshot(value: unknown): ResearchDataset {
  const data = record(value); const dictionary = data.dictionary;
  if (data.version !== 1 || !Array.isArray(dictionary) || dictionary.length > MAX_RECORDS * 2 ||
    !dictionary.every((word) => typeof word === "string" && word.length <= 240) ||
    !Array.isArray(data.rows) || data.rows.length > MAX_RECORDS || !Number.isSafeInteger(data.inputCount) || !Number.isSafeInteger(data.excludedCount) ||
    Number(data.excludedCount) < 0 || Number(data.inputCount) !== data.rows.length + Number(data.excludedCount)) throw new Error("리서치 색인 형식이 올바르지 않습니다.");
  if (typeof data.sourceHash !== "string" || !/^[a-f0-9]{16,64}$/u.test(data.sourceHash) || typeof data.sourceVersion !== "string" || data.sourceVersion.length > 200 ||
    (data.collectedAt !== null && !date(data.collectedAt)) || (data.enrichedAt !== null && !date(data.enrichedAt))) throw new Error("리서치 출처 정보가 올바르지 않습니다.");
  const words = dictionary as string[];
  const validIndex = (index: unknown): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < words.length;
  const validList = (list: unknown): list is number[] => Array.isArray(list) && list.length <= 40 && list.every(validIndex);
  const ids = new Set<string>(); const works: ResearchWork[] = [];
  for (const row of data.rows) {
    if (!Array.isArray(row) || row.length !== 11 || !row.slice(0, 3).every((cell) => typeof cell === "string" && cell.length > 0 && cell.length <= 240) ||
      !validIndex(row[3]) || ![0, 1].includes(row[4]) || ![-1, 0, 1, 2].includes(row[5]) ||
      (row[6] !== null && (!Number.isInteger(row[6]) || row[6] < 1800 || row[6] > 2100)) ||
      !validList(row[7]) || !validList(row[8]) || !validList(row[9]) || typeof row[10] !== "boolean" || ids.has(row[0])) throw new Error("리서치 색인의 작품 항목이 손상되었습니다.");
    ids.add(row[0]);
    works.push({ id: row[0], slug: row[1], title: row[2], author: words[row[3]]!, type: row[4] === 0 ? "webtoon" : "webnovel",
      status: RESEARCH_STATUSES[row[5]] ?? "unknown", year: row[6], genres: row[7].map((index) => words[index]!),
      tags: row[8].map((index) => words[index]!), platforms: row[9].map((index) => words[index]!), mature: row[10] });
  }
  works.sort((a, b) => a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id));
  return { snapshot: data as unknown as ResearchSnapshot, works };
}
export function readResearchFilters(params: URLSearchParams): ResearchFilters {
  const choice = (key: string, allowed: string[], fallback = "") => allowed.includes(params.get(key) ?? "") ? params.get(key)! : fallback;
  return { q: text(params.get("q"), 100), genre: text(params.get("genre"), 100), tag: text(params.get("tag"), 100),
    platform: text(params.get("platform"), 100), type: choice("type", ["webtoon", "webnovel"]),
    status: choice("status", RESEARCH_STATUSES), sort: choice("sort", ["title", "year"], "title") as ResearchFilters["sort"], mature: params.get("mature") === "true" };
}
export function readResearchSelection(params: URLSearchParams): string[] {
  return [...new Set((params.get("compare") ?? "").slice(0, 1000).split(",").map((id) => text(id, 120)).filter(Boolean))].slice(0, RESEARCH_LIMIT);
}
export function selectResearchWorks(works: readonly ResearchWork[], filters: ResearchFilters): ResearchWork[] {
  const terms = normalizeResearchText(filters.q).split(" ").filter(Boolean);
  return works.filter((work) => {
    if ((!filters.mature && work.mature) || (filters.type && work.type !== filters.type) || (filters.status && work.status !== filters.status) ||
      (filters.genre && !work.genres.includes(filters.genre)) || (filters.tag && !work.tags.includes(filters.tag)) || (filters.platform && !work.platforms.includes(filters.platform))) return false;
    if (!terms.length) return true;
    const haystack = normalizeResearchText([work.title, work.author, ...work.genres, ...work.tags].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}
export interface ResearchCount { name: string; count: number; share: number }
export function countResearchFacets(works: readonly ResearchWork[], field: "genres" | "tags" | "platforms"): ResearchCount[] {
  const counts = new Map<string, number>();
  for (const work of works) for (const key of new Set(work[field])) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count, share: works.length ? count / works.length * 100 : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}
export function researchPrompts(works: readonly ResearchWork[]): string[] {
  const genres = countResearchFacets(works, "genres"); const tags = countResearchFacets(works, "tags");
  return [`${genres[0]?.name ?? "선택한 장르"}의 첫 화에서 독자에게 던질 질문은 무엇인가요? 기존 작품의 설정 대신 나만의 상황을 적어보세요.`,
    `${tags.slice(0, 3).map((tag) => tag.name).join(" · ") || "인물 · 공간 · 갈등"} 중 한 요소를 반대로 바꾸면 어떤 새로운 갈등이 생기나요?`,
    "같은 장르라도 주인공의 욕망, 독자가 아는 정보, 마지막 컷의 질문은 어떻게 다른가요? 원문을 직접 확인하고 관찰과 추측을 구분하세요.",
    "내 가설을 시험할 5컷 장면을 설계하세요. 도입 → 단서 → 선택 → 대가 → 다음 질문 순서로 구성해보세요."];
}
const csvCell = (value: string): string => `"${(/^[\s]*[=+@-]/u.test(value) ? "'" : "") + value.replace(/"/gu, '""')}"`;
export function researchCsv(works: readonly ResearchWork[]): string {
  return "\uFEFF" + [["작품", "작가", "형식", "상태", "기록 연도", "장르", "태그", "플랫폼 ID", "작품 정보"], ...works.map((work) => [work.title, work.author,
    work.type === "webtoon" ? "웹툰" : "웹소설", RESEARCH_STATUS_LABELS[work.status] ?? "미상", work.year?.toString() ?? "", work.genres.join(" / "), work.tags.join(" / "), work.platforms.join(" / "),
    `https://www.toonstudio.cloud/title/${encodeURIComponent(work.slug)}`])].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export interface ResearchNotebook {
  version: 1; question: string; observation: string; hypothesis: string; experiment: string;
  selected: string[]; savedAt: string; sourceHash: string;
}
export const emptyResearchNotebook = (): ResearchNotebook => ({ version: 1, question: "", observation: "", hypothesis: "", experiment: "", selected: [], savedAt: "", sourceHash: "" });
export function parseResearchNotebook(raw: string | null): ResearchNotebook {
  if (!raw) return emptyResearchNotebook();
  if (raw.length > 40000) throw new Error("저장된 노트의 크기가 너무 큽니다.");
  const data = record(JSON.parse(raw));
  if (data.version !== 1 || !["question", "observation", "hypothesis", "experiment"].every((key) => typeof data[key] === "string" && String(data[key]).length <= 6000) ||
    !Array.isArray(data.selected) || data.selected.length > RESEARCH_LIMIT || !data.selected.every((id) => typeof id === "string" && id.length <= 120) ||
    typeof data.savedAt !== "string" || (data.savedAt !== "" && !date(data.savedAt)) || typeof data.sourceHash !== "string" || data.sourceHash.length > 64) throw new Error("저장된 노트 형식이 손상되어 덮어쓰지 않았습니다.");
  return data as unknown as ResearchNotebook;
}
export function saveResearchNotebook(storage: Pick<Storage, "getItem" | "setItem">, expected: string | null, note: ResearchNotebook): string {
  if (storage.getItem(RESEARCH_NOTE_KEY) !== expected) throw new Error("다른 탭에서 노트가 변경되었습니다. 내보내기로 현재 초안을 보관한 뒤 저장된 노트를 다시 불러오세요.");
  const raw = JSON.stringify(note); parseResearchNotebook(raw); storage.setItem(RESEARCH_NOTE_KEY, raw); return raw;
}
const markdownText = (value: string): string => value.replace(/[\\`*_[\]{}()<>#+.!|]/gu, "\\$&").replace(/[\r\n]+/gu, " ");
export function researchMarkdown(note: ResearchNotebook, works: readonly ResearchWork[], snapshot: ResearchSnapshot): string {
  return ["# ToonStudio 작품 리서치 노트", "", `원본 수집: ${snapshot.collectedAt ?? "미상"} / 색인: ${snapshot.sourceHash}`,
    "이 자료는 수록 카탈로그 표본입니다. 시장점유율·실시간 인기·성공 확률이 아니며, 작품 내용의 재사용 허락을 의미하지 않습니다.", "", "## 비교 작품",
    ...works.map((work) => `- [${markdownText(work.title)}](https://www.toonstudio.cloud/title/${encodeURIComponent(work.slug)}) — ${markdownText(work.author || "작가 미상")}`), "",
    "## 조사 질문", note.question, "", "## 원문에서 직접 확인한 관찰", note.observation, "", "## 나의 가설 (사실과 구분)", note.hypothesis, "", "## 나만의 5컷 실험", note.experiment,
    "", "## 다음 제작 동선", "- 스토리 연구실: https://www.toonstudio.cloud/story-lab", "- 스튜디오: https://www.toonstudio.cloud/studio", ""].join("\n");
}
