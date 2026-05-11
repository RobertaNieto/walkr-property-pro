import { Link } from "@tanstack/react-router";
import { Camera, XCircle } from "lucide-react";
import type { MissingPhotoLocation } from "@/lib/missing-photo";

interface UploadErrorBannerProps {
  message: string;
  missingPhoto?: MissingPhotoLocation;
  className?: string;
}

/**
 * Renders an upload error. When a missing-photo location is provided, the
 * message becomes a clickable deep-link to the question that owns the file
 * so the agent can re-attach it from their camera roll in one tap.
 */
export function UploadErrorBanner({ message, missingPhoto, className }: UploadErrorBannerProps) {
  const baseCls =
    "flex items-start gap-2 rounded-xl bg-critical/10 p-3 text-left text-xs text-critical";
  const wrapper = className ? `${baseCls} ${className}` : baseCls;

  if (missingPhoto && missingPhoto.questionId) {
    return (
      <div className={wrapper}>
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Photo {missingPhoto.filename} needs to be reattached.</p>
          <p className="mt-0.5 leading-snug">
            Go to the{" "}
            <Link
              to="/wizard/q/$qid"
              params={{ qid: missingPhoto.questionId }}
              className="inline-flex items-center gap-1 font-bold underline underline-offset-2 hover:text-critical/80"
            >
              <Camera className="h-3 w-3" />
              {missingPhoto.sectionName} section
            </Link>{" "}
            and re-add this photo from your camera roll, then retry upload.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
