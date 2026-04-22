import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { NotesField } from "@/components/NotesField";
import { RatingButtons } from "@/components/RatingButtons";
import { WizardLayout } from "@/components/WizardLayout";
import { loadWalkthrough, setAnswer, updateWalkthrough, type Rating } from "@/lib/walkthrough";

const QID = "exterior_paint";
const SECTION = 2;

export const Route = createFileRoute("/wizard/exterior-paint")({
  component: ExteriorPaintScreen,
});

function ExteriorPaintScreen() {
  const navigate = useNavigate();
  const [rating, setRating] = useState<Rating | undefined>();
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [savedAt, setSavedAt] = useState<number | undefined>();

  useEffect(() => {
    const w = loadWalkthrough();
    if (w?.answers[QID]) {
      setRating(w.answers[QID].rating);
      setNotes(w.answers[QID].notes ?? "");
    }
    if (w) updateWalkthrough({ lastRoute: "/wizard/exterior-paint" });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const w = setAnswer(QID, { rating, notes });
      if (w) setSavedAt(w.updatedAt);
    }, 200);
    return () => clearTimeout(t);
  }, [rating, notes]);

  const valid = rating !== undefined;

  const handleNext = () => {
    setAnswer(QID, { rating, notes });
    navigate({ to: "/wizard/complete" });
  };

  return (
    <WizardLayout
      sectionIndex={SECTION}
      sectionName="Exterior"
      questionIndex={2}
      totalQuestions={2}
      progress={(3 / 18) * 100}
      lastSavedAt={savedAt}
      canContinue={valid}
      onNext={handleNext}
      onAttemptNext={() => setAttempted(true)}
    >
      <h2 className="text-2xl font-bold leading-tight text-foreground">
        Exterior paint condition
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Rate the overall paint and finish quality of the exterior walls and trim.
      </p>

      <div className="mt-6 space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">
            Condition rating <span className="text-critical">*</span>
          </p>
          <RatingButtons
            value={rating}
            onChange={setRating}
            error={attempted && !valid}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-foreground">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <NotesField
            value={notes}
            onChange={setNotes}
            placeholder="Peeling, fading, recent paint, etc."
          />
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-accent/5 p-3 text-xs text-accent">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            Your answers auto-save as you go. Close the app and we'll resume right here.
          </p>
        </div>
      </div>
    </WizardLayout>
  );
}
