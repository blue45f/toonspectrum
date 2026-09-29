#!/usr/bin/env node

/**
 * 로컬 테스트 스택 실행기.
 *
 * `pnpm local:test` 한 번으로 API(Nest) + Web(Vite)을 연동 기동하고 준비 상태까지
 * 확인한 뒤 테스트 URL을 출력한다. 이미 떠 있는 서버는 재사용한다.
 *
 * 안전 규칙:
 * - .env 파일을 쓰지 않는다. disposable DB URL은 자식 프로세스 env로만 전달한다.
 * - 사용자가 준 DATABASE_URL에는 db:push/seed를 절대 실행하지 않는다.
 * - 스키마 push는 이 스크립트가 새로 만든 disposable DB(docker 컨테이너 또는
 *   로컬 클러스터)에만 1회 실행한다.
 * - seed는 하지 않는다. 인증 플로 테스트는 안내 문구대로 별도 실행한다.
 */

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const LOCAL_TEST_DEFAULT_API_PORT = 4001;
export const LOCAL_TEST_DEFAULT_WEB_PORT = 5173;
export const LOCAL_TEST_DB_CONTAINER = "toonstudio-local-test-db";
export const LOCAL_TEST_DB_PORT = 55432;
export const LOCAL_TEST_DB_PASSWORD = "toonstudio-local-test";
export const LOCAL_TEST_POSTGRES_IMAGE = "postgres:16-alpine";
export const LOCAL_TEST_PG_CLUSTER_DIRNAME = "toonstudio-local-test-pg";
export const LOCAL_TEST_RUNTIME_ROLE = "toonstudio_runtime";
export const LOCAL_TEST_BOOTSTRAP_CONFIRMATION = "BOOTSTRAP-EMPTY-TOONSPECTRUM-DATABASE";

export function parseLocalTestStackArgs(argv) {
  const options = {
    check: false,
    help: false,
    apiPort: LOCAL_TEST_DEFAULT_API_PORT,
    webPort: LOCAL_TEST_DEFAULT_WEB_PORT,
    resetDb: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--reset-db") options.resetDb = true;
    else if (arg === "--api-port") {
      const next = Number(argv[index + 1]);
      if (!Number.isInteger(next) || next < 1 || next > 65535) {
        throw new Error("--api-port 뒤에 1-65535 포트를 지정하세요.");
      }
      options.apiPort = next;
      index += 1;
    } else if (arg === "--web-port") {
      const next = Number(argv[index + 1]);
      if (!Number.isInteger(next) || next < 1 || next > 65535) {
        throw new Error("--web-port 뒤에 1-65535 포트를 지정하세요.");
      }
      options.webPort = next;
      index += 1;
    } else if (arg.startsWith("--api-port=")) {
      const next = Number(arg.slice("--api-port=".length));
      if (!Number.isInteger(next) || next < 1 || next > 65535) {
        throw new Error("--api-port= 뒤에 1-65535 포트를 지정하세요.");
      }
      options.apiPort = next;
    } else if (arg.startsWith("--web-port=")) {
      const next = Number(arg.slice("--web-port=".length));
      if (!Number.isInteger(next) || next < 1 || next > 65535) {
        throw new Error("--web-port= 뒤에 1-65535 포트를 지정하세요.");
      }
      options.webPort = next;
    } else {
      throw new Error(`알 수 없는 인자: ${arg} (--help 참조)`);
    }
  }
  return options;
}

/** 로그용 마스킹. 자격증명·쿼리를 지우고 호스트/DB명만 남긴다. */
export function redactDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.username = "***";
    parsed.password = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return "(unparseable-url)";
  }
}

/** 원격(Neon 등) URL이면 true. 로컬 스택이 스키마를 건드리면 안 되는 대상 판별용. */
export function isRemoteDatabaseUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return true;
  }
}

export function apiHealthUrl(apiPort) {
  return `http://127.0.0.1:${apiPort}/api/health/live`;
}

export function webHealthUrl(webPort) {
  return `http://127.0.0.1:${webPort}/`;
}

