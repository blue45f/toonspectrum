// 경량 인메모리 슬라이딩 윈도 레이트리밋 — 인증 엔드포인트 남용(열거·크리덴셜 스터핑) 완화.
// 한계: 단일 인스턴스 기준 베이스라인. 서버리스 멀티 인스턴스에선 인스턴스별로 카운트되므로
// 강건한 보호가 필요하면 공유 스토어(KV/Upstash 등)로 교체해야 한다.
const hits = new Map<string, number[]>();

// true=허용, false=한도 초과(차단)
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // 맵이 커지면 만료된 키 정리
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

// 요청에서 클라이언트 IP 추정 (프록시 헤더 우선)
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
