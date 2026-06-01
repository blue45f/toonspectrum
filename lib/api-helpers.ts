import { auth } from "../auth";

export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export function unauthorized() {
  return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
}

// DB는 평점을 ×10 정수로 저장 (0.5~5 → 5~50)
export const toDb = (v: number) => Math.round(v * 10);
export const fromDb = (v: number) => v / 10;
