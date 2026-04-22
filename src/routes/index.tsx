import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import logo from "@/assets/logo.png";
import { createWalkthrough, formatTimestamp, loadWalkthrough, type Walkthrough } from "@/lib/walkthrough";

export const Route = createFileRoute("/")({
  component: WelcomeScreen,
});

function WelcomeScreen() {
  const navigate = useNavigate();
  const [existing, setExisting] = useState<Walkthrough | null>(null);

  useEffect(() => {
    setExisting(loadWalkthrough());
  }, []);

  const startNew = () => {
    createWalkthrough();
    navigate({ to: "/address" });
  };

  const resume = () => {
    if (!existing) return;
    navigate({ to: existing.lastRoute ?? "/address" });
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-gradient-to-b from-primary via-primary to-[oklch(0.28_0.08_260)] text-primary-foreground">
      {/* subtle accent glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, oklch(0.49 0.12 258 / 0.6), transparent 70%)",
        }}
      />

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-[max(env(safe-area-inset-top),3rem)]">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur">
            <img src={logo} alt="PropertyWalk logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">PropertyWalk</h1>
          <p className="mt-3 max-w-sm text-base text-primary-foreground/70">
            Professional property documentation
          </p>
        </div>
      </main>

      <footer className="relative px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div className="mx-auto w-full max-w-md space-y-3">
          <button
            onClick={startNew}
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99]"
          >
            Start New Walkthrough
          </button>

          {existing && (
            <button
              onClick={resume}
              className="inline-flex h-14 w-full flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-sm font-semibold text-primary-foreground backdrop-blur transition-all hover:bg-white/10 active:scale-[0.99]"
            >
              <span className="text-base">Resume Previous Walkthrough</span>
              <span className="text-xs font-normal text-primary-foreground/60">
                Last saved {formatTimestamp(existing.updatedAt)}
              </span>
            </button>
          )}

          <p className="pt-4 text-center text-[11px] text-primary-foreground/40">
            Works offline · Auto-saves on every step
          </p>
          <p className="text-center">
            <Link to="/address" className="text-[11px] text-primary-foreground/40 underline">
              v1.0
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