export function disposableDatabaseUrl() {
  return `postgresql://postgres:${LOCAL_TEST_DB_PASSWORD}@127.0.0.1:${LOCAL_TEST_DB_PORT}/postgres`;
}

export function localClusterDir() {
  return join(tmpdir(), LOCAL_TEST_PG_CLUSTER_DIRNAME);
}

async function probeOk(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function runCapture(command, args, options = {}) {
  const { timeoutMs = 0, ...spawnOptions } = options;
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = timeoutMs > 0
      ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs)
      : null;
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: String(error) });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, stdout, stderr: `${stderr}\n(timed out after ${timeoutMs}ms)` });
        return;
      }
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

async function waitFor(label, probe, { timeoutMs, intervalMs, onTimeout }) {
  const started = Date.now();
  for (;;) {
    if (await probe()) return true;
    if (Date.now() - started > timeoutMs) {
      onTimeout?.();
      return false;
    }
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  }
}

function streamPrefixed(child, label) {
  const pump = (stream, target) => {
    let buffered = "";
    stream.on("data", (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/u);
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length > 0) target.write(`[${label}] ${line}\n`);
      }
    });
  };
  if (child.stdout) pump(child.stdout, process.stdout);
  if (child.stderr) pump(child.stderr, process.stderr);
}

async function dockerAvailable() {
  const docker = await runCapture("docker", ["info", "--format", "{{.ServerVersion}}"]);
  return docker.ok;
}

async function initdbAvailable() {
  const initdb = await runCapture("initdb", ["--version"]);
  return initdb.ok;
}

async function ensureLocalPostgresCluster({ resetDb }) {
  const dir = localClusterDir();
  const versionFile = join(dir, "PG_VERSION");
  const pidFile = join(dir, "postmaster.pid");
  if (resetDb && existsSync(dir)) {
    process.stdout.write("[db] --reset-db: 기존 로컬 클러스터 제거 중…\n");
    await runCapture("pg_ctl", ["-D", dir, "stop", "-m", "fast", "-w"], { timeoutMs: 30_000 });
    rmSync(dir, { recursive: true, force: true });
  }
  const initialized = existsSync(versionFile);
  if (!initialized) {
    if (existsSync(dir)) {
      throw new Error(
        `로컬 클러스터 경로가 이미 있지만 초기화가 안 됐습니다: ${dir}\n`
        + "직접 확인 후 지우거나 --reset-db로 다시 만드세요.",
      );
    }
    process.stdout.write(`[db] disposable 로컬 postgres 클러스터 초기화 중 (${dir})…\n`);
    const created = await runCapture("initdb", [
      "-D", dir, "-U", "postgres", "-A", "trust", "-E", "UTF8",
    ], { timeoutMs: 120_000 });
    if (!created.ok) {
      throw new Error(`로컬 postgres 초기화 실패:\n${created.stderr.slice(0, 1000)}`);
    }
  }
  if (!existsSync(pidFile)) {
    const started = await runCapture("pg_ctl", [
      "-D", dir,
      "-o", `-h 127.0.0.1 -p ${LOCAL_TEST_DB_PORT} -k ${dir}`,
      "-l", join(dir, "local-test-stack.log"),
      "-w", "-t", "60",
      "start",
    ], { timeoutMs: 90_000 });
    if (!started.ok) {
      throw new Error(
        `로컬 postgres 시작 실패 (포트 ${LOCAL_TEST_DB_PORT} 점유 가능 — 다른 세션 자원은 건드리지 않습니다):\n`
        + `${started.stderr.slice(0, 1000)}`,
      );
    }
  } else {
    process.stdout.write("[db] 기존 로컬 클러스터 재사용 중…\n");
  }
  if (!initialized) {
    // 부트스트랩 검증이 URL 비밀번호를 요구하므로 disposable 비밀번호를 설정한다.
    const secured = await runCapture("psql", [
      localClusterTrustUrl(),
      "-c",
      `ALTER ROLE postgres PASSWORD '${LOCAL_TEST_DB_PASSWORD}'`,
    ], { timeoutMs: 30_000 });
    if (!secured.ok) {
      throw new Error(`로컬 클러스터 비밀번호 설정 실패:\n${secured.stderr.slice(0, 500)}`);
    }
  }
  return {
    databaseUrl: disposableDatabaseUrl(),
    fresh: !initialized,
    reused: initialized,
    backend: "local-cluster",
    detail: dir,
  };
}

