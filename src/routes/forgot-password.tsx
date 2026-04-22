import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordScreen,
});

function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(result.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setSent(true);
      toast.success("Check your email for a reset link");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-gradient-to-b from-primary via-primary to-[oklch(0.28_0.08_260)] text-primary-foreground">
      <main className="relative flex flex-1 flex-col px-6 pb-8 pt-[max(env(safe-area-inset-top),3rem)]">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <button
            type="button"
            onClick={() => navigate({ to: "/auth" })}
            className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary-foreground/80"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-32 w-32 items-center justify-center">
              <img src={logo} alt="PropertyWalk" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Reset your password</h1>
            <p className="mt-2 text-sm text-primary-foreground/70">
              {sent
                ? "We sent a password reset link to your email. Open it on this device to continue."
                : "Enter your account email and we'll send you a link to reset your password."}
            </p>
          </div>

          {!sent && (
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
                    error ? "border-critical" : "border-white/15"
                  )}
                />
                {error && <p className="mt-1.5 text-xs text-rating-fair">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send reset link"}
              </button>
            </form>
          )}

          {sent && (
            <div className="mt-8">
              <Link
                to="/auth"
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)]"
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
