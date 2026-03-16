import type { RefObject } from "react";

import type { ReviewFindingViewModel } from "@/components/review/pr-review-shell.presenter";
import { ReviewDetail } from "@/components/review/pr-review-shell/review-detail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FindingsPanel({
  findings,
  findingCounts,
  activeItem,
  activeItemId,
  onSelectItem,
  detailPaneRef,
  streaming,
}: {
  findings: ReviewFindingViewModel[];
  findingCounts: { high: number; medium: number; low: number };
  activeItem: ReviewFindingViewModel | null;
  activeItemId: string | null;
  onSelectItem: (id: string) => void;
  detailPaneRef: RefObject<HTMLDivElement | null>;
  streaming: boolean;
}) {
  if (!findings.length) {
    return (
      <Card size="sm">
        <CardHeader className="border-b border-border">
          <CardTitle className="font-ui text-sm">Prioritized findings</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-2">
            <div className="font-ui text-base font-medium text-foreground">
              {streaming
                ? "Findings will appear here as they are verified"
                : "No strong findings surfaced"}
            </div>
            <p className="font-ui text-[15px] leading-7 tracking-[-0.02em] text-secondary-foreground">
              {streaming
                ? "The reviewer is still working through the diff and gathering enough evidence to promote issues into the workspace."
                : "The review completed without issues strong enough to promote into the main findings workspace."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="font-ui text-sm">Prioritized findings</CardTitle>
            <p className="font-ui text-sm tracking-[-0.02em] text-muted-foreground">
              Triage the queue from highest risk to lowest confidence-adjusted follow-up.
            </p>
          </div>
          <div className="font-ui flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em]">
            <span className="border border-foreground bg-foreground px-2 py-1 text-background">
              {findingCounts.high} High
            </span>
            <span className="border border-zinc-500 bg-muted px-2 py-1 text-foreground">
              {findingCounts.medium} Medium
            </span>
            <span className="border border-border bg-background px-2 py-1 text-muted-foreground">
              {findingCounts.low} Low
            </span>
          </div>
        </div>
      </CardHeader>

      <div className="grid min-h-120 grid-cols-1 lg:h-[min(72vh,56rem)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-stretch">
        <div className="min-h-0 border-b border-border lg:border-b-0 lg:border-r lg:border-border">
          <div className="h-full p-2 lg:min-h-0 lg:overflow-y-auto">
            {findings.map((item) => {
              const active = activeItemId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectItem(item.id)}
                  className={`mb-2 flex w-full flex-col gap-3 border px-3 py-3 text-left transition-[border-color,background-color,color] last:mb-0 ${
                    active ? `${item.priorityTone.active}` : "border-border bg-transparent hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 ${item.priorityTone.marker}`} />
                      <span
                        className={`font-ui inline-flex border px-1.5 py-0.5 text-[10px] tracking-[0.14em] ${item.priorityTone.badge}`}
                      >
                        {item.priorityLabel}
                      </span>
                      <span className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Finding
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-ui text-sm font-medium tracking-[-0.02em] text-foreground">
                      {item.title}
                    </div>
                    <div className="font-ui flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      {item.location.file ? (
                        <span className="tracking-[-0.02em] normal-case">{item.location.file}</span>
                      ) : (
                        <span>Context only</span>
                      )}
                      {item.location.startLine ? <span>Line {item.location.startLine}</span> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div ref={detailPaneRef} className="min-h-0 bg-background p-4 lg:overflow-y-auto lg:p-5">
          {activeItem ? (
            <ReviewDetail key={activeItem.id} item={activeItem} />
          ) : (
            <div className="font-ui flex h-full items-center justify-center text-sm tracking-[-0.02em] text-muted-foreground">
              Select a finding to inspect.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
