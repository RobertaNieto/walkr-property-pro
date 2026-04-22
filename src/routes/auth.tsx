import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password too long");

export const Route = createFileRoute("/auth")({
  component: AuthScreen,
});

type Mode = "signin" | "signup";

function AuthScreen() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (user) return <Navigate to="/" />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const emailResult = emailSchema.safeParse(email);
    const pwResult = passwordSchema.safeParse(password);
    const newErrors: typeof errors = {};
    if (!emailResult.success) newErrors.email = emailResult.error.issues[0].message;
    if (!pwResult.success) newErrors.password = pwResult.error.issues[0].message;
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: emailResult.data!,
          password: pwResult.data!,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
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
                className={cn(
                  "h-14 w-full rounded-2xl border-2 bg-white/10 px-4 text-base text-primary-foreground placeholder:text-primary-foreground/40 backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
                  errors.email ? "border-critical" : "border-white/15"
                )}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-rating-fair">{errors.email}</p>
              )}
            </div>

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
                  className={cn(
                    "h-14 w-full rounded-2xl border-2 bg-white/10 px-4 pr-14 text-base text-primary-foreground placeholder:text-primary-foreground/40 backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
                    errors.password ? "border-critical" : "border-white/15"
                  )}
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
                  onClick={() => setMode("signup")}
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
                  onClick={() => setMode("signin")}
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
