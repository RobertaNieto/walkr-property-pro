// Find which question owns a specific captured filename so we can deep-link
// the agent back to the exact section/question for re-attachment after a
// browser cache wipe.

import type { Walkthrough } from "@/lib/walkthrough";
import { buildQuestionList, type SkipContext } from "@/lib/wizard-schema";

export interface MissingPhotoLocation {
  filename: string;
  questionId: string;
  questionLabel: string;
  sectionIndex: number;
  sectionName: string;
}

export function findQuestionForFilename(
  walk: Walkthrough,
  filename: string,
): MissingPhotoLocation | null {
  if (!walk?.answers) return null;
  // Find the answer entry that references this filename.
  let owningQid: string | null = null;
  for (const [qid, ans] of Object.entries(walk.answers)) {
    if (
      (ans.photoNames ?? []).includes(filename) ||
      (ans.poorPhotoNames ?? []).includes(filename)
    ) {
      owningQid = qid;
      break;
    }
  }
  if (!owningQid) return null;

  const ctx: SkipContext = {
    config: walk.config ?? {},
    answers: (walk.answers ?? {}) as SkipContext["answers"],
  };
  const list = buildQuestionList(ctx);
  // Direct match first.
  let q = list.find((x) => x.id === owningQid);
  // Poor photos for `withRating` companions belong to the parent — try parents.
  if (!q) {
    q = list.find((x) => x.companions?.includes(owningQid!));
  }
  if (!q) return null;
  return {
    filename,
    questionId: q.id,
    questionLabel: q.label,
    sectionIndex: q.sectionIndex,
    sectionName: q.sectionName,
  };
}
