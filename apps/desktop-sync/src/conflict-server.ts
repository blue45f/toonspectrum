import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";

import {
  applyDesktopSyncConflictDecisions,
  buildDesktopSyncConflictReport,
  DesktopSyncConflictResolutionError,
} from "./conflict-resolution.js";
import { resolveSyncPath } from "./path-policy.js";
import { sha256File } from "./scanner.js";

import type {
  DesktopSyncConflictDecision,
  DesktopSyncConflictReport,
  DesktopSyncConflictResolutionResult,
} from "./conflict-resolution.js";
import type {
  DesktopSyncCycleOptions,
  DesktopSyncRemote,
} from "./runtime.js";

const LOOPBACK_HOST = "127.0.0.1";
const MAXIMUM_REQUEST_BYTES = 64 * 1024;
const MAXIMUM_PREVIEW_BYTES = 25 * 1024 * 1024;
const PREVIEW_MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
});

const CONFLICT_RESOLVER_CSS = `
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090d18;color:#f6f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0,#1c2c58 0,transparent 34rem),linear-gradient(145deg,#070a12,#111827)}button,input{font:inherit}.shell{width:min(1180px,calc(100% - 2rem));margin:0 auto;padding:2rem 0 4rem}.hero{display:flex;gap:1rem;align-items:flex-start;justify-content:space-between;margin-bottom:1.25rem}.eyebrow{margin:0 0 .45rem;color:#91a9ff;font-weight:800;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase}.hero h1{margin:0;font-size:clamp(1.55rem,4vw,2.5rem)}.hero p{max-width:50rem;color:#aeb8cf;line-height:1.65}.badge{white-space:nowrap;border:1px solid #435584;border-radius:999px;padding:.55rem .8rem;background:#111a31;color:#c8d4ff;font-weight:750}.notice,.conflict,.result{border:1px solid #263455;border-radius:1rem;background:rgba(13,20,38,.9);box-shadow:0 1.2rem 3rem rgba(0,0,0,.22)}.notice{padding:1rem 1.1rem;margin-bottom:1rem;color:#bac5dc}.conflict{padding:1rem;margin:1rem 0}.conflict-head{display:flex;gap:.75rem;align-items:start;justify-content:space-between}.path{font-weight:850;overflow-wrap:anywhere}.reason{margin-top:.25rem;color:#95a3bf;font-size:.85rem}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;margin-top:1rem}.side{border:1px solid #2b3b60;border-radius:.85rem;padding:.9rem;background:#0b1224}.side h3{margin:0 0 .6rem;font-size:.9rem}.meta{display:grid;grid-template-columns:max-content 1fr;gap:.35rem .65rem;margin:0;font-size:.8rem}.meta dt{color:#8290aa}.meta dd{margin:0;text-align:right;overflow-wrap:anywhere}.preview{width:100%;max-height:18rem;object-fit:contain;margin-top:.8rem;border-radius:.7rem;background:#05070d}.preview-button{margin-top:.75rem;width:100%;min-height:2.55rem;border:1px solid #425785;border-radius:.65rem;background:#17223c;color:#e4eaff;font-weight:750;cursor:pointer}.choices{display:grid;gap:.55rem;margin-top:1rem}.choice{display:flex;gap:.7rem;align-items:flex-start;border:1px solid #2d3b5c;border-radius:.75rem;padding:.75rem;cursor:pointer;background:#0a1020}.choice:has(input:checked){border-color:#7d9cff;background:#15234b}.choice strong{display:block}.choice span span{display:block;margin-top:.18rem;color:#95a3bf;font-size:.78rem;line-height:1.45}.footer{position:sticky;bottom:0;margin-top:1rem;padding:1rem;border:1px solid #33446d;border-radius:1rem;background:rgba(9,13,24,.96);backdrop-filter:blur(16px)}.confirm{display:flex;gap:.65rem;align-items:flex-start;color:#cbd5e9;line-height:1.5}.apply{margin-top:.85rem;width:100%;min-height:3rem;border:0;border-radius:.8rem;background:linear-gradient(135deg,#7895ff,#9b7cff);color:#090d18;font-weight:900;cursor:pointer}.apply:disabled{cursor:not-allowed;filter:grayscale(.6);opacity:.55}.status{min-height:1.5rem;margin:.65rem 0 0;color:#aeb8cf}.status.error{color:#ff9eaa}.result{padding:1rem;margin-top:1rem}.hidden{display:none}@media(max-width:760px){.grid{grid-template-columns:1fr}.hero{display:block}.badge{display:inline-block;margin-top:.5rem}.shell{width:min(100% - 1rem,1180px);padding-top:1rem}}
`;

