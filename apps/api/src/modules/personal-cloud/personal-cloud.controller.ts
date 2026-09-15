import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";

import { personalCloudOAuthCookieName } from "./personal-cloud.config";
import { PersonalCloudService, PersonalCloudServiceError } from "./personal-cloud.service";
import { isPersonalCloudProvider } from "./personal-cloud.types";

import type { Request, Response } from "express";

interface StartBody {
  readonly returnTo?: unknown;
}

function requireUserId(value: string | undefined): string {
  if (!value) throw new UnauthorizedException("로그인이 필요해요.");
  return value;
}

function cookieValue(request: Request, name: string): string {
  const header = request.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function webBase(): string {
  const raw = process.env.WEB_APP_BASE_URL?.trim() || "http://localhost:5173";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:5173";
  }
}

function callbackUrl(input: {
  readonly returnTo?: string;
  readonly provider?: string;
  readonly status: "connected" | "error";
  readonly error?: string;
}): string {
  const path = input.returnTo?.startsWith("/studio") ? input.returnTo : "/studio?view=storage";
  const url = new URL(path, webBase());
  url.searchParams.set("cloud", input.status);
  if (input.provider) url.searchParams.set("provider", input.provider);
  if (input.error) url.searchParams.set("cloudError", input.error.slice(0, 80));
  return url.toString();
}

@Controller("personal-cloud")
export class PersonalCloudController {
  private readonly logger = new Logger(PersonalCloudController.name);

  constructor(private readonly service: PersonalCloudService) {}

  private boundary(error: unknown): never {
    if (error instanceof PersonalCloudServiceError) {
      throw new HttpException({ error: error.message, code: error.code }, error.status);
    }
    this.logger.error("Personal cloud request failed", error instanceof Error ? error.stack : undefined);
    throw new HttpException({ error: "개인 저장소 요청을 완료하지 못했습니다." }, 502);
  }

  @Get("status")
  @Header("Cache-Control", "private, no-store, max-age=0")
  status(@Headers("x-user-id") userId: string | undefined) {
    return this.service.status(requireUserId(userId));
  }

  @Post("oauth/:provider/start")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  start(
    @Headers("x-user-id") userId: string | undefined,
    @Param("provider") provider: string,
    @Body() body: StartBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!isPersonalCloudProvider(provider)) throw new BadRequestException("지원하지 않는 개인 저장소예요.");
    try {
      const result = this.service.startConnection({
        userId: requireUserId(userId),
        provider,
        returnTo: typeof body?.returnTo === "string" ? body.returnTo : undefined,
      });
      response.cookie(personalCloudOAuthCookieName(), result.cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/personal-cloud/oauth",
        maxAge: result.maxAgeMs,
      });
      return { authorizeUrl: result.authorizeUrl, expiresInMs: result.maxAgeMs };
    } catch (error) {
      return this.boundary(error);
    }
  }

  @Get("oauth/:provider/callback")
  async callback(
    @Param("provider") provider: string,
    @Query("code") rawCode: unknown,
    @Query("state") rawState: unknown,
    @Query("error") rawProviderError: unknown,
    @Headers("x-user-id") sessionUserId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const cookieName = personalCloudOAuthCookieName();
    const clear = () => response.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/personal-cloud/oauth",
    });
    if (!isPersonalCloudProvider(provider)) {
      clear();
      return response.redirect(callbackUrl({ status: "error", error: "unsupported-provider" }));
    }
    const malformedQuery = [rawCode, rawState, rawProviderError]
      .some((value) => value !== undefined && typeof value !== "string");
    if (malformedQuery) {
      clear();
      return response.redirect(callbackUrl({ status: "error", provider, error: "invalid-query" }));
    }
    const code = typeof rawCode === "string" ? rawCode : undefined;
    const state = typeof rawState === "string" ? rawState : undefined;
    const providerError = typeof rawProviderError === "string" ? rawProviderError : undefined;
    if (providerError || !code || !state) {
      clear();
      return response.redirect(callbackUrl({
        status: "error",
        provider,
        error: providerError || "missing-code",
      }));
    }
    try {
      const result = await this.service.completeConnection({
        provider,
        code,
        state,
        cookieValue: cookieValue(request, cookieName),
        sessionUserId,
      });
      clear();
      return response.redirect(callbackUrl({
        status: "connected",
        provider,
        returnTo: result.returnTo,
      }));
    } catch (error) {
      clear();
      const codeValue = error instanceof PersonalCloudServiceError ? error.code : "provider-failure";
      this.logger.warn(`Personal cloud callback failed for ${provider}: ${codeValue}`);
      return response.redirect(callbackUrl({ status: "error", provider, error: codeValue }));
    }
  }

  @Post(":provider/access-token")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async accessToken(
    @Headers("x-user-id") userId: string | undefined,
    @Param("provider") provider: string,
  ) {
    if (!isPersonalCloudProvider(provider)) throw new BadRequestException("지원하지 않는 개인 저장소예요.");
    try {
      return await this.service.accessToken(requireUserId(userId), provider);
    } catch (error) {
      return this.boundary(error);
    }
  }

  @Delete(":provider")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async disconnect(
    @Headers("x-user-id") userId: string | undefined,
    @Param("provider") provider: string,
  ) {
    if (!isPersonalCloudProvider(provider)) throw new BadRequestException("지원하지 않는 개인 저장소예요.");
    try {
      return { disconnected: await this.service.disconnect(requireUserId(userId), provider) };
    } catch (error) {
      return this.boundary(error);
    }
  }
}
