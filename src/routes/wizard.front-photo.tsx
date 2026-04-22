import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NotesField } from "@/components/NotesField";
import { PhotoCapture } from "@/components/PhotoCapture";
import { RatingButtons } from "@/components/RatingButtons";
import { WizardLayout } from "@/components/WizardLayout";
import { loadWalkthrough, setAnswer, updateWalkthrough, type Rating } from "@/lib/walkthrough";

const QID = "front_of_house";
const SECTION = 2;

export const Route = createFileRoute("/wizard/front-photo")({
  component: FrontPhotoScreen,
});

function FrontPhotoScreen() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<string[]>([]);
  const [rating, setRating] = useState<Rating | undefined>();
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [savedAt, setSavedAt] = useState<number | undefined>();

  useEffect(() => {
    const w = loadWalkthrough();
    if (w?.answers[QID]) {
      setPhotos(w.answers[QID].photos ?? []);
      setRating(w.answers[QID].rating);
      setNotes(w.answers[QID].notes ?? "");
    }
    if (w) updateWalkthrough({ lastRoute: "/wizard/front-photo" });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const w = setAnswer(QID, { photos, rating, notes });
      if (w) setSavedAt(w.updatedAt);
    }, 200);
    return () => clearTimeout(t);
  }, [photos, rating, notes]);

  const photosOk = photos.length >= 1;
  const ratingOk = rating !== undefined;
  const valid = photosOk && ratingOk;

  const handleNext = () => {
    setAnswer(QID, { photos, rating, notes });
    updateWalkthrough({ lastRoute: "/wizard/exterior-paint" });
    navigate({ to: "/wizard/exterior-paint" });
  };

  return (
    <WizardLayout
      sectionIndex={SECTION}
      sectionName="Exterior"
      questionIndex={1}
      totalQuestions={2}
      progress={(2 / 18) * 100}
      lastSavedAt={savedAt}
      canContinue={valid}
      onNext={handleNext}
      onAttemptNext={() => setAttempted(true)}
    >
      <h2 className="text-2xl font-bold leading-tight text-foreground">
        Photograph the front of the house
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Capture at least one clear photo from the curb, then rate the overall condition.
      </p>

      <div className="mt-6 space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">
            Photos <span className="text-critical">*</span>
          </p>
          <PhotoCapture
            photos={photos}
            onChange={setPhotos}
            error={attempted && !photosOk}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">
            Condition rating <span className="text-critical">*</span>
          </p>
          <RatingButtons
            value={rating}
            onChange={setRating}
            error={attempted && !ratingOk}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-foreground">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <NotesField value={notes} onChange={setNotes} placeholder="What stands out?" />
        </div>
      </div>
    </WizardLayout>
  );
}
