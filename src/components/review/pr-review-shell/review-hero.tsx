import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";

import type { ReviewShellViewModel } from "@/components/review/pr-review-shell.presenter";
import { InlineRichText } from "@/components/review/pr-review-shell/inline-rich-text";

export function ReviewHero({ viewModel }: { viewModel: ReviewShellViewModel }) {
  return (
    <section className="overflow-hidden border border-border bg-card">
      <div className="space-y-5 border-b border-border px-5 py-5 md:px-6 md:py-6">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Review mode
            </div>
            <div className="font-ui flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {viewModel.modeLinks.map((modeLink) => (
                <Link
                  key={modeLink.value}
                  href={modeLink.href}
                  className={`border px-2 py-1 transition-colors ${
                    modeLink.active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {modeLink.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="font-ui flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {viewModel.metadataChips.map((chip) => (
              <span key={chip} className="border border-border px-2 py-1">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="font-ui max-w-4xl text-3xl font-semibold leading-[1.1] tracking-[-0.05em] text-balance text-foreground md:text-5xl">
            {viewModel.title}
          </h1>
          <a
            href={viewModel.prUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {viewModel.repoLabel}
            <ExternalLink aria-hidden="true" className="h-3 w-3" />
          </a>
        </div>

        <div className="space-y-2">
          <div className={`font-ui text-2xl font-semibold tracking-[-0.04em] md:text-3xl ${viewModel.mergeDecision.tone}`}>
            {viewModel.mergeDecision.label}
          </div>
          <div className="font-ui max-w-3xl text-sm leading-6 tracking-[-0.02em] text-secondary-foreground">
            {viewModel.reviewOutlook}
          </div>
          {viewModel.stageSummary ? (
            <div className="inline-flex items-center gap-2 border border-border bg-muted px-3 py-2">
              <Sparkles
                aria-hidden="true"
                className="review-loading-star h-3.5 w-3.5 text-foreground"
              />
              <p className="font-ui text-sm leading-6 tracking-[-0.02em] text-secondary-foreground">
                <InlineRichText text={viewModel.stageSummary} />
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-5 py-4 md:px-6">
        <div className="max-w-4xl">
          <div className="space-y-2">
            <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {viewModel.heroContext.label}
            </div>
            {viewModel.heroContext.title ? (
              <div className="font-ui text-sm font-medium tracking-[-0.02em] text-foreground">
                {viewModel.heroContext.title}
              </div>
            ) : null}
            <div className="font-ui text-sm leading-6 tracking-[-0.02em] text-secondary-foreground">
              <InlineRichText text={viewModel.heroContext.body} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
