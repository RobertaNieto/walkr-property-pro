import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password too long");

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordScreen,
});

function ResetPasswordScreen() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  useEffect(() => {
    // Supabase parses the recovery hash and emits PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(true);
      }
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const pwResult = passwordSchema.safeParse(password);
    const newErrors: typeof errors = {};
    if (!pwResult.success) newErrors.password = pwResult.error.issues[0].message;
    if (password !== confirm) newErrors.confirm = "Passwords don't match";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwResult.data! });
      if (error) throw error;
      toast.success("Password updated — you're signed in");
      navigate({ to: "/" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-gradient-to-b from-primary via-primary to-[oklch(0.28_0.08_260)] text-primary-foreground">
      <main className="relative flex flex-1 flex-col px-6 pb-8 pt-[max(env(safe-area-inset-top),3rem)]">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-32 w-32 items-center justify-center">
              <img src={logo} alt="PropertyWalk" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Set a new password</h1>
            <p className="mt-2 text-sm text-primary-foreground/70">
              {hasSession
                ? "Choose a strong password you haven't used before."
                : "This reset link is invalid or has expired. Request a new one."}
            </p>
          </div>

          {hasSession ? (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-primary-foreground/90">
                  New password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
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

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-primary-foreground/90">
                  Confirm password
                </label>
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  className={cn(
                    "h-14 w-full rounded-2xl border-2 bg-white/10 px-4 text-base text-primary-foreground placeholder:text-primary-foreground/40 backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
                    errors.confirm ? "border-critical" : "border-white/15"
                  )}
                />
                {errors.confirm && (
                  <p className="mt-1.5 text-xs text-rating-fair">{errors.confirm}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Update password"}
              </button>
            </form>
          ) : (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => navigate({ to: "/forgot-password" })}
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)]"
              >
                Request a new link
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
