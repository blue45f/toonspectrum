import { randomBytes } from "node:crypto";
import { readFile, writeFile, lstat, chmod, rename } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, ".env.collaboration-qa.local");
export const QA_ACTORS = ["OWNER", "EDITOR", "VIEWER"];
const NAMES = { OWNER: "서린", EDITOR: "도윤", VIEWER: "하린" };
export function validateQaOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("사이트 origin만 지정하세요.");
  if (url.origin !== "https://www.toonstudio.cloud" && !(url.protocol === "http:" && url.hostname === "127.0.0.1")) throw new Error("승인된 운영 origin 또는 격리된 로컬 주소만 허용합니다.");
  return url.origin;
}
export function accountEnvelope(inbox, run, origin) {
  if (!/^[A-Za-z0-9._%+-]+@gmail\.com$/u.test(inbox)) throw new Error("본인이 소유하고 인증 메일을 확인할 Gmail 주소가 필요합니다.");
  if (!/^[a-z0-9-]{8,40}$/u.test(run)) throw new Error("실행 ID는 영문 소문자·숫자·하이픈 8~40자로 지정하세요.");
  const local = inbox.split("@")[0].split("+")[0];
  const entries = { COLLAB_QA_BASE_URL: validateQaOrigin(origin), COLLAB_QA_RUN: run };
  for (const actor of QA_ACTORS) Object.assign(entries, {
    [`COLLAB_QA_${actor}_EMAIL`]: `${local}+collab-${run}-${actor.toLowerCase()}@gmail.com`,
    [`COLLAB_QA_${actor}_PASSWORD`]: `Aa7!${randomBytes(24).toString("base64url")}`,
    [`COLLAB_QA_${actor}_NAME`]: NAMES[actor], [`COLLAB_QA_${actor}_STATE`]: "prepared",
  });
  return entries;
}
function encode(entries) {
  return "# 개인 테스트 계정 로그인 정보. Git·공개 번들·로그에 포함하지 마세요.\n"
    + Object.entries(entries).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n";
}
export async function prepareAccountFile(file, entries) {
  await writeFile(file, encode(entries), { flag: "wx", mode: 0o600 });
  await chmod(file, 0o600);
}
export async function readAccountFile(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("로그인 파일은 일반 파일이고 권한이 600이어야 합니다.");
  const entries = parseEnv(await readFile(file, "utf8"));
  validateQaOrigin(entries.COLLAB_QA_BASE_URL);
  for (const actor of QA_ACTORS) {
    if (!entries[`COLLAB_QA_${actor}_EMAIL`] || !entries[`COLLAB_QA_${actor}_PASSWORD`]) throw new Error("계정별 이메일과 비밀번호가 필요합니다.");
  }
  if (Object.keys(entries).some((key) => !key.startsWith("COLLAB_QA_"))) throw new Error("이 파일에는 협업 검증 계정 항목만 저장하세요.");
  return entries;
}
async function storeState(file, entries) {
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, encode(entries), { flag: "wx", mode: 0o600 });
  await rename(temp, file);
}
export async function registerAccounts(entries, request = fetch, persist = async () => undefined) {
  const origin = validateQaOrigin(entries.COLLAB_QA_BASE_URL);
  const results = [];
  for (const actor of QA_ACTORS) {
    if (entries[`COLLAB_QA_${actor}_STATE`] === "verification-required") { results.push({ actor, status: "verification-required" }); continue; }
    const response = await request(`${origin}/api/auth/signup`, { method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", Origin: origin }, signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ email: entries[`COLLAB_QA_${actor}_EMAIL`], password: entries[`COLLAB_QA_${actor}_PASSWORD`], name: entries[`COLLAB_QA_${actor}_NAME`] }),
    });
    if (!response.ok) throw new Error(`${actor} 회원가입 요청 실패 (${response.status}). 자동 재시도하지 않았습니다.`);
    const body = await response.json();
    if (body.ok !== true || body.verificationRequired !== true) throw new Error("회원가입 응답을 확인하지 못했습니다.");
    entries[`COLLAB_QA_${actor}_STATE`] = "verification-required";
    await persist(entries); results.push({ actor, status: "verification-required" });
  }
  return results;
}
async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  if (args.includes("--dry-run") || !args.some((arg) => ["--prepare", "--register", "--check"].includes(arg))) {
    console.log("--prepare --inbox 본인주소 --run 실행ID: Git 제외·600 권한 로컬 env 생성. --register --allow-live-writes: 일반 가입 요청. 이메일 인증은 실제 받은 메일에서 완료하세요. --check: 파일 보호 확인. 비밀번호는 출력하지 않습니다."); return;
  }
  const file = resolve(value("--file") ?? FILE);
  execFileSync("git", ["check-ignore", "--quiet", file], { cwd: ROOT, stdio: "ignore" });
  if (args.includes("--prepare")) {
    await prepareAccountFile(file, accountEnvelope(value("--inbox") ?? "", value("--run") ?? "", value("--origin") ?? "https://www.toonstudio.cloud"));
    console.log("로그인 정보 파일을 권한 600으로 준비했습니다. 아직 계정은 생성되지 않았습니다."); return;
  }
  const entries = await readAccountFile(file);
  if (args.includes("--register")) {
    if (!args.includes("--allow-live-writes")) throw new Error("회원가입에는 별도 쓰기 승인이 필요합니다.");
    const results = await registerAccounts(entries, fetch, (next) => storeState(file, next));
    console.log(JSON.stringify({ results, next: "본인 메일함에서 인증을 완료하세요. 관리자 회원관리에서 테스트 계정 구분을 지정하세요." }));
  } else console.log(JSON.stringify({ fileProtected: true, actors: QA_ACTORS, accountCreationVerified: false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("계정 준비에 실패했습니다. Git 제외 경로·파일 권한·명시적 쓰기 승인·이메일 인증 상태를 확인하세요. 비밀번호나 서버 응답 원문은 출력하지 않았습니다.");
    process.exitCode = 1;
  });
}
