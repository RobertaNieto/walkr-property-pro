import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { clearWalkthrough } from "@/lib/walkthrough";

export const Route = createFileRoute("/_app/wizard/complete")({
  component: CompleteScreen,
});

function CompleteScreen() {
  const navigate = useNavigate();
  const [cleared, setCleared] = useState(false);

  // Auto-clear sensitive data (lockbox code, address, photos) from localStorage
  // as soon as the walkthrough is complete.
  useEffect(() => {
    clearWalkthrough();
    setCleared(true);
  }, []);

  const handleClearAndExit = () => {
    clearWalkthrough();
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
        Phase 1 sample complete
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        You've completed the three sample wizard screens. The remaining 15 sections,
        review, and Drive submission are coming in the next phase.
      </p>

      {cleared && (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
          <Trash2 className="h-3.5 w-3.5" />
          Lockbox code & walkthrough data cleared from this device
        </p>
      )}

      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <Link
          to="/"
          className="inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary/90"
        >
          Back to Home
        </Link>
        <button
          onClick={handleClearAndExit}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <Trash2 className="h-4 w-4" />
          Clear data & start over
        </button>
      </div>
    </div>
  );
}
