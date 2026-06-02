"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "@/src/compat/auth-session";
import { X, LogIn, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const AVATARS = ["#ff5a36", "#9b7bff", "#5a8cff", "#22b8a6", "#ff6b9d", "#f4a52a"];

const authSchema = z.object({
  email: z.string().trim().min(1, "이메일을 입력해 주세요.").email("이메일 형식을 확인해 주세요."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 해요."),
  name: z.string(),
  avatar: z.string(),
});

type AuthFormValues = z.infer<typeof authSchema>;

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [oauth, setOauth] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: "", password: "", name: "", avatar: AVATARS[1] },
  });

  // RHF의 register ref 와 포커스용 emailRef 를 함께 연결
  const emailField = register("email");

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

  // 포커스 트랩(Tab 순환을 다이얼로그 내부로 가둠) + 닫힐 때 호출 트리거로 포커스 복원.
  // prevActive 캡처는 포커스 이동보다 먼저여야 트리거(예: '로그인' 버튼)가 잡힌다.
  // (autoFocus는 commit 단계라 effect보다 먼저 실행돼 트리거 대신 입력을 캡처하므로 사용하지 않음)
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    emailRef.current?.focus(); // 열릴 때 이메일로 포커스 이동
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      // 포커스가 패널 밖이면 무조건 첫 요소로 회수 (배경으로 탭 이탈 방지)
      if (!panelRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevActive?.focus?.();
    };
  }, []);

  const submit = handleSubmit(async ({ email, password, name, avatar }) => {
    setErr("");
    try {
      if (mode === "signup") {
        const r = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, avatar }),
        });
        if (!r.ok) {
          setErr((await r.json()).error ?? "가입 실패");
          return;
        }
      }
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setErr("이메일 또는 비밀번호를 확인해 주세요.");
        return;
      }
      onClose();
    } catch {
      setErr("문제가 발생했어요. 다시 시도해 주세요.");
    }
  });

  const fieldError = errors.email?.message ?? errors.password?.message ?? null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]">
      <button
        aria-label="닫기"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
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

          <form className="flex flex-col gap-2.5" onSubmit={submit}>
            {mode === "signup" && (
              <>
                <input
                  {...register("name")}
                  placeholder="닉네임"
                  aria-label="닉네임"
                  className="h-11 rounded-xl border border-line bg-canvas px-3.5 text-sm outline-none focus:border-accent/60"
                />
                <Controller
                  control={control}
                  name="avatar"
                  render={({ field }) => (
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs text-fg-3">아바타</span>
                      {AVATARS.map((c, i) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => field.onChange(c)}
                          aria-label={`아바타 색상 ${i + 1}`}
                          aria-pressed={field.value === c}
                          className={cn("size-6 rounded-full ring-2 transition", field.value === c ? "ring-accent" : "ring-transparent")}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  )}
                />
              </>
            )}
            <input
              {...emailField}
              ref={(el) => {
                emailField.ref(el);
                emailRef.current = el;
              }}
              type="email"
              placeholder="이메일"
              aria-label="이메일"
              className="h-11 rounded-xl border border-line bg-canvas px-3.5 text-sm outline-none focus:border-accent/60"
            />
            <input
              {...register("password")}
              type="password"
              placeholder="비밀번호 (6자 이상)"
              aria-label="비밀번호"
              className="h-11 rounded-xl border border-line bg-canvas px-3.5 text-sm outline-none focus:border-accent/60"
            />
            {(fieldError || err) && <p className="text-xs text-bad">{fieldError ?? err}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-on-accent transition-colors hover:bg-accent-2 disabled:opacity-50"
            >
              {mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
              {isSubmitting ? "처리 중…" : mode === "login" ? "로그인" : "가입하고 시작"}
            </button>
          </form>

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
