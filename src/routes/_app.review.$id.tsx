import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, CloudUpload, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { resolvePhotoSrc } from "@/lib/photo-store";
import {
  fetchById,
  formatTimestamp,
  getCompletedLocalById,
  loadActive,
  type Walkthrough,
  type WizardAnswer,
} from "@/lib/walkthrough";
import {
  buildQuestionList,
  collectCriticalFlags,
  FINAL_CHECKLIST_ITEMS,
  SECTIONS,
  type QuestionDef,
  type SkipContext,
} from "@/lib/wizard-schema";

export const Route = createFileRoute("/_app/review/$id")({
  component: ReviewScreen,
});

const RATING_LABEL: Record<number, string> = { 1: "Good", 2: "Fair", 3: "Poor" };
const RATING_DOT: Record<number, string> = {
  1: "bg-rating-good",
  2: "bg-rating-fair",
  3: "bg-rating-poor",
};

function ReviewScreen() {
  const { id } = useParams({ from: "/_app/review/$id" });
  const navigate = useNavigate();
  const [walk, setWalk] = useState<Walkthrough | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const local = getCompletedLocalById(id);
    if (local) {
      setWalk(local);
      setLoading(false);
      // If the walkthrough was just completed (within last 60s), show banner.
      if (local.completedAt && Date.now() - local.completedAt < 60_000) setShowBanner(true);
      return;
    }
    const active = loadActive();
    if (active && active.id === id) {
      setWalk(active);
      setLoading(false);
      return;
    }
    fetchById(id)
      .then((w) => {
        if (cancelled) return;
        if (w) setWalk(w);
        else setNotFound(true);
      })
      .catch(() => !cancelled && setNotFound(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const ctx: SkipContext | null = useMemo(
    () =>
      walk
        ? { config: walk.config ?? {}, answers: (walk.answers ?? {}) as SkipContext["answers"] }
        : null,
    [walk],
  );

  const allQuestions = useMemo(() => (ctx ? buildQuestionList(ctx) : []), [ctx]);
  const critical = useMemo(() => (ctx ? collectCriticalFlags(ctx) : []), [ctx]);

  const totals = useMemo(() => {
    let photos = 0;
    let videos = 0;
    if (!walk) return { photos, videos };
    for (const q of allQuestions) {
      const a = walk.answers?.[q.id] as WizardAnswer | undefined;
      const n = a?.photos?.length ?? 0;
      if (q.field === "video") videos += n;
      else photos += n;
    }
    return { photos, videos };
  }, [walk, allQuestions]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!walk || !ctx || notFound) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-xl font-bold text-foreground">Walkthrough unavailable</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          No walkthrough data found. Please start a new walkthrough.
        </p>
        <Link
          to="/"
          className="mt-2 inline-flex h-12 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          Back to home
        </Link>
      </div>
    );
  }

  const addr = walk.address;
  const addressLine = [addr.houseNumber, addr.streetName].filter(Boolean).join(" ");
  const fullAddress = [addressLine, addr.city].filter(Boolean).join(", ");

  // Group questions by section
  const grouped: { section: { index: number; name: string }; questions: QuestionDef[] }[] = [];
  for (const s of SECTIONS) {
    const questions = allQuestions.filter((q) => q.sectionIndex === s.index);
    if (questions.length > 0) grouped.push({ section: { index: s.index, name: s.name }, questions });
  }

  // Final checklist as a synthetic section
  const checklistAns = (walk.answers?.["s17_final_checklist"] as WizardAnswer | undefined)?.checklist ?? {};
  const visibleChecklist = FINAL_CHECKLIST_ITEMS.filter((it) => !it.visible || it.visible(walk.config ?? {}));

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Link
            to="/walkthroughs"
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Review</p>
            <h1 className="truncate text-lg font-bold text-foreground">{fullAddress || "Walkthrough"}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {showBanner && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl bg-success/10 p-4 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="font-semibold">Walkthrough complete! Review your report below.</p>
          </div>
        )}

        {walk.completedAt && (
          <p className="mb-2 text-sm text-muted-foreground">
            Completed {formatTimestamp(walk.completedAt)}
          </p>
        )}

        <div className="mb-6 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-accent/10 px-3 py-1 text-accent">
            {totals.photos} photos
          </span>
          <span className="rounded-full bg-accent/10 px-3 py-1 text-accent">
            {totals.videos} videos
          </span>
          <span
            className={cn(
              "rounded-full px-3 py-1",
              critical.length > 0 ? "bg-critical/10 text-critical" : "bg-muted text-muted-foreground",
            )}
          >
            {critical.length} critical flags
          </span>
        </div>

        {critical.length > 0 && (
          <section className="mb-6 rounded-2xl border-2 border-critical bg-critical/5 p-4">
            <div className="flex items-center gap-2 text-critical">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="text-sm font-bold uppercase tracking-wide">Critical issues flagged</h2>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {critical.map((c) => (
                <li key={c.questionId} className="rounded-xl bg-card p-3">
                  <p className="font-semibold text-foreground">{c.label}</p>
                  {c.notes && <p className="mt-1 text-muted-foreground">{c.notes}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Accordion type="multiple" className="space-y-2">
          {grouped.map(({ section, questions }) => {
            const allDone = questions.every((q) => Boolean(walk.answers?.[q.id]));
            return (
              <AccordionItem
                key={section.index}
                value={`s-${section.index}`}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="text-left">
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                        Section {section.index}
                      </p>
                      <p className="text-base font-bold text-foreground">{section.name}</p>
                    </div>
                    {allDone && <CheckCircle2 className="h-5 w-5 text-success" />}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <div className="space-y-4">
                    {questions.map((q) => (
                      <AnswerRow key={q.id} q={q} a={walk.answers?.[q.id] as WizardAnswer | undefined} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}

          {/* Section 17 — final checklist */}
          <AccordionItem value="s-17" className="overflow-hidden rounded-2xl border border-border bg-card">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="text-left">
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Section 17</p>
                  <p className="text-base font-bold text-foreground">Final Checklist</p>
                </div>
                {visibleChecklist.every((i) => checklistAns[i.id]) && (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <ul className="space-y-2 text-sm">
                {visibleChecklist.map((it) => (
                  <li key={it.id} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-4 w-4 rounded border",
                        checklistAns[it.id] ? "border-success bg-success" : "border-input",
                      )}
                    />
                    <span className={checklistAns[it.id] ? "text-foreground" : "text-muted-foreground"}>
                      {it.label}
                    </span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-8 flex flex-col gap-3">
          <button
            disabled
            title="Coming in Phase 5"
            className="inline-flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-border bg-muted px-6 text-sm font-semibold text-muted-foreground"
          >
            <CloudUpload className="h-4 w-4" />
            Upload to Google Drive (coming soon)
          </button>
          <button
            onClick={() => navigate({ to: "/walkthroughs", search: { tab: "completed" } as never })}
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Back to My Walkthroughs
          </button>
        </div>
      </main>
    </div>
  );
}

function AnswerRow({ q, a }: { q: QuestionDef; a: WizardAnswer | undefined }) {
  return (
    <div className="border-l-2 border-border pl-3">
      <p className="text-sm font-semibold text-foreground">
        {q.critical && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-critical" />}
        {q.label}
      </p>
      <div className="mt-1 space-y-1 text-sm text-muted-foreground">
        {a?.text && <p>{a.text}</p>}
        {a?.number !== undefined && <p>{a.number}</p>}
        {a?.bool !== undefined && <p>{a.bool ? "Yes" : "No"}</p>}
        {a?.choice && <p>{a.choice}</p>}
        {a?.choices && a.choices.length > 0 && <p>{a.choices.join(", ")}</p>}
        {a?.rating !== undefined && (
          <p className="flex items-center gap-1.5">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", RATING_DOT[a.rating])} />
            <span>{RATING_LABEL[a.rating]}</span>
          </p>
        )}
        {a?.notes && <p className="italic">" {a.notes} "</p>}
        {!a && <p className="italic">No answer</p>}
      </div>
      {a?.photos && a.photos.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {a.photos.map((entry, i) => {
            const src = resolvePhotoSrc(entry);
            return (
              <div key={i} className="relative aspect-square overflow-hidden rounded-lg bg-secondary">
                {src && (q.field === "video" ? (
                  <video src={src} className="h-full w-full object-cover" controls />
                ) : (
                  <img src={src} alt={a.photoNames?.[i] ?? `${q.label} ${i + 1}`} className="h-full w-full object-cover" />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Suppress unused import warning for ChevronDown (tree-shaken) without removing
// from imports — keeps file deterministic.
void ChevronDown;
