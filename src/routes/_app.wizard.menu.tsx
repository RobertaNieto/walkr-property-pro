import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import {
  ArrowLeft,
  KeyRound,
  Home as HomeIcon,
  ArrowLeftRight,
  Car,
  Triangle,
  Waves,
  DoorOpen,
  Sofa,
  UtensilsCrossed,
  MoveHorizontal,
  Bath,
  BedDouble,
  WashingMachine,
  Wrench,
  Video,
  ClipboardList,
  CheckSquare,
  Check,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSectionColor } from "@/components/WizardLayout";
import { cn } from "@/lib/utils";
import { formatPropertyAddress, loadActive, updateWalkthrough, type Walkthrough } from "@/lib/walkthrough";
import {
  buildQuestionList,
  hasUserAnswer,
  isQuestionAnswered,
  SECTIONS,
  type QuestionDef,
  type SkipContext,
} from "@/lib/wizard-schema";

export const Route = createFileRoute("/_app/wizard/menu")({
  component: SectionMenuScreen,
});

const SECTION_ICONS: Record<number, LucideIcon> = {
  1: KeyRound,
  2: HomeIcon,
  3: ArrowLeftRight,
  4: Car,
  5: Triangle,
  6: Waves,
  7: DoorOpen,
  8: Sofa,
  9: UtensilsCrossed,
  10: MoveHorizontal,
  11: Bath,
  12: BedDouble,
  13: WashingMachine,
  14: Wrench,
  15: Video,
  16: ClipboardList,
  17: CheckSquare,
};

interface SectionRow {
  index: number;
  name: string;
  icon: LucideIcon;
  total: number;
  answered: number;
  status: "complete" | "in_progress" | "todo";
  firstQuestionId?: string;
  isChecklist?: boolean;
}