const CONFLICT_RESOLVER_SCRIPT = `
const fragment=new URLSearchParams(location.hash.slice(1));const token=fragment.get("token")||"";history.replaceState(null,"",location.pathname);const root=document.querySelector("#conflicts");const statusNode=document.querySelector("#status");const applyButton=document.querySelector("#apply");const confirmNode=document.querySelector("#confirm");let report=null;const labels={"use-local":["로컬 버전 사용","클라우드의 같은 경로를 백업한 뒤 로컬 버전으로 교체합니다."],"use-remote":["클라우드 버전 사용","로컬의 같은 경로를 백업한 뒤 클라우드 버전으로 교체합니다."],"keep-both-local-primary":["둘 다 보관 · 로컬을 원본으로","클라우드 버전은 충돌 사본으로 보존하고 원래 경로는 로컬 버전을 사용합니다."],"keep-both-remote-primary":["둘 다 보관 · 클라우드를 원본으로","로컬 버전은 충돌 사본으로 보존하고 원래 경로는 클라우드 버전을 사용합니다."]};function headers(extra={}){return{"X-ToonStudio-Token":token,...extra}}function shortHash(value){return value?value.slice(0,12)+"…":"—"}function bytes(value){if(value===null)return"—";const units=["B","KiB","MiB","GiB"];let size=value,index=0;while(size>=1024&&index<units.length-1){size/=1024;index++}return size.toFixed(index?1:0)+" "+units[index]}function sideCard(conflict,side){const value=conflict[side];const section=document.createElement("section");section.className="side";section.innerHTML='<h3>'+(side==="local"?"이 기기":"클라우드")+'</h3><dl class="meta"><dt>상태</dt><dd>'+(value.exists?"파일 있음":"삭제됨")+'</dd><dt>크기</dt><dd>'+bytes(value.size)+'</dd><dt>해시</dt><dd title="'+escapeHtml(value.sha256||"")+'">'+escapeHtml(shortHash(value.sha256))+'</dd><dt>버전</dt><dd>'+(value.version?escapeHtml(shortHash(value.version)):"—")+'</dd></dl>';if(value.exists&&/[.](png|jpe?g|webp|gif)$/i.test(conflict.relativePath)){const button=document.createElement("button");button.className="preview-button";button.type="button";button.textContent="미리보기 불러오기";button.addEventListener("click",async()=>{button.disabled=true;try{const response=await fetch('/api/preview?conflictId='+encodeURIComponent(conflict.id)+'&side='+side,{headers:headers()});if(!response.ok)throw new Error(await response.text());const image=document.createElement("img");image.className="preview";image.alt=(side==="local"?"로컬":"클라우드")+" 충돌 파일 미리보기";image.src=URL.createObjectURL(await response.blob());section.append(image);button.remove()}catch(error){button.disabled=false;button.textContent="미리보기 실패 · 다시 시도"}});section.append(button)}return section}function renderConflict(conflict,index){const article=document.createElement("article");article.className="conflict";const head=document.createElement("div");head.className="conflict-head";head.innerHTML='<div><div class="path">'+escapeHtml(conflict.relativePath)+'</div><div class="reason">충돌 원인: '+escapeHtml(conflict.reason)+'</div></div><span class="badge">'+(index+1)+' / '+report.conflicts.length+'</span>';article.append(head);const grid=document.createElement("div");grid.className="grid";grid.append(sideCard(conflict,"local"),sideCard(conflict,"remote"));article.append(grid);const choices=document.createElement("div");choices.className="choices";choices.setAttribute("role","radiogroup");choices.setAttribute("aria-label",conflict.relativePath+" 해결 방법");for(const value of conflict.allowedResolutions){const label=document.createElement("label");label.className="choice";const input=document.createElement("input");input.type="radio";input.name="decision-"+conflict.id;input.value=value;input.required=true;input.addEventListener("change",updateReady);const copy=document.createElement("span");copy.innerHTML='<strong>'+labels[value][0]+'</strong><span>'+labels[value][1]+'</span>';label.append(input,copy);choices.append(label)}article.append(choices);return article}function escapeHtml(value){const span=document.createElement("span");span.textContent=value;return span.innerHTML}function selectedDecisions(){return report.conflicts.map(conflict=>{const selected=document.querySelector('input[name="decision-'+CSS.escape(conflict.id)+'"]:checked');return selected?{conflictId:conflict.id,resolution:selected.value}:null}).filter(Boolean)}function updateReady(){applyButton.disabled=!(report&&selectedDecisions().length===report.conflicts.length&&confirmNode.checked)}confirmNode.addEventListener("change",updateReady);applyButton.addEventListener("click",async()=>{applyButton.disabled=true;statusNode.className="status";statusNode.textContent="양쪽 원본을 백업하고 선택한 해결 방법을 적용하는 중…";try{const response=await fetch("/api/apply",{method:"POST",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify({reportId:report.reportId,decisions:selectedDecisions()})});const body=await response.json();if(!response.ok)throw new Error(body.message||"적용 실패");root.innerHTML='<section class="result"><h2>충돌 해결 완료</h2><p>양쪽 백업과 최종 동기화를 확인했습니다.</p><dl class="meta"><dt>영수증</dt><dd>'+shortHash(body.receipt.receiptSha256)+'</dd><dt>세션</dt><dd>'+escapeHtml(body.receipt.sessionId)+'</dd></dl></section>';document.querySelector("#footer").classList.add("hidden");statusNode.textContent="이 창을 닫아도 됩니다."}catch(error){statusNode.className="status error";statusNode.textContent=error instanceof Error?error.message:String(error);updateReady()}});async function load(){if(!token){statusNode.className="status error";statusNode.textContent="보안 토큰이 없어 해결 화면을 열 수 없습니다.";return}try{const response=await fetch("/api/report",{headers:headers()});if(!response.ok)throw new Error(await response.text());report=await response.json();document.querySelector("#count").textContent=String(report.conflicts.length);if(report.conflicts.length===0){root.innerHTML='<section class="result"><h2>충돌 없음</h2><p>현재 해결할 충돌이 없습니다.</p></section>';document.querySelector("#footer").classList.add("hidden");return}report.conflicts.forEach((conflict,index)=>root.append(renderConflict(conflict,index)));statusNode.textContent="모든 파일의 해결 방법을 선택하세요.";updateReady()}catch(error){statusNode.className="status error";statusNode.textContent=error instanceof Error?error.message:String(error)}}load();
`;

