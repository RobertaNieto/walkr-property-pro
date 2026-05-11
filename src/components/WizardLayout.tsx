import { useNavigate } from "@tanstack/react-router";
import { Home as HomeIcon, MapPin, Save, ShieldAlert } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  exitAdminEdit,
  formatPropertyAddress,
  formatTimestamp,
  getAdminEditing,
  loadActive,
  type AdminEditMeta,
} from "@/lib/walkthrough";

const SECTION_COLORS: Record<number, string> = {
  1: "#1B3A6B",
  2: "#0D6E3F",
  3: "#0D6E3F",
  4: "#5C4033",
  5: "#37474F",
  6: "#0277BD",
  7: "#6A1B9A",
  8: "#1565C0",
  9: "#E65100",
  10: "#558B2F",
  11: "#00838F",
  12: "#4527A0",
  13: "#2E7D32",
  14: "#BF360C",
  15: "#283593",
  16: "#4E342E",
  17: "#1B5E20",
};

export function getSectionColor(sectionNumber: number): string {
  return SECTION_COLORS[sectionNumber] ?? "#1B3A6B";
}

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
  onBack?: () => void;
  nextLabel?: string;
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
  onBack,
  nextLabel,
  children,
}: WizardLayoutProps) {
  const navigate = useNavigate();
  const propertyAddress = useMemo(() => formatPropertyAddress(loadActive()?.address), []);
  const [homeConfirmOpen, setHomeConfirmOpen] = useState(false);
  const [adminEdit, setAdminEdit] = useState<AdminEditMeta | null>(null);

  useEffect(() => {
    setAdminEdit(getAdminEditing());
  }, []);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate({ to: "/wizard/menu" });
    }
  };

  const handleConfirmLeave = async () => {
    setHomeConfirmOpen(false);
    if (adminEdit) {
      await exitAdminEdit();
      void navigate({ to: "/admin" });
      return;
    }
    void navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {adminEdit && (
        <div className="sticky top-0 z-30 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-amber-900 dark:text-amber-200">
          <div className="mx-auto flex w-full max-w-2xl items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[12px] font-semibold leading-snug">
              You are editing {adminEdit.agentName}'s walkthrough
              {adminEdit.address ? ` for ${adminEdit.address}` : ""}. Changes save immediately.
            </p>
          </div>
        </div>
      )}
      {/* Sticky top */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-2xl px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          {/* Row 1: progress bar + Home */}
          <div className="flex items-center gap-3">
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
            <button
              type="button"
              onClick={() => setHomeConfirmOpen(true)}
              aria-label="Home"
              className="-mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary active:bg-secondary"
            >
              <HomeIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Row 2: color-coded section banner — chapter heading */}
          <div
            className="mt-3 flex min-h-[80px] flex-col justify-center gap-2 rounded-2xl p-4 pl-4 text-white shadow-[var(--shadow-soft)] transition-[background-color] duration-300"
            style={{ backgroundColor: getSectionColor(sectionIndex) }}
            role="heading"
            aria-level={2}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-white/60">
                Section {sectionIndex} of {totalSections}
              </p>
              <div className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-white/85">
                Q {questionIndex} of {totalQuestions}
              </div>
            </div>
            <p className="truncate text-[28px] font-bold uppercase leading-tight tracking-tight text-white">
              {sectionName}
            </p>
            {propertyAddress && (
              <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-white/85">
                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="truncate">{propertyAddress}</span>
              </p>
            )}
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
          <div className="flex gap-3">
            <button
              onClick={handleBack}
              className="inline-flex h-14 w-[30%] items-center justify-center rounded-2xl border-2 border-primary bg-background text-base font-semibold text-primary transition-all hover:bg-secondary active:scale-[0.99]"
            >
              ← Back
            </button>
            <button
              onClick={() => (canContinue ? onNext() : onAttemptNext?.())}
              aria-disabled={!canContinue}
              className={cn(
                "inline-flex h-14 flex-1 items-center justify-center rounded-2xl text-base font-semibold transition-all",
                canContinue
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] hover:bg-primary/90 active:scale-[0.99]"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {nextLabel ?? "Next →"}
            </button>
          </div>
        </div>
      </footer>

      <AlertDialog open={homeConfirmOpen} onOpenChange={setHomeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave walkthrough?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress is saved automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