function SectionMenuScreen() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const w: Walkthrough | null = useMemo(() => loadActive(), [tick]);

  useEffect(() => {
    if (w) updateWalkthrough({ lastRoute: "/wizard/menu" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light polling so the menu reflects answers updated on the question screen.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, []);

  const ctx: SkipContext = useMemo(
    () => ({ config: w?.config ?? {}, answers: (w?.answers ?? {}) as SkipContext["answers"] }),
    [w],
  );

  const list = useMemo(() => buildQuestionList(ctx), [ctx]);
  const navList = useMemo(() => list.filter((x) => !x.renderedByCompanion), [list]);

  const rows: SectionRow[] = useMemo(() => {
    const byIndex = new Map<number, QuestionDef[]>();
    for (const item of navList) {
      const arr = byIndex.get(item.sectionIndex) ?? [];
      arr.push(item);
      byIndex.set(item.sectionIndex, arr);
    }
    const out: SectionRow[] = [];
    for (const s of SECTIONS) {
      const items = byIndex.get(s.index) ?? [];
      if (items.length === 0) continue; // skipped due to config
      // "answered" counts only questions the user has actually filled in —
      // optional questions with no input must NOT inflate progress on a fresh
      // walkthrough.
      const answered = items.filter((x) => hasUserAnswer(x, ctx.answers[x.id])).length;
      // Section is "complete" only when every question passes validation AND
      // the user has actually provided input for every required question.
      const allValid = items.every((x) => isQuestionAnswered(x, ctx.answers[x.id]));
      const requiredItems = items.filter((x) => (x as any).required || (x as any).field === "rating");
      const allRequiredAnswered = requiredItems.every((x) => hasUserAnswer(x, ctx.answers[x.id]));
      const firstUnanswered =
        items.find((x) => !hasUserAnswer(x, ctx.answers[x.id]) && ((x as any).required || (x as any).field === "rating"))
        ?? items.find((x) => !isQuestionAnswered(x, ctx.answers[x.id]));
      const firstQuestionId = (firstUnanswered ?? items[0])?.id;
      let status: SectionRow["status"] = "todo";
      if (allValid && allRequiredAnswered && answered > 0) status = "complete";
      else if (answered > 0) status = "in_progress";
      out.push({
        index: s.index,
        name: s.name,
        icon: SECTION_ICONS[s.index] ?? ClipboardList,
        total: items.length,
        answered,
        status,
        firstQuestionId,
      });
    }
    // Section 17 — Final Checklist (own route)
    out.push({
      index: 17,
      name: "Final Checklist",
      icon: SECTION_ICONS[17],
      total: 0,
      answered: 0,
      status: "todo",
      isChecklist: true,
    });
    return out;
  }, [navList, ctx.answers]);

  const completedCount = rows.filter((r) => r.status === "complete").length;
  const totalSections = rows.length;
  const overallPct = totalSections > 0 ? (completedCount / totalSections) * 100 : 0;
  const anyComplete = completedCount > 0;

  if (!w) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          No active walkthrough. Return home to start one.
        </p>
      </div>
    );
  }

  const goToSection = (row: SectionRow) => {
    if (row.isChecklist) {
      navigate({ to: "/wizard/checklist" });
      return;
    }
    if (row.firstQuestionId) {
      navigate({ to: "/wizard/q/$qid", params: { qid: row.firstQuestionId } });
    }
  };

  const startFromBeginning = () => {
    const first = navList[0];
    if (first) navigate({ to: "/wizard/q/$qid", params: { qid: first.id } });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Navy header */}
      <header
        className="sticky top-0 z-20 text-white shadow-[var(--shadow-soft)]"
        style={{ backgroundColor: getSectionColor(1) }}
      >
        <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLeaveOpen(true)}
              aria-label="Home"
              className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:bg-white/15"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-white/70">
              PropertyWalk
            </p>
            <button
              onClick={() => setLeaveOpen(true)}
              aria-label="Home"
              className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:bg-white/15"
            >
              <HomeIcon className="h-5 w-5" />
            </button>
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight">
            Where would you like to start?
          </h1>
          {(() => {
            const addr = formatPropertyAddress(w?.address);
            if (!addr) return null;
            return (
              <p className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold text-white">
                <MapPin className="h-4 w-4 shrink-0 text-white/80" aria-hidden />
                <span className="truncate">{addr}</span>
              </p>
            );
          })()}
          <p className="mt-1 text-sm text-white/80">
            Tap any section to begin. You can return here anytime from the menu.
          </p>
        </div>

        {/* Progress bar */}
        <div className="border-t border-white/10 bg-black/15">
          <div className="mx-auto w-full max-w-2xl px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-white/85">
              <span>
                {completedCount} of {totalSections} sections complete
              </span>
              <span>{Math.round(overallPct)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${Math.max(2, overallPct)}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const Icon = row.icon;
              const color = getSectionColor(row.index);
              const isComplete = row.status === "complete";
              const inProgress = row.status === "in_progress";
              const borderColor = row.status === "todo" ? "#D1D5DB" : color;
              return (
                <button
                  key={row.index}
                  type="button"
                  onClick={() => goToSection(row)}
                  className={cn(
                    "group relative flex min-h-[90px] w-full items-start gap-3 rounded-2xl bg-card p-4 text-left shadow-sm transition-all active:scale-[0.99] hover:shadow-md",
                    isComplete && "bg-accent/5",
                  )}
                  style={{ borderLeft: `6px solid ${borderColor}` }}
                >
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${color}15`, color }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Section {row.index}
                    </p>
                    <p className="mt-0.5 text-[15px] font-bold leading-tight text-foreground">
                      {row.name}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {row.isChecklist
                        ? "Final checks before submit"
                        : `${row.total} question${row.total === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-center">
                    {isComplete ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : inProgress ? (
                      <span
                        aria-label="In progress"
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: "#2563EB" }}
                      />
                    ) : (
                      <span
                        aria-label="Not started"
                        className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/40"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer actions */}
      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-2xl space-y-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          <button
            type="button"
            onClick={startFromBeginning}
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99]"
          >
            Start from Beginning →
          </button>
          {anyComplete && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (allComplete) {
                    navigate({ to: "/wizard/checklist" });
                  } else {
                    setReviewWarnOpen(true);
                  }
                }}
                title={allComplete ? undefined : "Complete all sections to submit"}
                className={cn(
                  "inline-flex h-12 w-full items-center justify-center rounded-2xl border-2 text-sm font-semibold transition-all active:scale-[0.99]",
                  allComplete
                    ? "border-border bg-card text-foreground hover:border-accent/40"
                    : "border-border bg-muted text-muted-foreground hover:border-warning/50",
                )}
              >
                {allComplete
                  ? "Review & Submit"
                  : `Review & Submit (${incompleteCount} incomplete)`}
              </button>
              {!allComplete && (
                <p className="text-center text-[11px] font-medium text-muted-foreground">
                  Complete all sections to submit
                </p>
              )}
            </>
          )}
        </div>
      </footer>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave walkthrough?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress is saved automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setLeaveOpen(false);
                void navigate({ to: "/" });
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reviewWarnOpen} onOpenChange={setReviewWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {incompleteCount} {incompleteCount === 1 ? "section" : "sections"} incomplete
            </AlertDialogTitle>
            <AlertDialogDescription>
              You can review your walkthrough now, but you won't be able to upload to Google Drive
              until every required section is complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setReviewWarnOpen(false);
                void navigate({ to: "/wizard/checklist" });
              }}
            >
              Review anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
