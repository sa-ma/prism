"use client";

import { useMemo } from "react";

import { ReviewHeader } from "@/components/review/review-header";
import { buildReviewShellViewModel } from "@/components/review/pr-review-shell.presenter";
import { FindingsPanel } from "@/components/review/pr-review-shell/findings-panel";
import { ReviewFooter } from "@/components/review/pr-review-shell/review-footer";
import { ReviewHero } from "@/components/review/pr-review-shell/review-hero";
import { ReviewSummary } from "@/components/review/pr-review-shell/review-summary";
import { useReviewShellState } from "@/components/review/pr-review-shell/use-review-shell-state";
import type { CachedReview } from "@/lib/review-cache";
import type { StageEvent } from "@/lib/review-types";

export function PRReviewShell({
  entry,
  streaming = false,
  stage,
}: {
  entry: CachedReview;
  streaming?: boolean;
  stage?: StageEvent;
}) {
  const viewModel = useMemo(() => buildReviewShellViewModel(entry, streaming, stage), [entry, stage, streaming]);
  const shellState = useReviewShellState(
    viewModel.findings.map((item) => item.id),
    viewModel.copyableReview,
  );

  const activeItem = useMemo(
    () => viewModel.findings.find((item) => item.id === shellState.activeItemId) ?? null,
    [shellState.activeItemId, viewModel.findings],
  );

  return (
    <div className="flex h-svh flex-col">
      <ReviewHeader subtitle={viewModel.headerSubtitle} subtitleHref={viewModel.prUrl} />

      <main id="main-content" className="flex-1 overflow-y-auto py-8 md:py-10">
        <div className="mx-auto flex w-full max-w-328 flex-col gap-6 font-body">
          <ReviewHero viewModel={viewModel} />

          <FindingsPanel
            findings={viewModel.findings}
            findingCounts={viewModel.findingCounts}
            activeItem={activeItem}
            activeItemId={shellState.activeItemId}
            onSelectItem={shellState.selectItem}
            detailPaneRef={shellState.detailPaneRef}
            streaming={streaming}
          />

          <ReviewSummary summary={viewModel.reviewSummary} />

          <ReviewFooter
            supplementalContextFiles={viewModel.coverage.supplementalContextFiles}
            skippedFiles={viewModel.coverage.skippedFiles}
            truncatedFiles={viewModel.coverage.truncatedFiles}
            showSkippedFiles={shellState.showSkippedFiles}
            onToggleSkippedFiles={shellState.toggleSkippedFiles}
            streaming={streaming}
            onCopy={shellState.handleCopy}
            copyState={shellState.copyState}
          />
        </div>
      </main>
    </div>
  );
}
