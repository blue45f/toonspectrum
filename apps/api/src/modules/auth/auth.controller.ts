import { BadRequestException, Body, Controller, Get, Headers, HttpException, HttpStatus, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, users } from "../../../../../lib/db";
import { hashPassword, verifyPassword } from "../../../../../lib/auth-crypto";

interface AuthPayload {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  avatar?: unknown;
}

type AuthRole = "admin" | "creator" | "operator" | "user";

const AVATARS = ["#ff5a36", "#9b7bff", "#5a8cff", "#22b8a6", "#ff6b9d", "#f4a52a"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const AuthRateLimitStore: Record<string, number[]> = {};

@Controller("auth")
export class AuthController {
  @Get("providers")
  getProviders() {
    return {};
  }

  @Post("signup")
  async signup(@Body() body: AuthPayload, @Req() req: Request) {
    enforceRateLimit(`signup:${clientIp(req)}`, 5, 10 * 60_000);

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim() || email.split("@")[0];
    const avatar = AVATARS.includes(String(body.avatar)) ? String(body.avatar) : AVATARS[0];

    if (!EMAIL_RE.test(email)) throw new BadRequestException({ error: "이메일 형식이 올바르지 않아요." });
    if (password.length < 6) throw new BadRequestException({ error: "비밀번호는 6자 이상이어야 해요." });

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      throw new HttpException({ error: "이미 가입된 이메일이에요." }, HttpStatus.CONFLICT);
    }

    await db.insert(users).values({ email, name, avatar, passwordHash: hashPassword(password) });
    return { ok: true };
  }

  @Post("login")
  async login(@Body() body: AuthPayload, @Headers("x-forwarded-for") forwardedFor: string | undefined, @Req() req: Request) {
    enforceRateLimit(`login:${forwardedFor?.split(",")[0]?.trim() || clientIp(req)}`, 10, 10 * 60_000);

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!email || !password) throw new BadRequestException({ error: "이메일 또는 비밀번호를 확인해 주세요." });

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpException({ error: "이메일 또는 비밀번호를 확인해 주세요." }, HttpStatus.UNAUTHORIZED);
    }

    return {
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: normalizeRole(user.role),
      },
    };
  }
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").toLowerCase().trim();
}

function normalizeRole(value: string | null | undefined): AuthRole {
  const role = String(value ?? "").toLowerCase();
  if (role === "admin" || role === "creator" || role === "operator") return role;
  return "user";
}

function clientIp(req: Request) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (AuthRateLimitStore[key] ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    AuthRateLimitStore[key] = recent;
    throw new HttpException({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, HttpStatus.TOO_MANY_REQUESTS);
  }
  recent.push(now);
  AuthRateLimitStore[key] = recent;
}
