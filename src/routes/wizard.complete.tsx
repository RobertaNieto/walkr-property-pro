import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/wizard/complete")({
  component: CompleteScreen,
});

function CompleteScreen() {
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
      <Link
        to="/"
        className="mt-8 inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary/90"
      >
        Back to Home
      </Link>
    </div>
  );
}
