// 런타임 앱 설정(app_setting 테이블). 광고형 수익화 on/off 등 토글을 관리한다.
// 기본값은 전부 비활성(초반엔 전 기능 무료·광고 없음). 관리자만 켤 수 있다.
import { eq } from "drizzle-orm";
import { appSettings, db, dbClient, users } from "../db";

// 관리자(admin/operator 역할 또는 ADMIN_EMAILS 화이트리스트) 여부 — admin-authed 라우트 공용.
export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
  const [u] = await db.select({ role: users.role, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return false;
  const role = String(u.role ?? "").toLowerCase();
  if (role === "admin" || role === "operator") return true;
  const whitelist = String(process.env.ADMIN_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return whitelist.includes(String(u.email ?? "").toLowerCase());
  } catch {
    return false; // DB(Neon) 불가 시 관리자 아님으로 안전 폴백.
  }
}

let ensured = false;
async function ensureSettingsTable() {
  if (ensured) return;
  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS app_setting (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  ensured = true;
}

export interface AppConfig {
  // 광고형 수익화(제휴 링크·스폰서 슬롯) 전역 스위치. 기본 false = 전 기능 무료·광고 없음.
  monetizationEnabled: boolean;
}

const DEFAULTS: AppConfig = { monetizationEnabled: false };
const CONFIG_KEY = "config";

function sanitize(patch: Partial<AppConfig>): Partial<AppConfig> {
  const out: Partial<AppConfig> = {};
  if (typeof patch.monetizationEnabled === "boolean") out.monetizationEnabled = patch.monetizationEnabled;
  return out;
}

export async function getAppConfig(): Promise<AppConfig> {
  try {
    await ensureSettingsTable();
    const rows = await db.select().from(appSettings);
    const raw = (rows.find((r) => r.key === CONFIG_KEY)?.value ?? {}) as Partial<AppConfig>;
    return { ...DEFAULTS, ...sanitize(raw) };
  } catch {
    // DB(Neon) 불가(쿼터/장애) 시 기본값(전 기능 무료·광고 없음)으로 폴백 — 설정 조회가 페이지를 깨지 않게.
    return { ...DEFAULTS };
  }
}

export async function setAppConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  await ensureSettingsTable();
  const next: AppConfig = { ...(await getAppConfig()), ...sanitize(patch) };
  await db
    .insert(appSettings)
    .values({ key: CONFIG_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } });
  return next;
}
