import { PRReviewGenerator } from "@/components/review/pr-review-generator";
import { PRReviewShell } from "@/components/review/pr-review-shell";
import { getCachedReview } from "@/lib/review-cache";
import { normalizeReviewFocus, normalizeReviewMode } from "@/lib/review-types";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string; prNumber: string }>;
  searchParams: Promise<{ focus?: string; mode?: string }>;
}) {
  const { owner, repo, prNumber } = await params;
  const { focus, mode } = await searchParams;
  const normalizedFocus = normalizeReviewFocus(focus);
  const normalizedMode = normalizeReviewMode(mode);
  const cached = getCachedReview(owner, repo, prNumber, normalizedFocus, normalizedMode);

  if (cached) {
    return <PRReviewShell entry={cached} />;
  }

  return (
    <PRReviewGenerator
      owner={owner}
      repo={repo}
      prNumber={Number(prNumber)}
      focus={normalizedFocus}
      mode={normalizedMode}
    />
  );
}
