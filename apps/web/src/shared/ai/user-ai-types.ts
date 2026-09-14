/** One configuration owns all user-funded AI connections. Never export credentials with works. */
export type UserAiCapability = "text" | "image" | "inference" | "three-d";
export interface UserAiConnection {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  imageGenerationPath: string;
  imageEditPath: string;
  chatCompletionsPath: string;
}
export interface UserAiConfiguration {
  version: 1;
  connections: UserAiConnection[];
  assignments: Record<UserAiCapability, string | null>;
}
export const USER_AI_SETTINGS_HREF = "/settings/ai";
export const USER_AI_VAULT_KEY = "toonstudio:user-ai:encrypted:v1";
export const USER_AI_LOCK_KEY = "toonstudio:user-ai:lock:v1";
export const EMPTY_AI_CONFIGURATION: UserAiConfiguration = {
  version: 1, connections: [], assignments: { text: null, image: null, inference: null, "three-d": null },
};
export const EMPTY_AI_CONNECTION: UserAiConnection = {
  id: "", label: "", baseUrl: "https://api.openai.com/v1", apiKey: "",
  textModel: "", imageModel: "", imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits", chatCompletionsPath: "/chat/completions",
};
export const USER_AI_CAPABILITIES: readonly UserAiCapability[] = ["text", "image", "inference", "three-d"];
export function validateUserAiBaseUrl(value: string): string {
  const url = new URL(value.trim());
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username || url.password || url.search || url.hash
    || /(?:^|\.)(?:toonstudio\.cloud|toonspectrum\.vercel\.app)$/u.test(url.hostname)
    || (typeof location !== "undefined" && url.origin === location.origin)) {
    throw new Error("AI 제공자 또는 직접 운영하는 HTTPS 주소를 입력하세요. 사이트 자체 주소·인증정보가 포함된 URL은 사용할 수 없습니다.");
  }
  return url.href.replace(/\/+$/u, "");
}
export function validateUserAiPath(path: string): string {
  if (!/^\/[A-Za-z0-9_./-]+$/u.test(path) || path.includes("//") || path.split("/").some(part => part === "." || part === "..") || path.length > 160) {
    throw new Error("API 경로는 /로 시작하는 상대 경로여야 합니다.");
  }
  return path;
}
export function normalizeUserAiConfiguration(value: unknown): UserAiConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI 설정 형식이 올바르지 않습니다.");
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || !Array.isArray(raw.connections) || raw.connections.length > 12
    || !raw.assignments || typeof raw.assignments !== "object") throw new Error("AI 설정 버전을 확인하세요.");
  const fields = ["id", "label", "baseUrl", "apiKey", "textModel", "imageModel", "imageGenerationPath", "imageEditPath", "chatCompletionsPath"] as const;
  const connections = raw.connections.map((item): UserAiConnection => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("잘못된 AI 연결입니다.");
    const source = item as Record<string, unknown>;
    for (const field of fields) {
      if (typeof source[field] !== "string" || source[field].length > (field === "apiKey" ? 4096 : 300)) throw new Error("AI 연결 필드를 확인하세요.");
    }
    const connection = Object.fromEntries(fields.map(field => [field, (source[field] as string).trim()])) as unknown as UserAiConnection;
    if (!/^[A-Za-z0-9_-]{1,80}$/u.test(connection.id) || !connection.label || !connection.apiKey
      || Array.from(connection.apiKey).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error("연결 이름과 유효한 사용자 API 키를 입력하세요.");
    connection.baseUrl = validateUserAiBaseUrl(connection.baseUrl);
    connection.imageGenerationPath = validateUserAiPath(connection.imageGenerationPath);
    connection.imageEditPath = validateUserAiPath(connection.imageEditPath);
    connection.chatCompletionsPath = validateUserAiPath(connection.chatCompletionsPath);
    return connection;
  });
  if (new Set(connections.map(item => item.id)).size !== connections.length) throw new Error("중복된 AI 연결 ID입니다.");
  const sourceAssignments = raw.assignments as Record<string, unknown>;
  const assignments = { ...EMPTY_AI_CONFIGURATION.assignments };
  for (const capability of USER_AI_CAPABILITIES) {
    const id = sourceAssignments[capability] ?? null;
    if (id !== null && (typeof id !== "string" || !connections.some(item => item.id === id))) throw new Error("AI 기능의 연결 대상을 확인하세요.");
    assignments[capability] = id as string | null;
  }
  return { version: 1, connections, assignments };
}