function localClusterTrustUrl() {
  return `postgresql://postgres@127.0.0.1:${LOCAL_TEST_DB_PORT}/postgres`;
}

async function ensureDisposablePostgres({ resetDb }) {
  if (await dockerAvailable()) {
    return ensureDockerPostgres({ resetDb });
  }
  if (await initdbAvailable()) {
    process.stdout.write("[db] docker 미사용 — 로컬 postgres 클러스터로 진행합니다.\n");
    return ensureLocalPostgresCluster({ resetDb });
  }
  throw new Error(
    "DATABASE_URL이 없고 docker·로컬 postgres도 사용할 수 없습니다. "
    + "다음 중 하나로 API용 DB를 준비하세요:\n"
    + "  1) docker를 실행한 뒤 다시 시도 (disposable 컨테이너 자동 생성)\n"
    + "  2) postgres(initdb/pg_ctl)를 설치한 뒤 다시 시도 (disposable 로컬 클러스터 자동 생성)\n"
    + "  3) DATABASE_URL=postgresql://… pnpm local:test (사용자 DB 사용, 스키마는 건드리지 않음)",
  );
}

async function ensureDockerPostgres({ resetDb }) {
  const existing = await runCapture("docker", [
    "ps", "-a", "--filter", `name=^${LOCAL_TEST_DB_CONTAINER}$`, "--format", "{{.Status}}",
  ]);
  const status = existing.stdout.trim();
  if (resetDb && status) {
    process.stdout.write(`[db] --reset-db: 기존 컨테이너 제거 중…\n`);
    await runCapture("docker", ["rm", "-f", LOCAL_TEST_DB_CONTAINER]);
  }
  const afterReset = resetDb
    ? { stdout: "" }
    : existing;
  if (!afterReset.stdout.trim()) {
    process.stdout.write(`[db] disposable postgres 생성 중 (${LOCAL_TEST_POSTGRES_IMAGE})…\n`);
    const created = await runCapture("docker", [
      "run", "-d",
      "--name", LOCAL_TEST_DB_CONTAINER,
      "-p", `${LOCAL_TEST_DB_PORT}:5432`,
      "-e", `POSTGRES_PASSWORD=${LOCAL_TEST_DB_PASSWORD}`,
      "-e", "POSTGRES_DB=postgres",
      "--label", "toonstudio.local-test-stack=true",
      LOCAL_TEST_POSTGRES_IMAGE,
    ]);
    if (!created.ok) {
      throw new Error(`disposable postgres 생성 실패:\n${created.stderr.slice(0, 1000)}`);
    }
    const ready = await waitFor("db", async () => {
      const check = await runCapture("docker", [
        "exec", LOCAL_TEST_DB_CONTAINER, "pg_isready", "-U", "postgres",
      ]);
      return check.ok;
    }, { timeoutMs: 120_000, intervalMs: 2000 });
    if (!ready) throw new Error("disposable postgres가 120초 안에 준비되지 않았습니다.");
    return {
      databaseUrl: disposableDatabaseUrl(),
      fresh: true,
      reused: false,
      backend: "docker",
      detail: LOCAL_TEST_DB_CONTAINER,
    };
  }
  if (!status.startsWith("Up")) {
    process.stdout.write(`[db] 기존 컨테이너 시작 중…\n`);
    await runCapture("docker", ["start", LOCAL_TEST_DB_CONTAINER]);
    const ready = await waitFor("db", async () => {
      const check = await runCapture("docker", [
        "exec", LOCAL_TEST_DB_CONTAINER, "pg_isready", "-U", "postgres",
      ]);
      return check.ok;
    }, { timeoutMs: 60_000, intervalMs: 2000 });
    if (!ready) throw new Error("기존 postgres 컨테이너가 60초 안에 준비되지 않았습니다.");
  }
  return {
    databaseUrl: disposableDatabaseUrl(),
    fresh: false,
    reused: true,
    backend: "docker",
    detail: LOCAL_TEST_DB_CONTAINER,
  };
}

