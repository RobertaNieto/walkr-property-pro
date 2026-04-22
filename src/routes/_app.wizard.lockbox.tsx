import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NotesField } from "@/components/NotesField";
import { WizardLayout } from "@/components/WizardLayout";
import { cn } from "@/lib/utils";
import { loadWalkthrough, setAnswer, updateWalkthrough } from "@/lib/walkthrough";

const QID = "lockbox_code";
const SECTION = 1;
const TOTAL_QUESTIONS_IN_SECTION = 1;

export const Route = createFileRoute("/_app/wizard/lockbox")({
  component: LockboxScreen,
});

function LockboxScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [savedAt, setSavedAt] = useState<number | undefined>();

  useEffect(() => {
    const w = loadWalkthrough();
    if (w?.answers[QID]) {
      setCode(w.answers[QID].text ?? "");
      setNotes(w.answers[QID].notes ?? "");
    }
    if (w) updateWalkthrough({ lastRoute: "/wizard/lockbox" });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const w = setAnswer(QID, { text: code, notes });
      if (w) setSavedAt(w.updatedAt);
    }, 200);
    return () => clearTimeout(t);
  }, [code, notes]);

  const valid = code.trim().length > 0;

  const handleNext = () => {
    setAnswer(QID, { text: code, notes });
    updateWalkthrough({ lastRoute: "/wizard/front-photo" });
    navigate({ to: "/wizard/front-photo" });
  };

  return (
    <WizardLayout
      sectionIndex={SECTION}
      sectionName="Access"
      questionIndex={1}
      totalQuestions={TOTAL_QUESTIONS_IN_SECTION}
      progress={(1 / 18) * 100}
      lastSavedAt={savedAt}
      canContinue={valid}
      onNext={handleNext}
      onAttemptNext={() => setAttempted(true)}
    >
      <h2 className="text-2xl font-bold leading-tight text-foreground">Lockbox code</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter the access code provided by the listing agent.
      </p>

      <div className="mt-6 space-y-4">
        <input
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 4827"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={cn(
            "h-14 w-full rounded-2xl border-2 bg-card px-4 text-lg font-semibold tracking-wider text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
            attempted && !valid ? "field-error" : "border-input"
          )}
        />

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-foreground">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <NotesField value={notes} onChange={setNotes} placeholder="Anything to remember…" />
        </div>
      </div>
    </WizardLayout>
  );
}
