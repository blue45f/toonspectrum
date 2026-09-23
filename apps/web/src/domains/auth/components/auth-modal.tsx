import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Code2,
  Eye,
  EyeOff,
  ImagePlus,
  LockKeyhole,
  LogIn,
  Mail,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";

import { ToonSpectrumMark } from "@/shared/components/visual-marks";

import {
  parseAuthProviderDiscovery,
  type AuthProviderDiscovery,
} from "./auth-provider-discovery";
import { GoogleIdentityButton } from "./google-identity-button";

import {
  AVATAR_PRESETS,
  MAX_AVATAR_IMAGE_BYTES,
  pickAvatarPreset,
  resolveSignupAvatar,
  resolveSignupAvatarImage,
} from "@/shared/lib/avatar";
import { withCsrfProtection } from "@/shared/lib/csrf";
import { cn } from "@/shared/lib/utils";
import { signIn } from "@/compat/auth-session-store";
import { apiPath } from "@/infrastructure/api";

// 실제 OAuth 미설정 시 데모 폴백임을 버튼에 명확히 표시(정직성).
function DemoTag({ dark }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide",
        dark
          ? "bg-[oklch(0.2_0.02_60/0.16)] text-on-accent"
          : "border border-line bg-raised text-fg-3"
      )}
    >
      {translateCurrentStaticSourceText(
        "domains.auth.components.auth.modal",
        "ko",
        "데모"
      )}
    </span>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const authSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "이메일을 입력해 주세요.")
    .email("이메일 형식을 확인해 주세요."),
  password: z
    .string()
    .min(1, "비밀번호를 입력해 주세요.")
    .max(128, "비밀번호가 너무 깁니다."),
  name: z.string(),
  avatar: z.string(),
  image: z.string().nullable(),
});

type AuthFormValues = z.infer<typeof authSchema>;