async function bootstrapFreshDatabase(databaseUrl) {
  const head = await runCapture("git", ["rev-parse", "HEAD"]);
  const sha = head.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("HEAD SHA를 확인하지 못해 disposable DB 부트스트랩을 중단합니다.");
  }
  process.stdout.write("[db] 새로 만든 disposable DB에 스키마+마이그레이션 적용 중…\n");
  const bootstrapped = await runCapture("pnpm", [
    "db:bootstrap:production-empty",
    "--",
    "--execute",
    "--allow-loopback",
    "--runtime-database-role", LOCAL_TEST_RUNTIME_ROLE,
    "--release-sha", sha,
    "--confirmation", LOCAL_TEST_BOOTSTRAP_CONFIRMATION,
  ], {
    env: {
      ...process.env,
      MIGRATION_DATABASE_URL: databaseUrl,
      BOOTSTRAP_RUNTIME_DATABASE_PASSWORD: LOCAL_TEST_DB_PASSWORD,
    },
    cwd: process.cwd(),
    timeoutMs: 600_000,
  });
  if (!bootstrapped.ok) {
    throw new Error(
      "disposable DB 부트스트랩 실패. DB 자원은 유지됩니다(--reset-db로 재생성 가능).\n"
      + `${(bootstrapped.stdout + bootstrapped.stderr).slice(-1500)}`,
    );
  }
}

function printHelp() {
  process.stdout.write(
    [
      "사용법: pnpm local:test [옵션]",
      "",
      "  API(Nest) + Web(Vite) 로컬 테스트 스택을 한 번에 기동한다.",
      "  이미 떠 있는 서버는 재사용하고, 준비 상태까지 확인한 뒤 URL을 출력한다.",
      "",
      "옵션:",
      "  --check        기동 없이 스택 상태만 확인 (CI/게이트용, 미충족 시 exit 1)",
      "  --api-port N   API 포트 (기본 4001, NEST_API_PORT 통과)",
      "  --web-port N   Web 포트 (기본 5173)",
      "  --reset-db     disposable DB 컨테이너를 버리고 새로 만든다",
      "  --help, -h     이 도움말",
      "",
      "DB 처리:",
      "  - DATABASE_URL이 있으면 그것을 사용하고 스키마/시드를 건드리지 않는다.",
      "  - 없으면 disposable postgres(:55432)를 만들고 스키마+마이그레이션을 1회 적용한다.",
      "    (docker 우선, 없으면 로컬 initdb 클러스터)",
      "  - 인증 플로 테스트용 시드는 별도 실행: pnpm db:seed (대상 DB 확인 후)",
      "",
    ].join("\n"),
  );
}

