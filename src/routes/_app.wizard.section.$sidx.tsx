import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Home as HomeIcon, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { NotesField } from "@/components/NotesField";
import { InlinePillGroup } from "@/components/InlinePillGroup";
import { RatingButtons } from "@/components/RatingButtons";
import {
  clearPoorPhotosIfNeeded,
  FieldRenderer,
  FollowUpRenderer,
  pickValue,
} from "@/components/WizardField";
import { getSectionColor } from "@/components/WizardLayout";
import {
  exitAdminEdit,
  formatPropertyAddress,
  isAdminEditing,
  loadActive,
  setAnswer,
  updateWalkthrough,
  type WizardAnswer,
  type Walkthrough,
} from "@/lib/walkthrough";
import {
  buildQuestionList,
  hasUserAnswer,
  
  SECTIONS,
  
  type SkipContext,
} from "@/lib/wizard-schema";

export const Route = createFileRoute("/_app/wizard/section/$sidx")({
  component: SectionScreen,
});

function SectionScreen() {
  const { sidx } = useParams({ from: "/_app/wizard/section/$sidx" });
  const navigate = useNavigate();
  const sectionIndex = Number(sidx);

  const [tick, setTick] = useState(0);
  const w: Walkthrough | null = useMemo(() => loadActive(), [tick]);
  const adminEditing = useMemo(() => isAdminEditing(), [tick]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  

  // Local drafts keyed by question id, for snappy editing.
  const [drafts, setDrafts] = useState<Record<string, WizardAnswer>>({});

  const ctx: SkipContext = useMemo(
    () => ({
      config: w?.config ?? {},
      answers: { ...(w?.answers ?? {}), ...drafts } as SkipContext["answers"],
    }),
    [w, drafts],
  );

  const list = useMemo(() => buildQuestionList(ctx), [ctx]);
  const sectionQs = useMemo(
    () => list.filter((q) => q.sectionIndex === sectionIndex),
    [list, sectionIndex],
  );
  const section = SECTIONS.find((s) => s.index === sectionIndex);

  // Initialize drafts from saved answers for any question in this section.
  useEffect(() => {
    if (!w) return;
    const next: Record<string, WizardAnswer> = {};
    for (const q of sectionQs) {
      next[q.id] = (w.answers?.[q.id] as WizardAnswer | undefined) ?? {};
    }
    setDrafts((prev) => {
      // Preserve any pending edits already in-flight.
      const merged: Record<string, WizardAnswer> = { ...next };
      for (const k of Object.keys(prev)) {
        if (sectionQs.some((q) => q.id === k)) merged[k] = prev[k];
      }
      return merged;
    });
    updateWalkthrough({ lastRoute: `/wizard/section/${sectionIndex}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIndex, w?.id]);

  // Debounced auto-save per draft change.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      for (const [qid, val] of Object.entries(drafts)) {
        setAnswer(qid, val);
      }
      setTick((n) => n + 1);
    }, 200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  if (!w || !section) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {w ? "Section not found." : "No active walkthrough."}
        </p>
      </div>
    );
  }

  const color = getSectionColor(sectionIndex);
  const totalSections = SECTIONS.length;

  // Find next section index (skip empty/skipped sections).
  const findNextSection = (): number | null => {
    for (let i = sectionIndex + 1; i <= totalSections; i++) {
      const items = list.filter((q) => q.sectionIndex === i);
      if (items.length > 0) return i;
    }
    return null;
  };
  const nextSidx = findNextSection();

  const answeredCount = sectionQs.filter((q) =>
    hasUserAnswer(q, ctx.answers[q.id]),
  ).length;

  const handleContinue = () => {
    if (nextSidx) {
      void navigate({
        to: "/wizard/section/$sidx",
        params: { sidx: String(nextSidx) },
      });
    } else {
      void navigate({ to: "/wizard/complete" });
    }
  };


  const setDraftFor = (
    qid: string,
    updater: WizardAnswer | ((prev: WizardAnswer) => WizardAnswer),
  ) => {
    setDrafts((prev) => {
      const cur = prev[qid] ?? {};
      const next = typeof updater === "function" ? updater(cur) : updater;
      return { ...prev, [qid]: next };
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Compact sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pb-2 pt-[max(env(safe-area-inset-top),0.6rem)]">
          <button
            type="button"
            onClick={() => void navigate({ to: "/wizard/menu" })}
            aria-label="Back to sections"
            className="-ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Section {sectionIndex} of {totalSections}
            </p>
            <p className="truncate text-[15px] font-bold leading-tight text-foreground">
              {section.name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLeaveOpen(true)}
            aria-label="Home"
            className="-mr-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <HomeIcon className="h-5 w-5" />
          </button>
        </div>
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(to right, ${color} ${
              sectionQs.length === 0
                ? 0
                : Math.round((answeredCount / sectionQs.length) * 100)
            }%, transparent 0)`,
          }}
        />
      </header>

      {/* Property address */}
      {(() => {
        const addr = formatPropertyAddress(w.address);
        if (!addr) return null;
        return (
          <div className="border-b border-border bg-muted/40">
            <div className="mx-auto flex w-full max-w-2xl items-center gap-1.5 truncate px-4 py-2 text-[12px] font-medium text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{addr}</span>
            </div>
          </div>
        );
      })()}

      {/* Long-scroll body */}
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <div
            className="overflow-hidden rounded-2xl border border-border"
            style={{ backgroundColor: `${color}10` }}
          >
            {/* Section header band */}
            <div
              className="border-b border-border px-5 py-4"
              style={{ backgroundColor: `${color}1f` }}
            >
              <h1
                className="text-xl font-bold leading-tight"
                style={{ color }}
              >
                {section.name}
              </h1>
              {sectionQs.length > 0 && (
                <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                  {answeredCount} of {sectionQs.length} answered
                </p>
              )}
            </div>

            {/* Questions */}
            <div className="space-y-5 bg-card/60 px-4 py-5 sm:px-5">
              {(() => {
                // Color palette for Interior sub-sections.
                const subColor = (sub: string | undefined): string => {
                  if (!sub) return color;
                  if (/^bedroom/i.test(sub)) return "#a855f7"; // purple
                  switch (sub) {
                    case "Living Room":
                      return "#0ea5e9"; // sky blue
                    case "Kitchen":
                      return "#f97316"; // orange
                    case "Hallways":
                      return "#14b8a6"; // teal
                    case "Laundry":
                      return "#ec4899"; // pink
                    default:
                      return color;
                  }
                };
                let lastSub: string | undefined = undefined;
                const nodes: React.ReactNode[] = [];
                sectionQs.forEach((q) => {
                  if (q.subSection && q.subSection !== lastSub) {
                    lastSub = q.subSection;
                    const sc = subColor(q.subSection);
                    nodes.push(
                      <div
                        key={`sub-${q.id}`}
                        className="-mx-1 mt-2 first:mt-0 rounded-xl border-l-4 px-3 py-2"
                        style={{ borderColor: sc, backgroundColor: `${sc}14` }}
                      >
                        <h2
                          className="text-sm font-bold uppercase tracking-wide"
                          style={{ color: sc }}
                        >
                          {q.subSection}
                        </h2>
                      </div>,
                    );
                  }
                  const value = drafts[q.id] ?? {};
                  const hasInlineRating = q.field === "rating" || q.withRating === true;
                  const isInlineYesNo = q.field === "yesno";
                  const isInlineChoice =
                    q.field === "choice" &&
                    Array.isArray(q.options) &&
                    q.options.length >= 2 &&
                    q.options.length <= 4;
                  const isPhotoField = q.field === "photo" || q.field === "video";
                  const handledInline = hasInlineRating || isInlineYesNo || isInlineChoice;
                  const skipOuterLabel = isPhotoField;
                  const subTextColor = subColor(q.subSection);
                  nodes.push(
                    <div key={q.id} id={`q-${q.id}`} className="scroll-mt-24">
                      {!skipOuterLabel && (
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
                          <label
                            className="block text-sm font-semibold"
                            style={{ color: q.subSection ? subTextColor : undefined }}
                          >
                            {q.label}
                          </label>

                          {hasInlineRating && (
                            <RatingButtons
                              value={value.rating}
                              onChange={(r: import("@/lib/walkthrough").Rating) =>
                                setDraftFor(q.id, (d) => clearPoorPhotosIfNeeded({ ...d, rating: r }, r))
                              }
                            />
                          )}
                          {isInlineYesNo && (
                            <InlinePillGroup
                              options={[
                                { label: "Yes", selected: value.bool === true, onClick: () => setDraftFor(q.id, (d) => ({ ...d, bool: true })), tone: "good" },
                                { label: "No", selected: value.bool === false, onClick: () => setDraftFor(q.id, (d) => ({ ...d, bool: false })), tone: "neutral" },
                              ]}
                            />
                          )}
                          {isInlineChoice && (
                            <InlinePillGroup
                              options={(q.options ?? []).map((opt) => ({
                                label: opt,
                                selected: value.choice === opt,
                                onClick: () => setDraftFor(q.id, (d) => ({ ...d, choice: opt })),
                                tone: "neutral",
                              }))}
                            />
                          )}
                        </div>
                      )}
                      {q.helper && q.field !== "text" && q.field !== "longtext" && (
                        <p className="mb-2 text-xs text-muted-foreground">
                          {q.helper}
                        </p>
                      )}
                      {!handledInline && (
                        <FieldRenderer
                          q={q}
                          value={value}
                          onChange={(v) => setDraftFor(q.id, v)}
                          attempted={false}
                          inlinePhotoLabel={isPhotoField}
                        />
                      )}
                      {handledInline && hasInlineRating && (
                        <FieldRenderer
                          q={q}
                          value={value}
                          onChange={(v) => setDraftFor(q.id, v)}
                          attempted={false}
                          suppressRating
                          suppressChoice={isInlineChoice}
                        />
                      )}
                      {q.followUp && q.followUp.when(pickValue(q, value)) && (
                        <div className="mt-3">
                          <FollowUpRenderer
                            q={q}
                            value={value}
                            onChange={(v) => setDraftFor(q.id, v)}
                            attempted={false}
                          />
                        </div>
                      )}
                    </div>,
                  );
                });
                return nodes;
              })()}

              <div className="flex items-start gap-2 rounded-xl bg-accent/5 p-3 text-xs text-accent">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>Auto-saves as you go.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky footer */}
      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          <button
            onClick={handleContinue}
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-primary/90 active:scale-[0.99]"
          >
            {nextSidx
              ? `Save & Continue → Section ${nextSidx}`
              : "Save & Continue → Review"}
          </button>
          <button
            onClick={() => void navigate({ to: "/wizard/menu" })}
            className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Back to section menu
          </button>
        </div>
      </footer>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {adminEditing ? "Exit admin edit?" : "Leave walkthrough?"}
          </AlertDialogTitle>
          <AlertDialogHeader>
            <AlertDialogDescription>
              Your progress is saved automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setLeaveOpen(false);
                if (adminEditing) {
                  void exitAdminEdit().then(() => navigate({ to: "/admin" }));
                } else {
                  void navigate({ to: "/" });
                }
              }}
            >
              {adminEditing ? "Exit" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