function contentSecurityPolicy(): string {
  const scriptHash = createHash("sha256")
    .update(CONFLICT_RESOLVER_SCRIPT)
    .digest("base64");
  const styleHash = createHash("sha256")
    .update(CONFLICT_RESOLVER_CSS)
    .digest("base64");
  return [
    "default-src 'none'",
    `script-src 'sha256-${scriptHash}'`,
    `style-src 'sha256-${styleHash}'`,
    "connect-src 'self'",
    "img-src blob: data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function resolverHtml(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>ToonStudio 동기화 충돌 해결</title><style>${CONFLICT_RESOLVER_CSS}</style></head><body><main class="shell"><header class="hero"><div><p class="eyebrow">ToonStudio Desktop Sync</p><h1>파일 충돌 해결</h1><p>로컬과 클라우드가 각각 바뀐 파일을 비교합니다. 적용하기 전에 덮어쓰거나 삭제될 원본을 이 기기의 보호 폴더에 복사하고 SHA-256으로 검증합니다.</p></div><span class="badge"><span id="count">…</span>개 충돌</span></header><section class="notice" role="note">브라우저에는 파일 내용이나 OAuth 토큰을 전송하지 않습니다. 지원되는 래스터 이미지만 사용자가 요청할 때 로컬 루프백 연결로 미리봅니다.</section><div id="conflicts" aria-live="polite"></div><section id="footer" class="footer"><label class="confirm"><input id="confirm" type="checkbox"><span>선택한 결과와 자동 백업 경로를 확인했습니다. 적용 중 파일이 변경되면 작업을 중단하고 다시 비교합니다.</span></label><button id="apply" class="apply" type="button" disabled>백업 후 충돌 해결 적용</button><p id="status" class="status" role="status" aria-live="polite">충돌 정보를 불러오는 중…</p></section></main><script>${CONFLICT_RESOLVER_SCRIPT}</script></body></html>`;
}

function securityHeaders(contentType: string): Record<string, string> {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": contentSecurityPolicy(),
    "Content-Type": contentType,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof DesktopSyncConflictResolutionError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof DesktopConflictServerError) return error.code;
  return "conflict resolution failed";
}

function jsonResponse(
  response: import("node:http").ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, securityHeaders("application/json; charset=utf-8"));
  response.end(`${JSON.stringify(value)}\n`);
}

function textResponse(
  response: import("node:http").ServerResponse,
  status: number,
  value: string,
): void {
  response.writeHead(status, securityHeaders("text/plain; charset=utf-8"));
  response.end(value);
}

