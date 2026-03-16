import type { ReviewFindingViewModel } from "@/components/review/pr-review-shell.presenter";

import { CodeSnippet } from "@/components/review/pr-review-shell/code-snippet";

export function EvidenceList({
  evidence,
}: {
  evidence: ReviewFindingViewModel["additionalEvidence"];
}) {
  if (!evidence.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Additional evidence
      </div>
      <div className="space-y-4">
        {evidence.map((item, index) => (
          <div key={`${item.file ?? "context"}-${item.startLine ?? index}-${index}`} className="space-y-2">
            <div className="font-ui flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="border border-border bg-background px-2 py-1">{item.source}</span>
              {item.file ? <span className="font-ui tracking-[-0.02em] normal-case">{item.file}</span> : null}
              {item.startLine ? <span>Line {item.startLine}</span> : null}
            </div>
            <CodeSnippet title="Additional snippet" startLine={item.startLine} snippet={item.snippet} />
          </div>
        ))}
      </div>
    </div>
  );
}
