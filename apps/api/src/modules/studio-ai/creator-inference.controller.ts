import {
  Body, Controller, Delete, Get, Header, Headers, HttpCode, HttpException, Injectable, Inject,
  Param, Post, Put, Req, Res, StreamableFile, UnauthorizedException,
} from "@nestjs/common";
import { getSessionAuthenticationPrincipal } from "../../session-middleware";
import type { Request, Response as ExpressResponse } from "express";

const RESOURCE = /^[a-f0-9]{32}$/;
const FILE = /^[a-z0-9_-]+\.(?:mp4|glb|png|json|srt)$/;
const MAX_JSON = 1536 * 1024;
function resource(value: string): string {
  if (!RESOURCE.test(value)) throw new HttpException("잘못된 작업 식별자입니다.", 400);
  return value;
}
function owner(request: Request): string {
  const principal = getSessionAuthenticationPrincipal(request);
  if (!principal) throw new UnauthorizedException("AI 제작실은 로그인이 필요합니다.");
  return principal.userId;
}
function part(value: string): string {
  if (!/^(?:0|[1-9]\d{0,3})$/.test(value)) throw new HttpException("잘못된 파일 조각 번호입니다.", 400);
  return value;
}
@Injectable()
export class CreatorInferenceGateway {
  private config(): { url: URL; token: string } | null {
    const base = process.env.CREATOR_INFERENCE_URL?.trim();
    const token = process.env.CREATOR_INFERENCE_TOKEN?.trim();
    if (!base || !token || token.length < 32) return null;
    try {
      const url = new URL(base);
      const internal = ["localhost", "127.0.0.1", "[::1]", "creator-inference"].includes(url.hostname);
      if ((url.protocol !== "https:" && !(url.protocol === "http:" && internal)) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
      return { url, token };
    } catch { return null; }
  }
  async request(method: string, path: string, user: string, body?: unknown, idempotency?: string, binary = false): Promise<unknown> {
    const config = this.config();
    if (!config) throw new HttpException("자체 호스팅 추론 서버가 설정되지 않았습니다.", 503);
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    if (encoded && Buffer.byteLength(encoded) > MAX_JSON) throw new HttpException("분할 업로드 크기 제한을 초과했습니다.", 413);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${config.token}`, "x-creator-owner": user };
      if (encoded !== undefined) headers["content-type"] = "application/json";
      if (idempotency) headers["idempotency-key"] = idempotency;
      const response = await fetch(new URL(path, config.url), { method, headers, body: encoded, redirect: "error", cache: "no-store", signal: controller.signal });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let bytes = 0;
      if (reader) {
        try {
          for (;;) {
            const chunk = await reader.read(); if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > (binary && response.ok ? 1024 * 1024 : MAX_JSON)) { await reader.cancel(); throw new HttpException("추론 서버 응답이 너무 큽니다.", 502); }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); }
      }
      const data = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes);
      if (!response.ok) {
        const code = [400, 401, 404, 409, 410, 413, 429, 503, 507].includes(response.status) ? response.status : 502;
        const messages: Record<number, string> = { 400: "입력 파일 또는 생성 옵션이 올바르지 않습니다.", 404: "작업이나 파일을 찾을 수 없습니다.", 409: "작업 상태가 변경됐습니다. 다시 확인해 주세요.", 410: "결과 파일이 만료되었거나 삭제되었습니다.", 413: "업로드 크기를 줄여 주세요.", 429: "작업 대기열 또는 사용량 한도에 도달했습니다.", 503: "추론 모델이 준비되지 않았습니다.", 507: "추론 서버 저장 공간이 부족합니다." };
        // Upstream auth failure is server configuration, not a reason to log the artist out.
        throw new HttpException(messages[code] ?? "추론 서버 연결을 확인해 주세요.", code === 401 ? 502 : code);
      }
      if (binary) {
        if (!response.headers.get("content-type")?.includes("application/octet-stream")) throw new HttpException("결과 파일 형식이 올바르지 않습니다.", 502);
        return data;
      }
      if (!response.headers.get("content-type")?.includes("application/json")) throw new HttpException("추론 서버 응답 형식이 올바르지 않습니다.", 502);
      return JSON.parse(data.toString("utf8")) as unknown;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException("추론 서버가 응답하지 않습니다. 작업 목록을 확인한 뒤 같은 요청으로 다시 시도하세요.", 503);
    } finally { clearTimeout(timer); }
  }
  async status(): Promise<unknown> {
    if (!this.config()) return { enabled: false, engines: {}, reason: "추론 서버가 설정되지 않았습니다." };
    return this.request("GET", "/capabilities", "capabilities");
  }
}
@Controller("studio-ai/inference")
export class CreatorInferenceController {
  constructor(@Inject(CreatorInferenceGateway) private readonly gateway: CreatorInferenceGateway) {}
  @Get("status")
  status(@Res({ passthrough: true }) response: ExpressResponse) { response.setHeader("Cache-Control", "no-store"); return this.gateway.status(); }
  @Get("jobs") @Header("Cache-Control", "no-store")
  list(@Req() request: Request) { return this.gateway.request("GET", "/jobs", owner(request)); }
  @Post("uploads")
  upload(@Req() request: Request, @Body() body: unknown) { return this.gateway.request("POST", "/uploads", owner(request), body); }
  @Put("uploads/:id/chunks/:index")
  chunk(@Req() request: Request, @Param("id") id: string, @Param("index") index: string, @Body() body: unknown) { return this.gateway.request("PUT", `/uploads/${resource(id)}/chunks/${part(index)}`, owner(request), body); }
  @Post("uploads/cleanup")
  cleanupUploads(@Req() request: Request) { return this.gateway.request("POST", "/uploads/cleanup", owner(request)); }
  @Post("uploads/:id/complete")
  complete(@Req() request: Request, @Param("id") id: string) { return this.gateway.request("POST", `/uploads/${resource(id)}/complete`, owner(request)); }
  @Delete("uploads/:id")
  deleteUpload(@Req() request: Request, @Param("id") id: string) { return this.gateway.request("DELETE", `/uploads/${resource(id)}`, owner(request)); }
  @Post("jobs") @HttpCode(202)
  submit(@Req() request: Request, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    const user = owner(request);
    if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new HttpException("중복 방지 요청 키가 필요합니다.", 400);
    return this.gateway.request("POST", "/jobs", user, body, key);
  }
  @Get("jobs/:id") @Header("Cache-Control", "no-store")
  job(@Req() request: Request, @Param("id") id: string) { return this.gateway.request("GET", `/jobs/${resource(id)}`, owner(request)); }
  @Post("jobs/:id/cancel")
  cancel(@Req() request: Request, @Param("id") id: string) { return this.gateway.request("POST", `/jobs/${resource(id)}/cancel`, owner(request)); }
  @Delete("jobs/:id")
  remove(@Req() request: Request, @Param("id") id: string) { return this.gateway.request("DELETE", `/jobs/${resource(id)}`, owner(request)); }
  @Get("jobs/:id/artifacts/:name/chunks/:index")
  async artifact(@Req() request: Request, @Param("id") id: string, @Param("name") name: string, @Param("index") index: string, @Res({ passthrough: true }) response: ExpressResponse) {
    const user = owner(request);
    if (!FILE.test(name)) throw new HttpException("잘못된 결과 파일 이름입니다.", 400);
    const bytes = await this.gateway.request("GET", `/jobs/${resource(id)}/artifacts/${name}/chunks/${part(index)}`, user, undefined, undefined, true) as Buffer;
    response.setHeader("Cache-Control", "no-store");
    return new StreamableFile(bytes, { type: "application/octet-stream", length: bytes.byteLength });
  }
}