async function readJsonBody(
  request: import("node:http").IncomingMessage,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAXIMUM_REQUEST_BYTES) {
      throw new DesktopConflictServerError("request-too-large");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw new DesktopConflictServerError("invalid-json", { cause: error });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApplyBody(
  value: unknown,
  report: DesktopSyncConflictReport,
): readonly DesktopSyncConflictDecision[] {
  if (!isRecord(value) || value.reportId !== report.reportId || !Array.isArray(value.decisions)) {
    throw new DesktopConflictServerError("invalid-request");
  }
  return value.decisions.map((candidate) => {
    if (
      !isRecord(candidate)
      || typeof candidate.conflictId !== "string"
      || typeof candidate.resolution !== "string"
    ) {
      throw new DesktopConflictServerError("invalid-request");
    }
    return {
      conflictId: candidate.conflictId,
      resolution: candidate.resolution,
    } as DesktopSyncConflictDecision;
  });
}

function timingSafeTokenMatch(expected: string, actual: string | undefined): boolean {
  if (!actual) return false;
  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(actual).digest();
  return expectedDigest.equals(actualDigest);
}

function findConflict(
  report: DesktopSyncConflictReport,
  id: string | null,
) {
  return report.conflicts.find((conflict) => conflict.id === id) ?? null;
}

async function previewBytes(input: {
  readonly root: string;
  readonly remote: DesktopSyncRemote;
  readonly report: DesktopSyncConflictReport;
  readonly conflictId: string | null;
  readonly side: string | null;
  readonly previewDirectory: string;
}): Promise<{ readonly bytes: Uint8Array; readonly mime: string }> {
  const conflict = findConflict(input.report, input.conflictId);
  if (!conflict || (input.side !== "local" && input.side !== "remote")) {
    throw new DesktopConflictServerError("preview-not-found");
  }
  const extension = extname(conflict.relativePath).toLowerCase();
  const mime = PREVIEW_MIME_TYPES[extension];
  if (!mime) throw new DesktopConflictServerError("preview-unsupported");
  const selected = conflict[input.side];
  if (!selected.exists || selected.sha256 === null || selected.size === null) {
    throw new DesktopConflictServerError("preview-not-found");
  }
  if (selected.size > MAXIMUM_PREVIEW_BYTES) {
    throw new DesktopConflictServerError("preview-too-large");
  }

  if (input.side === "local") {
    const absolutePath = resolveSyncPath(input.root, conflict.relativePath);
    const hash = await sha256File(absolutePath);
    const bytes = new Uint8Array(await readFile(absolutePath));
    if (hash !== selected.sha256 || bytes.byteLength !== selected.size) {
      throw new DesktopConflictServerError("preview-stale");
    }
    return { bytes, mime };
  }

  const remoteSnapshot = {
    relativePath: conflict.relativePath,
    sha256: selected.sha256,
    size: selected.size,
    version: selected.version ?? "",
  };
  if (!remoteSnapshot.version) throw new DesktopConflictServerError("preview-stale");
  await mkdir(input.previewDirectory, { recursive: true, mode: 0o700 });
  const temporary = join(
    input.previewDirectory,
    `${conflict.id}${extension}.${randomUUID()}.preview`,
  );
  try {
    await input.remote.downloadFile({
      remote: remoteSnapshot,
      temporaryAbsolutePath: temporary,
    });
    const bytes = new Uint8Array(await readFile(temporary));
    const hash = await sha256File(temporary);
    if (
      bytes.byteLength !== remoteSnapshot.size
      || hash !== remoteSnapshot.sha256
    ) {
      throw new DesktopConflictServerError("preview-stale");
    }
    return { bytes, mime };
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export class DesktopConflictServerError extends Error {
  constructor(
    readonly code:
      | "invalid-json"
      | "invalid-request"
      | "preview-not-found"
      | "preview-stale"
      | "preview-too-large"
      | "preview-unsupported"
      | "request-too-large",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "DesktopConflictServerError";
  }
}

export interface DesktopSyncConflictServer {
  readonly origin: string;
  readonly url: string;
  readonly token: string;
  readonly report: DesktopSyncConflictReport;
  readonly completion: Promise<DesktopSyncConflictResolutionResult | null>;
  close(): Promise<void>;
}

export interface StartDesktopSyncConflictServerOptions extends DesktopSyncCycleOptions {
  readonly remoteLabel: string;
  readonly port?: number;
  readonly token?: string;
}

export async function startDesktopSyncConflictServer(
  root: string,
  remote: DesktopSyncRemote,
  options: StartDesktopSyncConflictServerOptions,
): Promise<DesktopSyncConflictServer> {
  const report = await buildDesktopSyncConflictReport(root, remote, options);
  const token = options.token ?? randomBytes(32).toString("base64url");
  if (token.length < 32) throw new TypeError("conflict server token is too short");
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("conflict server port is invalid");
  }

  let settleCompletion!: (
    value: DesktopSyncConflictResolutionResult | null,
  ) => void;
  const completion = new Promise<DesktopSyncConflictResolutionResult | null>((resolve) => {
    settleCompletion = resolve;
  });
  let settled = false;
  let origin = "";
  const previewDirectory = join(
    root,
    ".toonstudio",
    "conflicts",
    "previews",
    randomUUID(),
  );

  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host;
      if (!host || host !== new URL(origin).host) {
        textResponse(response, 421, "invalid host");
        return;
      }
      const url = new URL(request.url ?? "/", origin);
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, securityHeaders("text/html; charset=utf-8"));
        response.end(resolverHtml());
        return;
      }

      const tokenHeader = request.headers["x-toonstudio-token"];
      const requestToken = typeof tokenHeader === "string" ? tokenHeader : undefined;
      if (!timingSafeTokenMatch(token, requestToken)) {
        textResponse(response, 401, "unauthorized");
        return;
      }
      if (
        request.method === "POST"
        && request.headers.origin !== origin
      ) {
        textResponse(response, 403, "invalid origin");
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/report") {
        jsonResponse(response, 200, report);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/preview") {
        try {
          const preview = await previewBytes({
            root,
            remote,
            report,
            conflictId: url.searchParams.get("conflictId"),
            side: url.searchParams.get("side"),
            previewDirectory,
          });
          response.writeHead(200, {
            ...securityHeaders(preview.mime),
            "Content-Length": String(preview.bytes.byteLength),
          });
          response.end(preview.bytes);
        } catch (error) {
          if (error instanceof DesktopConflictServerError) {
            const status = error.code === "preview-unsupported"
              ? 415
              : error.code === "preview-too-large"
                ? 413
                : error.code === "preview-stale"
                  ? 409
                  : 404;
            textResponse(response, status, error.code);
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/apply") {
        if (!request.headers["content-type"]?.startsWith("application/json")) {
          textResponse(response, 415, "application/json required");
          return;
        }
        try {
          const decisions = parseApplyBody(await readJsonBody(request), report);
          const result = await applyDesktopSyncConflictDecisions(
            root,
            remote,
            report,
            decisions,
            options,
          );
          jsonResponse(response, 200, { receipt: result.receipt });
          if (!settled) {
            settled = true;
            settleCompletion(result);
          }
          setTimeout(() => server.close(), 75).unref?.();
        } catch (error) {
          const status = error instanceof DesktopConflictServerError
            && error.code === "request-too-large"
            ? 413
            : error instanceof DesktopConflictServerError
              ? 400
              : error instanceof DesktopSyncConflictResolutionError
                && error.code === "stale-report"
                ? 409
                : 422;
          jsonResponse(response, status, { message: safeErrorMessage(error) });
        }
        return;
      }
      textResponse(response, 404, "not found");
    } catch (error) {
      jsonResponse(response, 500, { message: safeErrorMessage(error) });
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("conflict server did not expose a loopback port");
  }
  origin = `http://${LOOPBACK_HOST}:${address.port}`;
  const close = async (): Promise<void> => {
    if (!settled) {
      settled = true;
      settleCompletion(null);
    }
    await rm(previewDirectory, { recursive: true, force: true }).catch(() => undefined);
    if (!server.listening) return;
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  };
  server.once("close", () => {
    void rm(previewDirectory, { recursive: true, force: true });
    if (!settled) {
      settled = true;
      settleCompletion(null);
    }
  });

  return Object.freeze({
    origin,
    url: `${origin}/#token=${encodeURIComponent(token)}`,
    token,
    report,
    completion,
    close,
  });
}

export async function openDesktopConflictResolverBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "http:"
    || parsed.hostname !== LOOPBACK_HOST
    || parsed.username
    || parsed.password
  ) {
    throw new TypeError("conflict resolver URL must use the local loopback server");
  }
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "rundll32"
      : "xdg-open";
  const arguments_ = process.platform === "win32"
    ? ["url.dll,FileProtocolHandler", parsed.toString()]
    : [parsed.toString()];
  await new Promise<void>((resolveOpen, rejectOpen) => {
    const child = spawn(command, arguments_, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", rejectOpen);
    child.once("spawn", () => {
      child.unref();
      resolveOpen();
    });
  });
}
