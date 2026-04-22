import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ChoiceGrid } from "@/components/ChoiceGrid";
import { NotesField } from "@/components/NotesField";
import { PhotoCapture } from "@/components/PhotoCapture";
import { RatingButtons } from "@/components/RatingButtons";
import { WizardLayout } from "@/components/WizardLayout";
import { cn } from "@/lib/utils";
import { loadActive, setAnswer, updateWalkthrough, type Rating, type WizardAnswer } from "@/lib/walkthrough";
import {
  buildQuestionList,
  isQuestionAnswered,
  type QuestionDef,
  type SkipContext,
} from "@/lib/wizard-schema";

export const Route = createFileRoute("/_app/wizard/q/$qid")({
  component: QuestionScreen,
});

function QuestionScreen() {
  const { qid } = useParams({ from: "/_app/wizard/q/$qid" });
  const navigate = useNavigate();

  // Source draft from cache. We rebuild context every render so visibility
  // and follow-up logic always reflects the latest answers.
  const [tick, setTick] = useState(0);
  const w = useMemo(() => loadActive(), [tick, qid]);

  const ctx: SkipContext = useMemo(
    () => ({ config: w?.config ?? {}, answers: (w?.answers ?? {}) as SkipContext["answers"] }),
    [w],
  );

  const list = useMemo(() => buildQuestionList(ctx), [ctx]);
  const idx = list.findIndex((q) => q.id === qid);
  const q = idx >= 0 ? list[idx] : undefined;

  const [attempted, setAttempted] = useState(false);
  const [savedAt, setSavedAt] = useState<number | undefined>();

  // Local working copy of the current answer so typing feels snappy.
  const [draft, setDraft] = useState<WizardAnswer>({});

  useEffect(() => {
    setAttempted(false);
    setDraft((w?.answers?.[qid] as WizardAnswer | undefined) ?? {});
  }, [qid, w?.id]);

  useEffect(() => {
    if (!q) return;
    updateWalkthrough({ lastRoute: `/wizard/q/${qid}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid]);

  // Auto-save every change.
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

  if (!w) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">No active walkthrough. Return home to start one.</p>
      </div>
    );
  }

  if (!q) {
    // Unknown question id — fall through to checklist (defensive).
    void navigate({ to: "/wizard/checklist" });
    return null;
  }

  const ctxWithDraft: SkipContext = {
    config: ctx.config,
    answers: { ...ctx.answers, [qid]: draft as SkipContext["answers"][string] },
  };
  const valid = isQuestionAnswered(q, ctxWithDraft.answers[qid]);
  const totalQ = list.length;
  // Question index within its section
  const sectionList = list.filter((x) => x.sectionIndex === q.sectionIndex);
  const sectionPos = sectionList.findIndex((x) => x.id === qid) + 1;
  const totalInSection = sectionList.length;
  // Overall progress across all required questions answered
  const answeredCount = list.filter((x) => isQuestionAnswered(x, ctx.answers[x.id])).length;
  const progress = (answeredCount / totalQ) * 100;

  const goNext = () => {
    if (!valid) {
      setAttempted(true);
      return;
    }
    // Persist immediately and recompute next question against fresh state.
    setAnswer(qid, draft);
    const refreshed = loadActive();
    const freshCtx: SkipContext = {
      config: refreshed?.config ?? {},
      answers: (refreshed?.answers ?? {}) as SkipContext["answers"],
    };
    const refreshedList = buildQuestionList(freshCtx);
    const here = refreshedList.findIndex((x) => x.id === qid);
    const next = here >= 0 ? refreshedList[here + 1] : undefined;
    if (next) {
      navigate({ to: "/wizard/q/$qid", params: { qid: next.id } });
    } else {
      navigate({ to: "/wizard/checklist" });
    }
  };

  return (
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

        {q.notes === "optional" && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <NotesField
              value={draft.notes ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, notes: v }))}
              placeholder={q.notesPlaceholder ?? "Anything to remember…"}
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

function namePhoto(base: string, idx: number, isVideo: boolean): string {
  const ext = isVideo ? "mp4" : "jpg";
  return idx === 0 ? `${base}.${ext}` : `${base}_${idx + 1}.${ext}`;
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
                onChange={(r: Rating) => onChange((d) => ({ ...d, rating: r }))}
                error={attempted && value.rating === undefined}
              />
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
                onChange={(r: Rating) => onChange((d) => ({ ...d, rating: r }))}
                error={attempted && value.rating === undefined}
              />
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
            onChange={(r) => onChange((d) => ({ ...d, rating: r }))}
            error={attempted && value.rating === undefined}
          />
          {q.withPhoto && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-foreground">
                Photo <span className="text-critical">*</span>
              </p>
              <PhotoCapture
                photos={value.photos ?? []}
                onChange={(photos) => onChange((d) => syncPhotoNames(d, photos, q.withPhoto!.name, false))}
                error={attempted && (value.photos?.length ?? 0) < (q.withPhoto.min ?? 1)}
              />
            </div>
          )}
        </>
      );

    case "photo":
    case "video": {
      const isVideo = q.field === "video";
      return (
        <PhotoCapture
          photos={value.photos ?? []}
          onChange={(photos) => onChange((d) => syncPhotoNames(d, photos, q.photoName ?? q.id.toUpperCase(), isVideo))}
          error={errored}
        />
      );
    }
  }
}

function syncPhotoNames(d: WizardAnswer, photos: string[], baseName: string, isVideo: boolean): WizardAnswer {
  const photoNames = photos.map((_, i) => namePhoto(baseName, i, isVideo));
  return { ...d, photos, photoNames };
}

function isAnsweredLocal(q: QuestionDef, ans: WizardAnswer): boolean {
  return isQuestionAnswered(q, ans as SkipContext["answers"][string]);
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
        <PhotoCapture
          photos={value.photos ?? []}
          onChange={(photos) => onChange((d) => syncPhotoNames(d, photos, fu.photoName ?? "FOLLOWUP", false))}
          error={attempted && fu.required && (value.photos?.length ?? 0) < 1}
        />
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
