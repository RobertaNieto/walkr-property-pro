import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, Save } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/lib/walkthrough";

interface WizardLayoutProps {
  sectionIndex: number;
  totalSections?: number;
  sectionName: string;
  questionIndex: number;
  totalQuestions: number;
  progress: number; // 0-100
  lastSavedAt?: number;
  canContinue: boolean;
  onNext: () => void;
  onAttemptNext?: () => void;
  children: ReactNode;
}

export function WizardLayout({
  sectionIndex,
  totalSections = 18,
  sectionName,
  questionIndex,
  totalQuestions,
  progress,
  lastSavedAt,
  canContinue,
  onNext,
  onAttemptNext,
  children,
}: WizardLayoutProps) {
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Sticky top */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-2xl px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          {/* Row 1: back + progress bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.history.back()}
              aria-label="Back"
              className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary active:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
                />
              </div>
              <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {Math.round(progress)}% complete
              </div>
            </div>
          </div>

          {/* Row 2: large navy section banner — chapter heading */}
          <div
            className="mt-3 flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-[oklch(0.28_0.07_255)] p-4 text-white shadow-[var(--shadow-soft)]"
            role="heading"
            aria-level={2}
          >
            <div className="min-w-0">
              <p className="text-[18px] font-bold leading-tight">
                Section {sectionIndex} of {totalSections}
              </p>
              <p className="mt-0.5 truncate text-[15px] font-semibold uppercase tracking-wide text-white/85">
                {sectionName}
              </p>
            </div>
            <div className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold tracking-wide">
              Q {questionIndex} of {totalQuestions}
            </div>
          </div>
        </div>
      </header>

      {/* Middle scrollable */}
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">{children}</div>
      </main>

      {/* Sticky bottom */}
      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          {lastSavedAt && (
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Save className="h-3 w-3" />
              <span>Saved {formatTimestamp(lastSavedAt)}</span>
            </div>
          )}
          <button
            onClick={() => (canContinue ? onNext() : onAttemptNext?.())}
            aria-disabled={!canContinue}
            className={cn(
              "inline-flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold transition-all",
              canContinue
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] hover:bg-primary/90 active:scale-[0.99]"
                : "bg-muted text-muted-foreground"
            )}
          >
            Next →
          </button>
        </div>
      </footer>
    </div>
  );
}
