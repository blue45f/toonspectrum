export const MATERIAL_CATALOG_SCHEMA = "toonstudio.material-atlas.v1";
export const MATERIAL_BOARD_SCHEMA = "toonstudio.material-board.v1";
export const MAX_MATERIAL_SELECTION = 12;
export const MAX_MATERIAL_NOTE = 4000;
export const MAX_CATALOG_ASSETS = 192;
export type MaterialProvider = "polyhaven" | "ambientcg";
export type MaterialKind = "texture" | "model" | "hdri";
export interface MaterialAsset {
  id: string; provider: MaterialProvider; sourceId: string; title: string; kind: MaterialKind;
  tags: string[]; authors: string[]; sourceUrl: string; thumbnailUrl: string; license: "CC0-1.0";
}
export interface MaterialCatalog { schema: typeof MATERIAL_CATALOG_SCHEMA; fetchedAt: string; assets: MaterialAsset[] }
export interface MaterialBoard { schema: typeof MATERIAL_BOARD_SCHEMA; selectedIds: string[]; note: string; studyId: string }
export interface MaterialStudy { id: string; title: string; intro: string; terms: string[]; steps: string[] }
export const MATERIAL_PROVIDERS: Record<MaterialProvider, { name: string; api: string; license: string; policy: string }> = {
  polyhaven: { name: "Poly Haven", api: "https://polyhaven.com/our-api", license: "https://polyhaven.com/license", policy: "https://github.com/Poly-Haven/Public-API/blob/master/ToS.md" },
  ambientcg: { name: "ambientCG", api: "https://docs.ambientcg.com/api/", license: "https://docs.ambientcg.com/license/", policy: "https://docs.ambientcg.com/api/" },
};
export const MATERIAL_KINDS: Record<MaterialKind, string> = { texture: "재질·텍스처", model: "3D 소품", hdri: "빛·환경 HDRI" };
const SOURCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const KOREAN_TERMS: Record<string, string[]> = {
  나무: ["wood", "tree"], 목재: ["wood", "plank"], 벽돌: ["brick"], 벽: ["wall"], 바닥: ["floor", "ground", "paving"],
  돌: ["stone", "rock"], 콘크리트: ["concrete", "cement"], 금속: ["metal", "iron", "steel"], 녹: ["rust", "rusty"],
  천: ["fabric", "cloth"], 실내: ["indoor", "interior", "studio"], 실외: ["outdoor", "exterior"],
  숲: ["forest", "woods", "tree"], 밤: ["night", "evening"], 야경: ["night", "evening"], 노을: ["sunset", "dusk"],
  하늘: ["sky", "cloud"], 조명: ["light", "studio"], 의자: ["chair", "stool"], 책상: ["desk", "table"],
  책: ["book"], 병: ["bottle"], 식물: ["plant", "flower", "tree"], 타일: ["tile"], 지붕: ["roof"],
  도시: ["city", "urban", "street"], 골목: ["alley", "street", "brick"], 낡은: ["worn", "old", "weathered"],
};
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function cleanMaterialText(value: unknown, max = 160): string {
  return typeof value === "string" ? value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
export function materialTextList(value: unknown, limit = 24): string[] {
  return Array.isArray(value) ? [...new Set(value.slice(0, 80).map((entry) => cleanMaterialText(entry, 80)).filter(Boolean))].slice(0, limit) : [];
}
export function materialSourceUrl(provider: MaterialProvider, sourceId: string): string {
  if (!SOURCE_ID.test(sourceId)) return "";
  return provider === "polyhaven" ? `https://polyhaven.com/a/${sourceId}` : `https://ambientcg.com/a/${sourceId}`;
}
export function safeMaterialThumbnail(provider: MaterialProvider, sourceId: string, value: unknown): string {
  if (!SOURCE_ID.test(sourceId) || typeof value !== "string" || value.length > 700) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return "";
    const expected = provider === "polyhaven"
      ? { host: "cdn.polyhaven.com", path: `/asset_img/thumbs/${sourceId}.png` }
      : { host: "acg-media.struffelproductions.com", path: `/file/ambientCG-Web/media/thumbnail/256-WEBP/${sourceId}.webp` };
    if (url.hostname !== expected.host || url.pathname !== expected.path) return "";
    url.search = provider === "polyhaven" ? "?width=256&height=256" : "";
    return url.href;
  } catch { return ""; }
}
export function parseMaterialAsset(value: unknown): MaterialAsset | null {
  const row = asRecord(value);
  if (!row || (row.provider !== "polyhaven" && row.provider !== "ambientcg") || typeof row.sourceId !== "string" || !SOURCE_ID.test(row.sourceId)) return null;
  if (row.license !== "CC0-1.0" || (row.kind !== "texture" && row.kind !== "model" && row.kind !== "hdri")) return null;
  const title = cleanMaterialText(row.title);
  const sourceUrl = materialSourceUrl(row.provider, row.sourceId);
  if (!title || row.id !== `${row.provider}:${row.sourceId}` || row.sourceUrl !== sourceUrl) return null;
  return { id: row.id as string, provider: row.provider, sourceId: row.sourceId, title, kind: row.kind,
    tags: materialTextList(row.tags), authors: materialTextList(row.authors, 8), sourceUrl,
    thumbnailUrl: safeMaterialThumbnail(row.provider, row.sourceId, row.thumbnailUrl), license: "CC0-1.0" };
}
export function parseMaterialCatalog(value: unknown): MaterialCatalog | null {
  const row = asRecord(value);
  if (!row || row.schema !== MATERIAL_CATALOG_SCHEMA || typeof row.fetchedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T/.test(row.fetchedAt) || !Number.isFinite(Date.parse(row.fetchedAt))
    || !Array.isArray(row.assets) || row.assets.length === 0 || row.assets.length > MAX_CATALOG_ASSETS) return null;
  const assets: MaterialAsset[] = [];
  const ids = new Set<string>();
  for (const candidate of row.assets) {
    const asset = parseMaterialAsset(candidate);
    if (!asset || ids.has(asset.id)) return null;
    ids.add(asset.id); assets.push(asset);
  }
  return { schema: MATERIAL_CATALOG_SCHEMA, fetchedAt: row.fetchedAt, assets };
}
const normalizedText = (value: string) => value.normalize("NFKC").toLowerCase();
export function filterMaterials(assets: MaterialAsset[], options: { query: string; provider: string; kind: string; study?: MaterialStudy }): MaterialAsset[] {
  const terms = normalizedText(options.query).trim().slice(0, 80).split(/\s+/).filter(Boolean);
  return assets.filter((asset) => {
    if (options.provider !== "all" && asset.provider !== options.provider) return false;
    if (options.kind !== "all" && asset.kind !== options.kind) return false;
    const haystack = normalizedText([asset.title, ...asset.tags, ...asset.authors, MATERIAL_PROVIDERS[asset.provider].name, MATERIAL_KINDS[asset.kind]].join(" "));
    if (options.study && !options.study.terms.some((term) => haystack.includes(term))) return false;
    return terms.every((term) => [term, ...(Object.hasOwn(KOREAN_TERMS, term) ? KOREAN_TERMS[term] : [])].some((alternative) => haystack.includes(alternative)));
  });
}
export function materialSelectionFromParams(params: URLSearchParams, assets: MaterialAsset[]): string[] {
  const allowed = new Set(assets.map((asset) => asset.id));
  return [...new Set((params.get("items") ?? "").slice(0, 1600).split(","))].filter((id) => allowed.has(id)).slice(0, MAX_MATERIAL_SELECTION);
}
export function toggleMaterialSelection(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((selected) => selected !== id);
  return current.length >= MAX_MATERIAL_SELECTION ? current : [...current, id];
}
export function makeMaterialBoard(selectedIds: string[], note: string, studyId: string): MaterialBoard {
  return { schema: MATERIAL_BOARD_SCHEMA, selectedIds: [...new Set(selectedIds)].slice(0, MAX_MATERIAL_SELECTION), note: note.slice(0, MAX_MATERIAL_NOTE), studyId };
}
export function parseMaterialBoard(text: string, assets: MaterialAsset[], studies: MaterialStudy[]): { board: MaterialBoard; missing: number } {
  if (text.length > 40_000) throw new Error("보드 파일이 너무 큽니다. 40KB 이하의 소재 보드 JSON을 사용하세요.");
  const row = asRecord(JSON.parse(text) as unknown);
  if (!row || row.schema !== MATERIAL_BOARD_SCHEMA || !Array.isArray(row.selectedIds) || row.selectedIds.length > MAX_MATERIAL_SELECTION
    || row.selectedIds.some((id) => typeof id !== "string" || id.length > 100) || typeof row.note !== "string" || row.note.length > MAX_MATERIAL_NOTE
    || typeof row.studyId !== "string" || row.studyId.length > 80) throw new Error("소재 보드 파일 형식을 확인하지 못했습니다.");
  const ids = [...new Set(row.selectedIds as string[])];
  const allowed = new Set(assets.map((asset) => asset.id));
  const selectedIds = ids.filter((id) => allowed.has(id));
  return { board: makeMaterialBoard(selectedIds, row.note, studies.some((study) => study.id === row.studyId) ? row.studyId : ""), missing: ids.length - selectedIds.length };
}
export function materialShareUrl(origin: string, selectedIds: string[], studyId: string): string {
  const url = new URL("/research/materials", origin);
  if (selectedIds.length) url.searchParams.set("items", selectedIds.slice(0, MAX_MATERIAL_SELECTION).join(","));
  if (studyId) url.searchParams.set("study", studyId);
  return url.href;
}
const markdownText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\\`*_[\]{}()#|!]/g, "\\$&");
export function materialSpecification(catalog: MaterialCatalog, selectedIds: string[], note: string, study?: MaterialStudy): string {
  const selected = selectedIds.flatMap((id) => catalog.assets.find((asset) => asset.id === id) ?? []);
  const lines = ["# ToonStudio 장면 소재 명세서", "", `카탈로그 확인: ${catalog.fetchedAt}`, "", "선택한 공개 소재와 고정 작업 가이드를 정리한 문서입니다. 이미지·영상 생성 결과가 아닙니다.", ""];
  if (study) lines.push(`## ${markdownText(study.title)}`, "", ...study.steps.map((step, index) => `${index + 1}. ${markdownText(step)}`), "");
  if (note.trim()) lines.push("## 내 제작 메모", "", ...note.slice(0, MAX_MATERIAL_NOTE).split("\n").map((line) => `> ${markdownText(line)}`), "");
  lines.push("## 선택한 소재와 출처", "");
  for (const asset of selected) {
    lines.push(`### ${markdownText(asset.title)}`, `- 종류: ${MATERIAL_KINDS[asset.kind]}`, `- 제공처: ${MATERIAL_PROVIDERS[asset.provider].name}`,
      `- 제작자/크레딧: ${markdownText(asset.authors.join(", ") || MATERIAL_PROVIDERS[asset.provider].name)}`, `- 원문: ${asset.sourceUrl}`,
      `- 자료 라이선스: CC0 1.0 (${MATERIAL_PROVIDERS[asset.provider].license})`, "");
  }
  lines.push("## 이용 전 확인", "", "CC0 표기는 공개 제공처의 자산 정책을 근거로 합니다. 상표·초상·제3자 권리와 실제 원본 제공 상태는 사용 시점에 원문에서 확인하세요.",
    "이 서비스는 Poly Haven 또는 ambientCG의 공식 제품이나 제휴 서비스가 아닙니다. API 약관과 개별 자산 라이선스는 별개입니다.", "원본 파일은 이 문서에 포함되지 않습니다. 제공처에서 해상도와 파일 크기를 확인한 뒤 직접 내려받으세요.", "");
  return lines.join("\n");
}
