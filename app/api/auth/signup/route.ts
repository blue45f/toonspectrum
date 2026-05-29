import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { hashPassword } from "@/lib/auth-crypto";

const AVATARS = ["#ff5a36", "#9b7bff", "#5a8cff", "#22b8a6", "#ff6b9d", "#f4a52a"];

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; name?: string; avatar?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || email.split("@")[0];
  const avatar = AVATARS.includes(String(body.avatar)) ? String(body.avatar) : AVATARS[0];

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "이메일 형식이 올바르지 않아요." }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "비밀번호는 6자 이상이어야 해요." }, { status: 400 });

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return NextResponse.json({ error: "이미 가입된 이메일이에요." }, { status: 409 });

  await db.insert(users).values({ email, name, avatar, passwordHash: hashPassword(password) });
  return NextResponse.json({ ok: true });
}
