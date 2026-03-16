import type { ReviewFindingViewModel } from "@/components/review/pr-review-shell.presenter";
import { EvidenceList } from "@/components/review/pr-review-shell/evidence-list";
import { CodeSnippet } from "@/components/review/pr-review-shell/code-snippet";
import { InlineRichText, RichParagraphs, toParagraphs } from "@/components/review/pr-review-shell/inline-rich-text";

export function ReviewDetail({ item }: { item: ReviewFindingViewModel }) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-ui inline-flex border px-2 py-1 text-[11px] tracking-[0.14em] ${item.priorityTone.badge}`}
          >
            {item.priorityRiskLabel}
          </span>
          <span className="font-ui border border-border bg-background px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Confidence {item.confidence}
          </span>
          <span className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Finding
          </span>
        </div>

        <div className="space-y-1.5">
          <h3 className="font-ui text-xl font-medium tracking-tight text-foreground">{item.title}</h3>
          {item.location.file ? (
            <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {item.location.file}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="border border-border bg-background px-4 py-3">
          <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Confidence
          </div>
          <div className="font-ui mt-1 text-sm uppercase tracking-[0.14em] text-foreground">
            {item.confidence}
          </div>
        </div>
        <div className="border border-border bg-background px-4 py-3">
          <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            File
          </div>
          <div className="font-ui mt-1 truncate text-sm tracking-[-0.02em] text-foreground">
            {item.location.file ?? item.evidenceFile ?? "Context only"}
          </div>
        </div>
        <div className="border border-border bg-background px-4 py-3">
          <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Lines affected
          </div>
          <div className="font-ui mt-1 text-sm tracking-[-0.02em] text-foreground">
            {item.location.startLine ? `Around line ${item.location.startLine}` : "Not pinned to a line"}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Issue
        </div>
        <RichParagraphs
          paragraphs={toParagraphs(item.detail)}
          className="font-ui space-y-3 text-[15px] leading-7 tracking-[-0.02em] text-secondary-foreground"
        />
      </div>

      {item.codeContext ? (
        <div className={`space-y-3 border px-4 py-4 ${item.priorityTone.active}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Code context
              </div>
              <div className="font-ui mt-1 text-sm tracking-[-0.02em] text-secondary-foreground">
                Review the most relevant snippet before deciding whether to merge.
              </div>
            </div>
            {item.location.file ? (
              <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {item.location.file}
              </div>
            ) : null}
          </div>

          <CodeSnippet
            title={item.diffContext ? "Diff context" : "Primary evidence"}
            startLine={item.codeContext.startLine}
            snippet={item.codeContext.snippet}
            defaultOpen
          />
        </div>
      ) : null}

      {item.assumption ? (
        <div className="space-y-2">
          <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Assumption
          </div>
          <p className="font-ui text-[15px] leading-7 tracking-[-0.02em] text-secondary-foreground">
            <InlineRichText text={item.assumption} />
          </p>
        </div>
      ) : null}

      <EvidenceList evidence={item.additionalEvidence} />

      {item.suggestion ? (
        <div className="space-y-2">
          <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Suggested fix
          </div>
          <RichParagraphs
            paragraphs={toParagraphs(item.suggestion)}
            className="font-ui space-y-3 text-[15px] leading-7 tracking-[-0.02em] text-foreground"
          />
        </div>
      ) : null}
    </div>
  );
}
