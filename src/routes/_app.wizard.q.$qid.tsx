import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ChoiceGrid } from "@/components/ChoiceGrid";
import { NotesField } from "@/components/NotesField";
import { PhotoCapture } from "@/components/PhotoCapture";
import { RatingButtons } from "@/components/RatingButtons";
import { SectionNav, type SectionMeta, type SectionStatus } from "@/components/SectionNav";
import { WizardLayout } from "@/components/WizardLayout";
import { cn } from "@/lib/utils";
import { loadActive, setAnswer, updateWalkthrough, type Rating, type WizardAnswer } from "@/lib/walkthrough";
// loadActive is used in the initial state hydration (via useMemo above).
import {
  buildQuestionList,
  isQuestionAnswered,
  SECTIONS,
  type QuestionDef,
  type SkipContext,
} from "@/lib/wizard-schema";

export const Route = createFileRoute("/_app/wizard/q/$qid")({
  component: QuestionScreen,
});

function QuestionScreen() {
  const { qid } = useParams({ from: "/_app/wizard/q/$qid" });
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { from?: string; reviewId?: string };
  const editingFromReview = search?.from === "review" && !!search?.reviewId;

  // Source draft from cache. We rebuild context every render so visibility
  // and follow-up logic always reflects the latest answers.
  const [tick, setTick] = useState(0);
  const w = useMemo(() => loadActive(), [tick, qid]);

  const ctx: SkipContext = useMemo(
    () => ({ config: w?.config ?? {}, answers: (w?.answers ?? {}) as SkipContext["answers"] }),
    [w],
  );

  const list = useMemo(() => buildQuestionList(ctx), [ctx]);
  // Navigation list excludes companion-rendered questions.
  const navList = useMemo(() => list.filter((x) => !x.renderedByCompanion), [list]);
  const idx = navList.findIndex((q) => q.id === qid);
  const q = idx >= 0 ? navList[idx] : undefined;

  // Resolve companion QuestionDefs (still inside `list`).
  const companionDefs = useMemo<QuestionDef[]>(() => {
    if (!q?.companions) return [];
    return q.companions
      .map((cid) => list.find((x) => x.id === cid))
      .filter((x): x is QuestionDef => Boolean(x));
  }, [q, list]);

  const [attempted, setAttempted] = useState(false);
  const [savedAt, setSavedAt] = useState<number | undefined>();

  // Local working copy of the current answer so typing feels snappy.
  const [draft, setDraft] = useState<WizardAnswer>({});
  // Companion drafts keyed by companion question id.
  const [compDrafts, setCompDrafts] = useState<Record<string, WizardAnswer>>({});

  useEffect(() => {
    setAttempted(false);
    setDraft((w?.answers?.[qid] as WizardAnswer | undefined) ?? {});
    const next: Record<string, WizardAnswer> = {};
    for (const c of companionDefs) {
      next[c.id] = (w?.answers?.[c.id] as WizardAnswer | undefined) ?? {};
    }
    setCompDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid, w?.id]);

  useEffect(() => {
    if (!q) return;
    updateWalkthrough({ lastRoute: `/wizard/q/${qid}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid]);

  // Auto-save primary question.
  useEffect(() => {
    if (!q) return;
    const t = setTimeout(() => {
      const next = setAnswer(qid, draft);
      if (next) {
        setSavedAt(next.updatedAt);
        // Trigger re-derivation so follow-ups appear/disappear.
        setTick((n) => n + 1);
      }
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, qid]);

  // Auto-save each companion answer to its own id.
  useEffect(() => {
    if (!q) return;
    const t = setTimeout(() => {
      for (const [cid, val] of Object.entries(compDrafts)) {
        const next = setAnswer(cid, val);
        if (next) setSavedAt(next.updatedAt);
      }
      setTick((n) => n + 1);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compDrafts, qid]);

  if (!w) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">No active walkthrough. Return home to start one.</p>
      </div>
    );
  }

  if (!q) {
    // If qid is a companion, redirect to its owning primary.
    const owner = list.find((x) => x.companions?.includes(qid));
    if (owner) {
      void navigate({ to: "/wizard/q/$qid", params: { qid: owner.id }, replace: true });
      return null;
    }
    // Unknown question id — fall through to checklist (defensive).
    void navigate({ to: "/wizard/checklist" });
    return null;
  }

  const ctxWithDraft: SkipContext = {
    config: ctx.config,
    answers: {
      ...ctx.answers,
      [qid]: draft as SkipContext["answers"][string],
      ...Object.fromEntries(
        Object.entries(compDrafts).map(([cid, v]) => [cid, v as SkipContext["answers"][string]]),
      ),
    },
  };
  const primaryValid = isQuestionAnswered(q, ctxWithDraft.answers[qid]);
  const companionsValid = companionDefs.every((c) =>
    isQuestionAnswered(c, ctxWithDraft.answers[c.id]),
  );
  const valid = primaryValid && companionsValid;

  // Progress and counters use the FULL list including companions.
  const totalQ = list.length;
  const sectionList = list.filter((x) => x.sectionIndex === q.sectionIndex);
  // Find position of the primary in the section (companions are co-located).
  const sectionPos = sectionList.findIndex((x) => x.id === qid) + 1;
  const totalInSection = sectionList.length;
  const answeredCount = list.filter((x) => isQuestionAnswered(x, ctxWithDraft.answers[x.id])).length;
  const progress = (answeredCount / totalQ) * 100;

  const goNext = () => {
    if (!valid) {
      setAttempted(true);
      return;
    }
    const freshCtx: SkipContext = {
      config: ctx.config,
      answers: {
        ...ctx.answers,
        [qid]: draft as SkipContext["answers"][string],
        ...Object.fromEntries(
          Object.entries(compDrafts).map(([cid, v]) => [cid, v as SkipContext["answers"][string]]),
        ),
      },
    };
    const refreshedFull = buildQuestionList(freshCtx);
    const refreshedNav = refreshedFull.filter((x) => !x.renderedByCompanion);
    const here = refreshedNav.findIndex((x) => x.id === qid);
    const next = here >= 0 ? refreshedNav[here + 1] : undefined;
    if (next) {
      navigate({ to: "/wizard/q/$qid", params: { qid: next.id } });
    } else {
      navigate({ to: "/wizard/checklist" });
    }
    setTimeout(() => {
      setAnswer(qid, draft);
      for (const [cid, val] of Object.entries(compDrafts)) {
        setAnswer(cid, val);
      }
    }, 0);
  };

  // ----- Section navigation drawer -----
  const [navOpen, setNavOpen] = useState(false);

  const sections: SectionMeta[] = useMemo(() => {
    // Group the resolved primary-only list by section index for status calc.
    const byIndex = new Map<number, QuestionDef[]>();
    for (const item of navList) {
      const arr = byIndex.get(item.sectionIndex) ?? [];
      arr.push(item);
      byIndex.set(item.sectionIndex, arr);
    }
    const ans = ctxWithDraft.answers;
    const out: SectionMeta[] = [];
    for (const s of SECTIONS) {
      const items = byIndex.get(s.index) ?? [];
      const isCurrent = s.index === q.sectionIndex;
      // Detect skipped sections by config.
      let skipReason: string | undefined;
      if (items.length === 0) {
        if (s.index === 4 && (!ctx.config.garage || ctx.config.garage === "None")) {
          skipReason = "Skipped — No garage selected";
        } else if (s.index === 6 && ctx.config.pool !== "Yes") {
          skipReason = "Skipped — No pool selected";
        } else {
          skipReason = "Skipped";
        }
      }
      // Find first unanswered (or first overall) primary question.
      const firstUnanswered = items.find((x) => !isQuestionAnswered(x, ans[x.id]));
      const firstQuestionId = (firstUnanswered ?? items[0])?.id;
      const allAnswered = items.length > 0 && items.every((x) => isQuestionAnswered(x, ans[x.id]));
      const hasFlaggedIssue = items.some((x) => {
        if (!x.critical) return false;
        const a = ans[x.id];
        // Critical issue raised when a yesno critical was answered Yes.
        return a?.bool === true;
      });
      let status: SectionStatus;
      if (skipReason) status = "skipped";
      else if (isCurrent) status = "current";
      else if (hasFlaggedIssue) status = "flagged";
      else if (allAnswered) status = "complete";
      else status = "todo";
      out.push({
        index: s.index,
        name: s.name,
        status,
        firstQuestionId,
        skipReason,
      });
    }
    // Section 17 — Final Checklist (lives on its own route).
    out.push({
      index: 17,
      name: "Final Checklist",
      status: q.sectionIndex === 17 ? "current" : "todo",
      route: "/wizard/checklist",
    });
    // Section 18 — Review.
    out.push({
      index: 18,
      name: "Review",
      status: q.sectionIndex === 18 ? "current" : "todo",
      route: "/wizard/checklist",
    });
    return out;
  }, [navList, ctxWithDraft.answers, ctx.config, q.sectionIndex]);

  const persistDraft = () => {
    setAnswer(qid, draft);
    for (const [cid, val] of Object.entries(compDrafts)) {
      setAnswer(cid, val);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label="Open section navigation"
        className="fixed left-2 top-[max(env(safe-area-inset-top),0.75rem)] z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-secondary active:bg-secondary"
      >
        <Menu className="h-5 w-5" />
      </button>

      <SectionNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        currentSectionIndex={q.sectionIndex}
        sections={sections}
        onNavigate={() => persistDraft()}
        onGoHome={() => persistDraft()}
      />

    <WizardLayout
      sectionIndex={q.sectionIndex}
      sectionName={q.sectionName}
      questionIndex={sectionPos}
      totalQuestions={totalInSection}
      progress={progress}
      lastSavedAt={savedAt}
      canContinue={valid}
      onNext={goNext}
      onAttemptNext={() => setAttempted(true)}
    >
      {editingFromReview && (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border-2 border-warning bg-warning/15 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-warning-foreground">
            ✏️ Editing — changes save automatically
          </p>
          <button
            type="button"
            onClick={() => {
              persistDraft();
              navigate({
                to: "/review/$id",
                params: { id: search.reviewId! },
              });
            }}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-card px-3 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Review
          </button>
        </div>
      )}

      <div
        className={cn(
          "rounded-2xl",
          q.critical && "border-2 border-critical bg-critical/5 p-4",
        )}
      >
        <div className="flex items-start gap-2">
          {q.critical && <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-critical" />}
          <div className="flex-1">
            <h2 className="text-2xl font-bold leading-tight text-foreground">
              {q.label} {q.required && <span className="text-critical">*</span>}
            </h2>
            {q.helper && <p className="mt-1.5 text-sm text-muted-foreground">{q.helper}</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <FieldRenderer
          q={q}
          value={draft}
          onChange={setDraft}
          attempted={attempted}
        />

        {q.followUp && q.followUp.when(pickValue(q, draft)) && (
          <FollowUpRenderer
            q={q}
            value={draft}
            onChange={setDraft}
            attempted={attempted}
          />
        )}

        {q.field !== "longtext" && (!q.companions || q.companions.length === 0) && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Notes & Observations <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <NotesField
              value={draft.notes ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, notes: v }))}
              placeholder={q.notesPlaceholder ?? "Add any notes or observations here (optional)"}
            />
          </div>
        )}

        {companionDefs.map((c) => {
          const cVal = compDrafts[c.id] ?? {};
          const setCVal = (
            updater: WizardAnswer | ((prev: WizardAnswer) => WizardAnswer),
          ) => {
            setCompDrafts((prev) => {
              const cur = prev[c.id] ?? {};
              const nextVal =
                typeof updater === "function"
                  ? (updater as (p: WizardAnswer) => WizardAnswer)(cur)
                  : updater;
              return { ...prev, [c.id]: nextVal };
            });
          };
          return (
            <div key={c.id} className="space-y-4">
              <div className="border-t border-border pt-4">
                <p className="text-base font-semibold text-foreground">
                  {c.label} {c.required && <span className="text-critical">*</span>}
                </p>
                {c.helper && (
                  <p className="mt-1 text-sm text-muted-foreground">{c.helper}</p>
                )}
              </div>
              <FieldRenderer
                q={c}
                value={cVal}
                onChange={setCVal}
                attempted={attempted}
              />
              {c.followUp && c.followUp.when(pickValue(c, cVal)) && (
                <FollowUpRenderer
                  q={c}
                  value={cVal}
                  onChange={setCVal}
                  attempted={attempted}
                />
              )}
            </div>
          );
        })}

        {q.companions && q.companions.length > 0 && q.field !== "longtext" && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Notes & Observations <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <NotesField
              value={draft.notes ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, notes: v }))}
              placeholder="Add any notes or observations here (optional)"
            />
          </div>
        )}

        {!q.critical && q.field !== "yesno" && (
          <div className="flex items-start gap-2 rounded-xl bg-accent/5 p-3 text-xs text-accent">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>Auto-saves as you go.</p>
          </div>
        )}
      </div>
    </WizardLayout>
    </>
  );
}


function pickValue(q: QuestionDef, ans: WizardAnswer): unknown {
  switch (q.field) {
    case "yesno":
      return ans.bool;
    case "rating":
      return ans.rating;
    case "choice":
      return ans.choice;
    case "multichoice":
      return ans.choices;
    case "text":
    case "longtext":
      return ans.text;
    case "number":
      return ans.number;
    default:
      return undefined;
  }
}


function FieldRenderer({
  q,
  value,
  onChange,
  attempted,
}: {
  q: QuestionDef;
  value: WizardAnswer;
  onChange: (v: WizardAnswer | ((prev: WizardAnswer) => WizardAnswer)) => void;
  attempted: boolean;
}) {
  const errored = attempted && !isAnsweredLocal(q, value);

  switch (q.field) {
    case "text":
      return (
        <>
          <input
            value={value.text ?? ""}
            onChange={(e) => onChange((d) => ({ ...d, text: e.target.value }))}
            placeholder={q.helper ?? ""}
            className={cn(
              "h-14 w-full rounded-2xl border-2 bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
              errored && q.required ? "field-error" : "border-input",
            )}
          />
          {q.withRating && (
            <div>
              <p className="mb-2 mt-4 text-sm font-semibold text-foreground">
                Condition rating <span className="text-critical">*</span>
              </p>
              <RatingButtons
                value={value.rating}
                onChange={(r: Rating) => onChange((d) => clearPoorPhotosIfNeeded({ ...d, rating: r }, r))}
                error={attempted && value.rating === undefined}
              />
              <PoorPhotoSection q={q} value={value} onChange={onChange} attempted={attempted} />
            </div>
          )}
        </>
      );

    case "longtext":
      return (
        <NotesField
          value={value.text ?? ""}
          onChange={(v) => onChange((d) => ({ ...d, text: v }))}
          placeholder={q.helper ?? ""}
        />
      );

    case "number":
      return (
        <input
          type="number"
          inputMode="numeric"
          value={value.number ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? undefined : Number(e.target.value);
            onChange((d) => ({ ...d, number: n }));
          }}
          className={cn(
            "h-14 w-full rounded-2xl border-2 bg-card px-4 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
            errored ? "field-error" : "border-input",
          )}
        />
      );

    case "yesno":
      return (
        <div className="grid grid-cols-2 gap-3">
          {(["Yes", "No"] as const).map((label) => {
            const isYes = label === "Yes";
            const selected = value.bool === isYes;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onChange((d) => ({ ...d, bool: isYes }))}
                className={cn(
                  "min-h-14 rounded-2xl border-2 px-4 py-3 text-base font-semibold transition-all active:scale-95",
                  selected
                    ? "border-accent bg-accent text-accent-foreground shadow-[var(--shadow-soft)]"
                    : errored
                      ? "field-error border-input bg-card text-foreground"
                      : "border-border bg-card text-foreground hover:border-accent/40",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      );

    case "choice":
      return (
        <>
          <ChoiceGrid
            label=""
            options={q.options ?? []}
            value={value.choice}
            onChange={(v) => onChange((d) => ({ ...d, choice: v }))}
            columns={Math.min(q.options?.length ?? 2, 4)}
          />
          {q.withRating && (
            <div>
              <p className="mb-2 mt-4 text-sm font-semibold text-foreground">
                Condition rating <span className="text-critical">*</span>
              </p>
              <RatingButtons
                value={value.rating}
                onChange={(r: Rating) => onChange((d) => clearPoorPhotosIfNeeded({ ...d, rating: r }, r))}
                error={attempted && value.rating === undefined}
              />
              <PoorPhotoSection q={q} value={value} onChange={onChange} attempted={attempted} />
            </div>
          )}
        </>
      );

    case "multichoice": {
      const selected = value.choices ?? [];
      return (
        <div className="grid grid-cols-2 gap-2">
          {(q.options ?? []).map((opt) => {
            const isOn = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  onChange((d) => {
                    const cur = d.choices ?? [];
                    return {
                      ...d,
                      choices: isOn ? cur.filter((x) => x !== opt) : [...cur, opt],
                    };
                  })
                }
                className={cn(
                  "min-h-12 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-all active:scale-95",
                  isOn
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground hover:border-accent/40",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    case "rating":
      return (
        <>
          <RatingButtons
            value={value.rating}
            onChange={(r) => onChange((d) => clearPoorPhotosIfNeeded({ ...d, rating: r }, r))}
            error={attempted && value.rating === undefined}
          />
          {q.withPhoto && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-foreground">
                Photo <span className="text-critical">*</span>
              </p>
              <LandscapeHint />
              <PhotoCapture
                photos={value.photos ?? []}
                filenames={value.photoNames ?? []}
                baseName={q.withPhoto.name}
                onChange={(photos, photoNames) => onChange((d) => ({ ...d, photos, photoNames }))}
                error={attempted && (value.photos?.length ?? 0) < (q.withPhoto.min ?? 1)}
              />
            </div>
          )}
          <PoorPhotoSection q={q} value={value} onChange={onChange} attempted={attempted} />
        </>
      );

    case "photo":
    case "video": {
      const isVideo = q.field === "video";
      return (
        <>
          {!isVideo && <LandscapeHint />}
          <PhotoCapture
            photos={value.photos ?? []}
            filenames={value.photoNames ?? []}
            baseName={q.photoName ?? q.id.toUpperCase()}
            isVideo={isVideo}
            onChange={(photos, photoNames) => onChange((d) => ({ ...d, photos, photoNames }))}
            error={errored}
          />
        </>
      );
    }
  }
}

function LandscapeHint() {
  return (
    <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
      <span>📐</span>
      Hold phone in landscape (horizontal) for all photos
    </p>
  );
}

function isAnsweredLocal(q: QuestionDef, ans: WizardAnswer): boolean {
  return isQuestionAnswered(q, ans as SkipContext["answers"][string]);
}

// When the user changes rating away from 3 (Poor), drop any poor-rating
// photos so they don't linger in the saved draft.
function clearPoorPhotosIfNeeded(d: WizardAnswer, r: Rating | undefined): WizardAnswer {
  if (r === 3) return d;
  if (!d.poorPhotos && !d.poorPhotoNames) return d;
  const next = { ...d };
  delete next.poorPhotos;
  delete next.poorPhotoNames;
  return next;
}

function PoorPhotoSection({
  q,
  value,
  onChange,
  attempted,
}: {
  q: QuestionDef;
  value: WizardAnswer;
  onChange: (v: WizardAnswer | ((prev: WizardAnswer) => WizardAnswer)) => void;
  attempted: boolean;
}) {
  if (value.rating !== 3 || !q.poorPhotoName) return null;
  const missing = (value.poorPhotos?.length ?? 0) < 1;
  return (
    <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <p className="mb-2 text-sm font-semibold text-critical">
        ⚠️ Photo required for Poor rating
      </p>
      <LandscapeHint />
      <PhotoCapture
        photos={value.poorPhotos ?? []}
        filenames={value.poorPhotoNames ?? []}
        baseName={q.poorPhotoName}
        onChange={(photos, photoNames) =>
          onChange((d) => ({ ...d, poorPhotos: photos, poorPhotoNames: photoNames }))
        }
        error={attempted && missing}
      />
    </div>
  );
}

function FollowUpRenderer({
  q,
  value,
  onChange,
  attempted,
}: {
  q: QuestionDef;
  value: WizardAnswer;
  onChange: (v: WizardAnswer | ((prev: WizardAnswer) => WizardAnswer)) => void;
  attempted: boolean;
}) {
  const fu = q.followUp!;
  return (
    <div className="rounded-2xl border-l-4 border-accent bg-accent/5 p-4">
      <p className="mb-2 text-sm font-semibold text-foreground">
        {fu.label} {fu.required && <span className="text-critical">*</span>}
      </p>
      {fu.field === "text" && (
        <NotesField
          value={value.notes ?? ""}
          onChange={(v) => onChange((d) => ({ ...d, notes: v }))}
          placeholder="Describe location and details"
        />
      )}
      {fu.field === "photo" && (
        <>
          <LandscapeHint />
          <PhotoCapture
            photos={value.photos ?? []}
            filenames={value.photoNames ?? []}
            baseName={fu.photoName ?? "FOLLOWUP"}
            onChange={(photos, photoNames) => onChange((d) => ({ ...d, photos, photoNames }))}
            error={attempted && fu.required && (value.photos?.length ?? 0) < 1}
          />
        </>
      )}
      {fu.field === "multichoice" && (
        <div className="grid grid-cols-2 gap-2">
          {(fu.options ?? []).map((opt) => {
            const selected = (value.choices ?? []).includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  onChange((d) => {
                    const cur = d.choices ?? [];
                    return {
                      ...d,
                      choices: selected ? cur.filter((x) => x !== opt) : [...cur, opt],
                    };
                  })
                }
                className={cn(
                  "min-h-11 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