async function printCheckReport({ apiPort, webPort }) {
  const apiUrl = apiHealthUrl(apiPort);
  const webUrl = webHealthUrl(webPort);
  const probe = async (url) => (await probeOk(url, 10_000)) || (await probeOk(url, 10_000));
  const [apiOk, webOk] = await Promise.all([probe(apiUrl), probe(webUrl)]);
  const lines = [
    "로컬 테스트 스택 상태:",
    `  API  ${apiUrl} → ${apiOk ? "정상" : "미기동"}`,
    `  Web  ${webUrl} → ${webOk ? "정상" : "미기동"}`,
  ];
  if (apiOk && webOk) {
    lines.push(`  Canvas http://127.0.0.1:${webPort}/studio/canvas`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  return apiOk && webOk;
}

async function main(argv, environment = process.env) {
  const options = parseLocalTestStackArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }
  if (options.check) {
    const ok = await printCheckReport(options);
    return ok ? 0 : 1;
  }

  const children = [];
  let stopping = false;
  const trackChild = (child, label) => {
    children.push(child);
    child.on("close", (code) => {
      if (!stopping && code !== 0 && code !== null) {
        process.stderr.write(`[stack] ${label} 프로세스가 종료됨 (code ${code}) — 스택을 중단합니다.\n`);
        shutdown(`${label}_EXIT`);
        process.exit(1);
      }
    });
  };
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`\n[stack] ${signal} 수신 — 자식 프로세스 종료 중…\n`);
    for (const child of children) {
      try { child.kill("SIGTERM"); } catch { /* 이미 종료 */ }
    }
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const started = [];
  const reused = [];

  // 1) API
  const apiUrl = apiHealthUrl(options.apiPort);
  if (await probeOk(apiUrl)) {
    reused.push(`API :${options.apiPort}`);
  } else {
    let databaseUrl = environment.DATABASE_URL?.trim() || "";
    let dbNote;
    if (databaseUrl) {
      dbNote = `사용자 DATABASE_URL 사용 (${redactDatabaseUrl(databaseUrl)}, 스키마 미변경)`;
      if (isRemoteDatabaseUrl(databaseUrl)) {
        dbNote += " — 원격 DB이므로 seed/push 금지";
      }
    } else {
      const ensured = await ensureDisposablePostgres({ resetDb: options.resetDb });
      databaseUrl = ensured.databaseUrl;
      if (ensured.fresh) await bootstrapFreshDatabase(databaseUrl);
      const backendLabel = ensured.backend === "docker" ? "docker postgres" : "로컬 postgres 클러스터";
      dbNote = ensured.fresh
        ? `disposable ${backendLabel} 신규 생성+스키마 적용 (${redactDatabaseUrl(databaseUrl)})`
        : `기존 disposable DB 재사용 (${ensured.detail})`;
    }
    process.stdout.write(`[db] ${dbNote}\n`);
    process.stdout.write(`[api] Nest API 기동 중 (포트 ${options.apiPort})…\n`);
    const api = spawn("pnpm", ["--filter", "@webtoon-nest/api", "dev"], {
      env: {
        ...environment,
        DATABASE_URL: databaseUrl,
        NEST_API_PORT: String(options.apiPort),
      },
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    trackChild(api, "api");
    streamPrefixed(api, "api");
    const apiReady = await waitFor("api", () => probeOk(apiUrl), {
      timeoutMs: 240_000,
      intervalMs: 2500,
    });
    if (!apiReady) {
      shutdown("API_TIMEOUT");
      throw new Error(`API가 240초 안에 준비되지 않았습니다 (${apiUrl}).`);
    }
    started.push(`API :${options.apiPort}`);
  }

  // 2) Web
  const webUrl = webHealthUrl(options.webPort);
  if (await probeOk(webUrl)) {
    reused.push(`Web :${options.webPort}`);
  } else {
    process.stdout.write(`[web] Vite 기동 중 (포트 ${options.webPort})…\n`);
    const web = spawn("pnpm", ["dev", "--port", String(options.webPort)], {
      env: {
        ...environment,
        NEST_API_URL: `http://127.0.0.1:${options.apiPort}`,
      },
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    trackChild(web, "web");
    streamPrefixed(web, "web");
    const webReady = await waitFor("web", () => probeOk(webUrl), {
      timeoutMs: 300_000,
      intervalMs: 2500,
    });
    if (!webReady) {
      shutdown("WEB_TIMEOUT");
      throw new Error(`Web이 300초 안에 준비되지 않았습니다 (${webUrl}).`);
    }
    started.push(`Web :${options.webPort}`);
  }

  process.stdout.write(
    [
      "",
      "로컬 테스트 스택 준비 완료:",
      `  시작: ${started.length > 0 ? started.join(", ") : "(없음, 전부 재사용)"}`,
      `  재사용: ${reused.length > 0 ? reused.join(", ") : "(없음)"}`,
      `  API  http://127.0.0.1:${options.apiPort}/api/health/live`,
      `  Web  http://127.0.0.1:${options.webPort}/`,
      `  Canvas http://127.0.0.1:${options.webPort}/studio/canvas`,
      "  종료: Ctrl+C (disposable DB는 유지되어 다음 실행에 재사용, 초기화: --reset-db)",
      "",
    ].join("\n"),
  );

  await new Promise(() => undefined);
  return 0;
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`[stack] 실패: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