export function AuthModal({
  onClose,
  returnFocusRef,
  initialMode = "login",
}: {
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  initialMode?: "login" | "signup";
}) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [providers, setProviders] = useState<AuthProviderDiscovery>({});
  const [providerStatus, setProviderStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [providerAttempt, setProviderAttempt] = useState(0);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [emailAction, setEmailAction] = useState<"reset" | "resend" | null>(
    null
  );
  const [imageErr, setImageErr] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
      name: "",
      avatar: AVATAR_PRESETS[1].id,
      image: null,
    },
  });

  const [nameValue, emailValue, avatarValue, imageValue] = watch([
    "name",
    "email",
    "avatar",
    "image",
  ]);
  const selectedPreset =
    AVATAR_PRESETS.find(
      (preset) => preset.id === avatarValue || preset.color === avatarValue
    ) ?? AVATAR_PRESETS[0];
  const selectedAvatarColor = resolveSignupAvatar(avatarValue);
  const avatarInitial = (nameValue.trim() || emailValue.trim() || "W")
    .slice(0, 1)
    .toUpperCase();
  const avatarBackground = `radial-gradient(circle at 32% 24%, ${selectedPreset.accent}, transparent 35%), linear-gradient(145deg, ${selectedAvatarColor}, oklch(0.26 0.04 60))`;

  // RHF의 register ref 와 포커스용 emailRef 를 함께 연결
  const emailField = register("email");

  useEffect(() => {
    setMode(initialMode);
    setPasswordVisible(false);
  }, [initialMode]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let recoveryAvailable = false;
    const fail = () => {
      setProviders({});
      setProviderStatus("error");
      recoveryAvailable = true;
    };
    const retryAfterReturn = () => {
      if (
        disposed ||
        !recoveryAvailable ||
        document.visibilityState === "hidden"
      )
        return;
      // A focus + visibility + online burst must create only one new request.
      recoveryAvailable = false;
      setProviderAttempt((value) => value + 1);
    };
    // Bound both the response and JSON body read. Some transports can settle
    // even after abort, so every continuation also checks the request lifetime.
    const timeout = globalThis.setTimeout(() => {
      if (disposed || controller.signal.aborted) return;
      fail();
      controller.abort();
    }, 15_000);
    setProviders({});
    setProviderStatus("loading");
    fetch(apiPath("/auth/providers"), {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`provider discovery failed (${response.status})`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (disposed || controller.signal.aborted) return;
        setProviders(parseAuthProviderDiscovery(payload));
        setProviderStatus("ready");
      })
      .catch(() => {
        if (disposed || controller.signal.aborted) return;
        fail();
      })
      .finally(() => globalThis.clearTimeout(timeout));
    globalThis.addEventListener("online", retryAfterReturn);
    globalThis.addEventListener("focus", retryAfterReturn);
    document.addEventListener("visibilitychange", retryAfterReturn);
    return () => {
      disposed = true;
      globalThis.clearTimeout(timeout);
      controller.abort();
      globalThis.removeEventListener("online", retryAfterReturn);
      globalThis.removeEventListener("focus", retryAfterReturn);
      document.removeEventListener("visibilitychange", retryAfterReturn);
    };
  }, [providerAttempt]);

  // Escape 로 닫기 (키보드 접근성)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock document scrolling and hide background branches from assistive tech while open.
  useEffect(() => {
    const panel = panelRef.current;
    const overlay = panel?.parentElement;
    if (!panel || !overlay) return;
    const ownerDocument = panel.ownerDocument;
    const previousBodyOverflow = ownerDocument.body.style.overflow;
    const previousRootOverflow = ownerDocument.documentElement.style.overflow;
    const backgroundBranches = new Set<HTMLElement>();
    let activeBranch: HTMLElement = overlay;
    while (
      activeBranch.parentElement &&
      activeBranch.parentElement !== ownerDocument.body
    ) {
      const parent = activeBranch.parentElement;
      for (const sibling of parent.children) {
        if (sibling instanceof HTMLElement && sibling !== activeBranch) {
          backgroundBranches.add(sibling);
        }
      }
      activeBranch = parent;
    }
    for (const bodyChild of ownerDocument.body.children) {
      if (bodyChild instanceof HTMLElement && bodyChild !== activeBranch) {
        backgroundBranches.add(bodyChild);
      }
    }
    const snapshots = [...backgroundBranches].map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.getAttribute("inert"),
    }));
    ownerDocument.body.style.overflow = "hidden";
    ownerDocument.documentElement.style.overflow = "hidden";
    for (const snapshot of snapshots) {
      snapshot.element.setAttribute("aria-hidden", "true");
      snapshot.element.setAttribute("inert", "");
    }
    return () => {
      ownerDocument.body.style.overflow = previousBodyOverflow;
      ownerDocument.documentElement.style.overflow = previousRootOverflow;
      for (const snapshot of snapshots) {
        if (snapshot.ariaHidden === null)
          snapshot.element.removeAttribute("aria-hidden");
        else snapshot.element.setAttribute("aria-hidden", snapshot.ariaHidden);
        if (snapshot.inert === null) snapshot.element.removeAttribute("inert");
        else snapshot.element.setAttribute("inert", snapshot.inert);
      }
    };
  }, []);

  // 포커스 트랩(Tab 순환을 다이얼로그 내부로 가둠) + 닫힐 때 호출 트리거로 포커스 복원.
  // prevActive 캡처는 포커스 이동보다 먼저여야 트리거(예: '로그인' 버튼)가 잡힌다.
  // (autoFocus는 commit 단계라 effect보다 먼저 실행돼 트리거 대신 입력을 캡처하므로 사용하지 않음)
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const explicitReturnTarget = returnFocusRef?.current;
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
      if (explicitReturnTarget?.isConnected) {
        explicitReturnTarget.focus();
        return;
      }
      if (prevActive?.isConnected) prevActive.focus();
    };
  }, [returnFocusRef]);

  const submit = handleSubmit(
    async ({ email, password, name, avatar, image }) => {
      setErr("");
      setNotice("");
      try {
        if (mode === "signup") {
          if (Array.from(password).length < 15) {
            setErr("비밀번호는 15자 이상이어야 해요.");
            return;
          }
          const response = await fetch(
            apiPath("/auth/signup"),
            withCsrfProtection({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password, name, avatar, image }),
            })
          );
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
            message?: string;
          } | null;
          if (!response.ok) {
            setErr(payload?.error ?? "가입을 완료하지 못했어요.");
            return;
          }
          setMode("login");
          setValue("password", "");
          setNotice(
            payload?.message ??
              "가입 확인 메일을 보냈어요. 이메일 인증 후 로그인해 주세요."
          );
          return;
        }
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (result?.error) {
          setErr(
            result.error === "auth-failed"
              ? "이메일 또는 비밀번호를 확인해 주세요."
              : result.error
          );
          return;
        }
        onClose();
      } catch {
        setErr("문제가 발생했어요. 다시 시도해 주세요.");
      }
    }
  );

  const requestEmailAction = async (action: "reset" | "resend") => {
    const email = emailValue.trim();
    setErr("");
    setNotice("");
    if (!email) {
      setErr("이메일을 먼저 입력해 주세요.");
      emailRef.current?.focus();
      return;
    }
    setEmailAction(action);
    try {
      const endpoint =
        action === "reset"
          ? "/auth/password/reset/request"
          : "/auth/email/verification/resend";
      const response = await fetch(
        apiPath(endpoint),
        withCsrfProtection({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        setErr(payload?.error ?? "안내 메일을 보내지 못했어요.");
        return;
      }
      setNotice(
        payload?.message ?? "처리 가능한 계정이 있다면 안내 메일을 보냈어요."
      );
    } catch {
      setErr("메일 요청 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setEmailAction(null);
    }
  };

  const avatarImage = resolveSignupAvatarImage(imageValue);

  const onAvatarImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setImageErr("");
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setImageErr("PNG, JPG, WebP 이미지만 업로드할 수 있어요.");
      return;
    }

    if (file.size > MAX_AVATAR_IMAGE_BYTES) {
      setImageErr("이미지는 180KB 이하로 올려 주세요.");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const safeImage = resolveSignupAvatarImage(dataUrl);
    if (!safeImage) {
      setImageErr("이미지를 읽을 수 없어요. 다른 파일을 선택해 주세요.");
      return;
    }

    setValue("image", safeImage, { shouldDirty: true, shouldValidate: true });
  };

  const modal = (
    <div
      data-auth-overlay="true"
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:pb-8 sm:pt-[8vh]"
    >
      <button
        type="button"
        aria-label={translateCurrentStaticSourceText(
          "domains.auth.components.auth.modal",
          "ko",
          "닫기"
        )}
        tabIndex={-1}
        data-app-tooltip-exclude="true"
        onClick={onClose}
        className="absolute inset-0 bg-[oklch(0.12_0.012_70/0.64)] backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-auth-modal="true"
        data-auth-mode={mode}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[1.5rem] border border-line-strong bg-panel shadow-2xl shadow-[oklch(0.1_0.02_70/0.46)] motion-safe:animate-[fade-up_0.22s_var(--ease-out-expo)_both] sm:max-h-[calc(100dvh-5rem)]"
      >
        <button
          type="button"
          aria-label={translateCurrentStaticSourceText(
            "domains.auth.components.auth.modal",
            "ko",
            "로그인 창 닫기"
          )}
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-[0.9rem] border border-line/80 bg-panel/80 text-fg-3 shadow-sm backdrop-blur-xl transition-[border-color,background-color,color,transform] hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
        >
          <X size={18} aria-hidden="true" />
        </button>
        <div className="p-5 sm:p-7">
          <div className="relative mb-5 overflow-hidden rounded-2xl border border-line/80 bg-[radial-gradient(circle_at_18%_0%,var(--color-accent-soft),transparent_58%),linear-gradient(145deg,var(--color-card),var(--color-panel))] p-4 pr-14 shadow-sm">
            <span
              aria-hidden="true"
              className="absolute -right-8 -top-8 size-28 rounded-full border border-accent/15 bg-accent/5"
            />
            <div className="relative flex items-start gap-3">
              <ToonSpectrumMark className="size-11 rounded-xl" />
              <div className="min-w-0">
                <p className="font-display text-[0.66rem] font-bold uppercase tracking-[0.16em] text-accent">
                  {translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "툰스튜디오 계정"
                  )}
                </p>
                <h2
                  id={titleId}
                  className="mt-1 font-display text-xl font-bold tracking-[-0.025em] text-fg"
                >
                  {mode === "login"
                    ? translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "다시 만나 반가워요"
                      )
                    : translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "새 창작 여정을 시작해요"
                      )}
                </h2>
              </div>
            </div>
            <p
              id={descriptionId}
              className="relative mt-3 text-sm leading-relaxed text-fg-3"
            >
              {mode === "login"
                ? translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "작품, 서재와 스튜디오 작업을 어느 기기에서나 이어가세요."
                  )
                : translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "하나의 계정으로 감상 기록과 제작 프로젝트를 안전하게 연결하세요."
                  )}
            </p>
          </div>

          <div
            role="tablist"
            aria-label={translateCurrentStaticSourceText(
              "domains.auth.components.auth.modal",
              "ko",
              "로그인 방식"
            )}
            className="mb-5 grid grid-cols-2 rounded-xl border border-line bg-canvas/75 p-1"
          >
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setPasswordVisible(false);
                  setErr("");
                  setNotice("");
                }}
                className={cn(
                  "min-h-11 rounded-lg px-3 py-2 text-sm font-semibold outline-none transition-[background-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  mode === m
                    ? "bg-panel text-fg shadow-sm ring-1 ring-inset ring-line"
                    : "text-fg-3 hover:bg-raised/60 hover:text-fg-2"
                )}
              >
                {m === "login"
                  ? translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "로그인"
                    )
                  : translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "회원가입"
                    )}
              </button>
            ))}
          </div>

          <form className="flex flex-col gap-3.5" onSubmit={submit}>
            {mode === "signup" && (
              <>
                <label
                  htmlFor={nameId}
                  className="block text-xs font-semibold text-fg-2"
                >
                  {translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "닉네임"
                  )}
                  <span className="relative mt-1.5 block">
                    <UserRound
                      size={16}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
                    />
                    <input
                      id={nameId}
                      {...register("name")}
                      autoComplete="nickname"
                      placeholder={translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "표시할 이름을 입력하세요"
                      )}
                      className="h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-3.5 text-sm font-normal text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-3 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
                    />
                  </span>
                </label>
                <details className="group overflow-hidden rounded-2xl border border-line bg-canvas/70 open:border-line-strong">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 outline-none marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-line text-sm font-bold text-fg"
                      style={{ background: avatarBackground }}
                    >
                      {avatarImage ? (
                        <img
                          src={avatarImage}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        avatarInitial
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-fg-2">
                        {translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "프로필 이미지 꾸미기"
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.68rem] text-fg-3">
                        {translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "선택 사항 · 색상 또는 이미지 업로드"
                        )}
                      </span>
                    </span>
                    <span className="text-[0.68rem] font-semibold text-accent group-open:hidden">
                      {translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "열기"
                      )}
                    </span>
                    <span className="hidden text-[0.68rem] font-semibold text-accent group-open:inline">
                      {translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "접기"
                      )}
                    </span>
                  </summary>
                  <div className="border-t border-line p-3">
                    <Controller
                      control={control}
                      name="avatar"
                      render={({ field }) => (
                        <div className="rounded-xl bg-canvas p-1">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-fg-2">
                              {translateCurrentStaticSourceText(
                                "domains.auth.components.auth.modal",
                                "ko",
                                "아바타"
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const preset = pickAvatarPreset(
                                  nameValue,
                                  emailValue
                                );
                                field.onChange(preset.id);
                              }}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-raised px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                              <Sparkles size={13} />
                              {translateCurrentStaticSourceText(
                                "domains.auth.components.auth.modal",
                                "ko",
                                "추천"
                              )}
                            </button>
                          </div>
                          <div className="mb-3 flex items-center gap-3">
                            <div
                              aria-hidden="true"
                              className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[oklch(0.95_0.01_85/0.16)] text-xl font-bold text-fg shadow-[0_1px_0_oklch(0.95_0.01_85/0.12)_inset]"
                              style={{ background: avatarBackground }}
                            >
                              {avatarImage ? (
                                <img
                                  src={avatarImage}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                avatarInitial
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-fg">
                                {selectedPreset.name}
                              </p>
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-3">
                                {selectedPreset.tone}
                              </p>
                            </div>
                          </div>
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <input
                              ref={imageInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={onAvatarImageChange}
                            />
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                              <ImagePlus size={13} />
                              {translateCurrentStaticSourceText(
                                "domains.auth.components.auth.modal",
                                "ko",
                                "이미지 업로드"
                              )}
                            </button>
                            {avatarImage && (
                              <button
                                type="button"
                                onClick={() => {
                                  setValue("image", null, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                  setImageErr("");
                                }}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-3 transition-colors hover:border-bad/60 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              >
                                <Trash2 size={13} />
                                {translateCurrentStaticSourceText(
                                  "domains.auth.components.auth.modal",
                                  "ko",
                                  "제거"
                                )}
                              </button>
                            )}
                            <span className="text-[0.68rem] text-fg-3">
                              {translateCurrentStaticSourceText(
                                "domains.auth.components.auth.modal",
                                "ko",
                                "PNG/JPG/WebP · 180KB 이하"
                              )}
                            </span>
                          </div>
                          {imageErr && (
                            <p className="mb-3 text-xs text-bad" role="alert">
                              {imageErr}
                            </p>
                          )}
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {AVATAR_PRESETS.map((preset) => {
                              const active =
                                field.value === preset.id ||
                                field.value === preset.color;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => field.onChange(preset.id)}
                                  aria-label={formatI18nTemplate(
                                    translateCurrentStaticSourceText(
                                      "domains.auth.components.auth.modal",
                                      "ko",
                                      "{v0} 아바타 선택"
                                    ),
                                    { v0: String(preset.name) }
                                  )}
                                  aria-pressed={active}
                                  className={cn(
                                    "flex min-h-14 items-center gap-2 rounded-xl border bg-panel p-2 text-left transition-[border-color,background,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                                    active
                                      ? "border-accent bg-accent-soft text-fg"
                                      : "border-line text-fg-2 hover:border-line-strong hover:bg-raised"
                                  )}
                                >
                                  <span
                                    className="size-7 shrink-0 rounded-lg border border-[oklch(0.95_0.01_85/0.14)]"
                                    style={{
                                      background: `radial-gradient(circle at 32% 24%, ${preset.accent}, transparent 35%), linear-gradient(145deg, ${preset.color}, oklch(0.26 0.04 60))`,
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-semibold">
                                      {preset.name}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[0.68rem] text-fg-3">
                                      {preset.tone}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    />
                  </div>
                </details>
              </>
            )}
            <label
              htmlFor={emailId}
              className="block text-xs font-semibold text-fg-2"
            >
              {translateCurrentStaticSourceText(
                "domains.auth.components.auth.modal",
                "ko",
                "이메일"
              )}
              <span className="relative mt-1.5 block">
                <Mail
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
                />
                <input
                  id={emailId}
                  {...emailField}
                  ref={(el) => {
                    emailField.ref(el);
                    emailRef.current = el;
                  }}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "name@example.com"
                  )}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? "auth-email-error" : undefined
                  }
                  className="h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-3.5 text-sm font-normal text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-3 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
                />
              </span>
            </label>
            {errors.email?.message && (
              <p
                id="auth-email-error"
                className="text-xs text-bad"
                role="alert"
              >
                {errors.email.message}
              </p>
            )}
            <div>
              <label
                htmlFor={passwordId}
                className="flex items-center justify-between gap-3 text-xs font-semibold text-fg-2"
              >
                <span>
                  {translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "비밀번호"
                  )}
                </span>
                {mode === "signup" ? (
                  <span
                    id="auth-password-help"
                    className="font-medium text-fg-3"
                  >
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "15자 이상"
                    )}
                  </span>
                ) : null}
              </label>
              <div className="relative mt-1.5">
                <LockKeyhole
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
                />
                <input
                  id={passwordId}
                  {...register("password")}
                  type={passwordVisible ? "text" : "password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder={
                    mode === "signup"
                      ? translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "안전한 비밀번호를 입력하세요"
                        )
                      : translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "비밀번호를 입력하세요"
                        )
                  }
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password
                      ? "auth-password-error"
                      : mode === "signup"
                      ? "auth-password-help"
                      : undefined
                  }
                  className="h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-14 text-sm text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-3 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
                />
                <button
                  type="button"
                  aria-label={
                    passwordVisible
                      ? translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "비밀번호 숨기기"
                        )
                      : translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "비밀번호 표시"
                        )
                  }
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-fg-3 outline-none transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {passwordVisible ? (
                    <EyeOff size={17} aria-hidden="true" />
                  ) : (
                    <Eye size={17} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            {errors.password?.message && (
              <p
                id="auth-password-error"
                className="text-xs text-bad"
                role="alert"
              >
                {errors.password.message}
              </p>
            )}
            {mode === "login" && (
              <div className="grid grid-cols-1 gap-1 rounded-xl border border-line/70 bg-canvas/45 p-1 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={emailAction !== null}
                  onClick={() => {
                    void requestEmailAction("resend");
                  }}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-fg-3 outline-none transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
                >
                  {emailAction === "resend"
                    ? translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "전송 중…"
                      )
                    : translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "인증 메일 다시 보내기"
                      )}
                </button>
                <button
                  type="button"
                  disabled={emailAction !== null}
                  onClick={() => {
                    void requestEmailAction("reset");
                  }}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-fg-3 outline-none transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
                >
                  {emailAction === "reset"
                    ? translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "전송 중…"
                      )
                    : translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "비밀번호를 잊으셨나요?"
                      )}
                </button>
              </div>
            )}
            {notice && (
              <p
                className="rounded-xl border border-good/35 bg-good/5 px-3.5 py-3 text-xs leading-relaxed text-good"
                role="status"
                aria-live="polite"
              >
                {notice}
              </p>
            )}
            {err && (
              <p
                className="rounded-xl border border-bad/35 bg-bad/5 px-3.5 py-3 text-xs leading-relaxed text-bad"
                role="alert"
              >
                {err}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="group mt-0.5 flex h-12 items-center justify-center gap-2 rounded-xl border border-accent bg-accent text-sm font-bold text-on-accent shadow-lg shadow-accent/15 outline-none transition-[background-color,box-shadow,transform] hover:bg-accent-2 hover:shadow-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {mode === "login" ? (
                <LogIn
                  size={17}
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                />
              ) : (
                <UserPlus
                  size={17}
                  aria-hidden="true"
                  className="transition-transform group-hover:scale-105"
                />
              )}
              {isSubmitting
                ? translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "처리 중…"
                  )
                : mode === "login"
                ? translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "로그인"
                  )
                : translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "가입하고 시작"
                  )}
            </button>
          </form>

          {(providerStatus !== "ready" ||
            providers.kakao ||
            providers.google ||
            providers.naver ||
            providers.apple ||
            providers.github) && (
            <>
              <div className="my-4 flex items-center gap-3 text-[0.7rem] text-fg-3">
                <span className="h-px flex-1 bg-line" />
                {translateCurrentStaticSourceText(
                  "domains.auth.components.auth.modal",
                  "ko",
                  "또는"
                )}
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="flex flex-col gap-2">
                {providerStatus === "loading" && (
                  <div
                    className="flex h-12 animate-pulse items-center justify-center rounded-xl border border-line bg-card text-xs font-medium text-fg-3"
                    role="status"
                  >
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "소셜 로그인 확인 중…"
                    )}
                  </div>
                )}
                {providerStatus === "error" && (
                  <div className="rounded-xl border border-line bg-card p-3 text-center">
                    <p
                      className="text-xs leading-relaxed text-fg-3"
                      role="status"
                    >
                      {translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "로그인 서비스를 확인하지 못했어요. 일시적인 연결 문제나 서비스 점검 중일 수 있어요. 잠시 후 다시 확인해 주세요."
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setProviderAttempt((value) => value + 1)}
                      className="mt-3 min-h-11 rounded-xl border border-line bg-panel px-4 text-xs font-semibold text-fg-2 outline-none transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "다시 확인"
                      )}
                    </button>
                  </div>
                )}
                {providers.kakao && (
                  <button
                    type="button"
                    onClick={() => signIn("kakao")}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-[#FEE500] bg-[#FEE500] text-sm font-bold text-[#191600] shadow-sm outline-none transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
                  >
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "카카오로 계속하기"
                    )}
                    {providers.kakao.mode === "demo" && <DemoTag dark />}
                  </button>
                )}
                {providers.google &&
                  (providers.google.mode === "oauth" &&
                  providers.google.clientId ? (
                    // 실연동 Google: GIS 공식 버튼(ID 토큰 흐름) — 리다이렉트 없이 모달에서 로그인.
                    <GoogleIdentityButton
                      clientId={providers.google.clientId}
                      onSuccess={onClose}
                      onRedirectFallback={
                        providers.google.redirectAvailable
                          ? () => {
                              void signIn("google");
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <div
                      className="rounded-xl border border-line bg-card px-3.5 py-3"
                      role="status"
                      aria-label={translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "Google 로그인 설정 필요"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-fg-2">
                          {translateCurrentStaticSourceText(
                            "domains.auth.components.auth.modal",
                            "ko",
                            "Google로 계속하기"
                          )}
                        </span>
                        <span className="rounded-md border border-line bg-raised px-1.5 py-0.5 text-[0.62rem] font-bold text-fg-3">
                          {translateCurrentStaticSourceText(
                            "domains.auth.components.auth.modal",
                            "ko",
                            "설정 필요"
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                        {translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "Google 로그인 설정이 아직 완료되지 않았어요. 지금은 이메일 로그인을 이용해 주세요."
                        )}
                      </p>
                    </div>
                  ))}
                {providers.naver && (
                  <button
                    type="button"
                    onClick={() => signIn("naver")}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-[#03C75A] bg-[#03C75A] text-sm font-bold text-white shadow-sm outline-none transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
                  >
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "네이버로 계속하기"
                    )}
                    {providers.naver.mode === "demo" && <DemoTag dark />}
                  </button>
                )}
                {providers.apple && (
                  <button
                    type="button"
                    onClick={() => signIn("apple")}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-black text-sm font-bold text-white shadow-sm outline-none transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
                  >
                    <span className="text-lg leading-none" aria-hidden="true">
                      
                    </span>
                    Apple로 계속하기
                  </button>
                )}
                {providers.github && (
                  <button
                    type="button"
                    onClick={() => signIn("github")}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-[oklch(0.22_0.015_70)] text-sm font-bold text-white shadow-sm outline-none transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
                  >
                    <Code2 size={17} aria-hidden="true" />
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "GitHub로 계속하기"
                    )}
                  </button>
                )}
              </div>
              {(providers.kakao?.mode === "demo" ||
                providers.naver?.mode === "demo") && (
                <p className="mt-2 text-center text-[0.66rem] text-fg-3">
                  {translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "데모 표시는 실제 소셜 연동이 아직 설정되지 않아 체험용 계정으로 로그인됨을 뜻해요."
                  )}
                </p>
              )}
            </>
          )}
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line/70 bg-canvas/45 px-3.5 py-3 text-[0.7rem] leading-relaxed text-fg-3">
            <LockKeyhole
              size={15}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-accent"
            />
            <p>
              {translateCurrentStaticSourceText(
                "domains.auth.components.auth.modal",
                "ko",
                "로그인하면 작품·서재·스튜디오 작업이 계정에 안전하게 연결됩니다. 공용 기기에서는 작업 후 로그아웃해 주세요."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
