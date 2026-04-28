import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { Camera, Eye, EyeOff, Loader2, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/logo.png";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatPhone } from "@/lib/format-phone";
import { compressImage } from "@/lib/image-compress";
import { cn } from "@/lib/utils";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password too long");
const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(100, "Name too long");
const phoneSchema = z
  .string()
  .trim()
  .refine((v) => v.replace(/\D/g, "").length === 10, "Enter a 10-digit phone number");
const licenseSchema = z
  .string()
  .trim()
  .min(2, "Enter your license number")
  .max(60, "License number too long");

export const Route = createFileRoute("/auth")({
  component: AuthScreen,
});

type Mode = "signin" | "signup";

interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  fullName?: string;
  phone?: string;
  license?: string;
}

function AuthScreen() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke preview URL on unmount/swap to avoid leaks.
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const onPickAvatar = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      toast.error("Please choose a JPG, PNG, or WebP image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const clearAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (user) return <Navigate to="/" />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const newErrors: FormErrors = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.issues[0].message;

    const pwResult = passwordSchema.safeParse(password);
    if (!pwResult.success) newErrors.password = pwResult.error.issues[0].message;

    if (mode === "signup") {
      const nameResult = fullNameSchema.safeParse(fullName);
      if (!nameResult.success) newErrors.fullName = nameResult.error.issues[0].message;

      const phoneResult = phoneSchema.safeParse(phone);
      if (!phoneResult.success) newErrors.phone = phoneResult.error.issues[0].message;

      const licResult = licenseSchema.safeParse(license);
      if (!licResult.success) newErrors.license = licResult.error.issues[0].message;

      if (pwResult.success && password !== confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: emailResult.data!,
          password: pwResult.data!,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: fullName.trim(),
              display_name: fullName.trim(),
              phone: phone.trim(),
              license_number: license.trim(),
            },
          },
        });
        if (error) throw error;

        // Best-effort optional avatar upload — only possible if the signup
        // returned an active session (auto-confirm enabled). If not, the
        // user can add a photo later from the profile screen.
        const newUserId = signUpData.user?.id;
        if (avatarFile && signUpData.session && newUserId) {
          try {
            const compressed = await compressImage(avatarFile, {
              maxBytes: 500 * 1024,
              maxDim: 1024,
            });
            const path = `${newUserId}/avatar.jpg`;
            const { error: upErr } = await supabase.storage
              .from("avatars")
              .upload(path, compressed, {
                upsert: true,
                contentType: "image/jpeg",
                cacheControl: "60",
              });
            if (!upErr) {
              const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
              const url = `${pub.publicUrl}?v=${Date.now()}`;
              await supabase.from("profiles").update({ avatar_url: url }).eq("id", newUserId);
            }
          } catch (e) {
            console.warn("[auth] avatar upload skipped:", e);
          }
        }

        toast.success("Account created — you're signed in");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailResult.data!,
          password: pwResult.data!,
        });
        if (error) throw error;
        toast.success("Welcome back");
      }
      navigate({ to: "/" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(
        message.includes("Invalid login")
          ? "Email or password is incorrect"
          : message
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = (hasError?: boolean) =>
    cn(
      "h-14 w-full rounded-2xl border-2 bg-white/10 px-4 text-base text-primary-foreground placeholder:text-primary-foreground/40 backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
      hasError ? "border-critical" : "border-white/15"
    );

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-gradient-to-b from-primary via-primary to-[oklch(0.28_0.08_260)] text-primary-foreground">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, oklch(0.49 0.12 258 / 0.6), transparent 70%)",
        }}
      />
      <main className="relative flex flex-1 flex-col px-6 pb-8 pt-[max(env(safe-area-inset-top),3rem)]">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-32 w-32 items-center justify-center">
              <img src={logo} alt="PropertyWalk" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </h1>
            <p className="mt-2 text-sm text-primary-foreground/70">
              {mode === "signin"
                ? "Sign in to continue your walkthroughs"
                : "Sign up to start documenting properties"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div className="flex flex-col items-center gap-2 pb-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="Add profile photo"
                  className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary"
                >
                  <UserAvatar
                    url={avatarPreview}
                    name={fullName}
                    email={email}
                    size="2xl"
                  />
                  <span
                    aria-hidden
                    className="absolute bottom-0 right-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md ring-2 ring-primary"
                  >
                    <Camera className="h-4 w-4" />
                  </span>
                </button>
                {avatarPreview ? (
                  <button
                    type="button"
                    onClick={clearAvatar}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary-foreground/80 underline"
                  >
                    <X className="h-3 w-3" />
                    Remove photo
                  </button>
                ) : (
                  <span className="text-xs text-primary-foreground/70">
                    Add Photo (optional)
                  </span>
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="user"
                  className="hidden"
                  onChange={onPickAvatar}
                />
              </div>
            )}
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-primary-foreground/90">
                  Full Name
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="First and Last Name"
                  maxLength={100}
                  className={inputCls(!!errors.fullName)}
                />
                {errors.fullName && (
                  <p className="mt-1.5 text-xs text-rating-fair">{errors.fullName}</p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-primary-foreground/90">
                Email
              </label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@example.com"
                className={inputCls(!!errors.email)}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-rating-fair">{errors.email}</p>
              )}
            </div>

            {mode === "signup" && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-primary-foreground/90">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(555) 555-5555"
                    maxLength={14}
                    className={inputCls(!!errors.phone)}
                  />
                  {errors.phone && (
                    <p className="mt-1.5 text-xs text-rating-fair">{errors.phone}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-primary-foreground/90">
                    Real Estate License #
                  </label>
                  <input
                    type="text"
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    placeholder="License Number"
                    maxLength={60}
                    className={inputCls(!!errors.license)}
                  />
                  {errors.license && (
                    <p className="mt-1.5 text-xs text-rating-fair">{errors.license}</p>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-primary-foreground/90">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={cn(inputCls(!!errors.password), "pr-14")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-primary-foreground/70 hover:bg-white/10"
                >
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-rating-fair">{errors.password}</p>
              )}
            </div>

            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-primary-foreground/90">
                  Confirm Password
                </label>
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className={inputCls(!!errors.confirmPassword)}
                />
                {errors.confirmPassword && (
                  <p className="mt-1.5 text-xs text-rating-fair">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            {mode === "signin" && (
              <div className="-mt-2 text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm font-semibold text-primary-foreground/80 underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99] disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : mode === "signin" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-primary-foreground/70">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="font-semibold text-primary-foreground underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="font-semibold text-primary-foreground underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
