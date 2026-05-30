"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { X, LogIn, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const AVATARS = ["#ff5a36", "#9b7bff", "#5a8cff", "#22b8a6", "#ff6b9d", "#f4a52a"];

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[1]);
  const [oauth, setOauth] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((p) => setOauth(Object.keys(p).filter((k) => k === "kakao" || k === "google")))
      .catch(() => {});
  }, []);

  // Escape 로 닫기 (키보드 접근성)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const r = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, avatar }),
        });
        if (!r.ok) {
          setErr((await r.json()).error ?? "가입 실패");
          setBusy(false);
          return;
        }
      }
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setErr("이메일 또는 비밀번호를 확인해 주세요.");
        setBusy(false);
        return;
      }
      onClose();
    } catch {
      setErr("문제가 발생했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]">
      <button aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "login" ? "로그인" : "회원가입"}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-black/50"
        style={{ animation: "fade-up 0.22s var(--ease-out-expo)" }}
      >
        <button onClick={onClose} className="absolute right-3 top-3 text-fg-3 hover:text-fg">
          <X size={18} />
        </button>
        <div className="p-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-display text-lg font-bold tracking-tight">WEBDEX</span>
          </div>
          <p className="mb-5 text-sm text-fg-3">
            {mode === "login" ? "다시 오셨네요. 로그인하세요." : "계정을 만들고 취향을 기록하세요."}
          </p>

          <div className="mb-4 inline-flex rounded-lg border border-line bg-card p-0.5">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setErr("");
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === m ? "bg-raised text-fg" : "text-fg-3 hover:text-fg-2"
                )}
              >
                {m === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            {mode === "signup" && (
              <>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="닉네임"
                  aria-label="닉네임"
                  className="h-11 rounded-xl border border-line bg-canvas px-3.5 text-sm outline-none focus:border-accent/60"
                />
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs text-fg-3">아바타</span>
                  {AVATARS.map((c, i) => (
                    <button
                      key={c}
                      onClick={() => setAvatar(c)}
                      aria-label={`아바타 색상 ${i + 1}`}
                      aria-pressed={avatar === c}
                      className={cn("size-6 rounded-full ring-2 transition", avatar === c ? "ring-accent" : "ring-transparent")}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </>
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              aria-label="이메일"
              autoFocus
              className="h-11 rounded-xl border border-line bg-canvas px-3.5 text-sm outline-none focus:border-accent/60"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="비밀번호 (6자 이상)"
              aria-label="비밀번호"
              className="h-11 rounded-xl border border-line bg-canvas px-3.5 text-sm outline-none focus:border-accent/60"
            />
            {err && <p className="text-xs text-bad">{err}</p>}
            <button
              onClick={submit}
              disabled={busy}
              className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-on-accent transition-colors hover:bg-accent-2 disabled:opacity-50"
            >
              {mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
              {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하고 시작"}
            </button>
          </div>

          {oauth.length > 0 && (
            <>
              <div className="my-4 flex items-center gap-3 text-[0.7rem] text-fg-3">
                <span className="h-px flex-1 bg-line" />또는<span className="h-px flex-1 bg-line" />
              </div>
              <div className="flex flex-col gap-2">
                {oauth.includes("kakao") && (
                  <button
                    onClick={() => signIn("kakao")}
                    className="h-11 rounded-xl bg-[#FEE500] text-sm font-semibold text-[#191600] transition-opacity hover:opacity-90"
                  >
                    카카오로 계속하기
                  </button>
                )}
                {oauth.includes("google") && (
                  <button
                    onClick={() => signIn("google")}
                    className="h-11 rounded-xl border border-line bg-card text-sm font-semibold text-fg transition-colors hover:bg-raised"
                  >
                    Google로 계속하기
                  </button>
                )}
              </div>
            </>
          )}
          <p className="mt-4 text-[0.7rem] leading-relaxed text-fg-3">
            계정을 만들면 평점·리뷰·서재가 DB에 저장되어 어느 기기에서나 이어집니다. 비로그인 시 이 브라우저에만
            저장돼요.
          </p>
        </div>
      </div>
    </div>
  );
}
