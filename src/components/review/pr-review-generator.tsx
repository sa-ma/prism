"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PRReviewShell } from "@/components/review/pr-review-shell";
import { ReviewHeader } from "@/components/review/review-header";
import type { CachedReview, PullRequestSummary } from "@/lib/review-cache";
import type {
  Comment,
  ErrorEvent,
  ReviewFocus,
  ReviewMode,
  StageEvent,
  SuggestedFix,
  TestGap,
} from "@/lib/review-types";

type StreamEventMap = {
  stage: StageEvent;
  pr: PullRequestSummary;
  comment: Comment;
  test_gap: TestGap;
  suggested_fix: SuggestedFix;
  summary_delta: { text: string };
  complete: CachedReview;
  error: ErrorEvent;
};

type GeneratorState =
  | {
      status: "loading";
      stage: StageEvent;
      pr: PullRequestSummary | null;
      summary: string;
      comments: Comment[];
      testGaps: TestGap[];
      suggestedFixes: SuggestedFix[];
    }
  | { status: "complete"; entry: CachedReview }
  | { status: "error"; error: ErrorEvent };

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [...items, nextItem];
  }

  const clone = [...items];
  clone[index] = nextItem;
  return clone;
}

function sortByPriority<T extends { priority: "high" | "medium" | "low" }>(items: T[]): T[] {
  const order = { high: 0, medium: 1, low: 2 };
  return [...items].sort((left, right) => order[left.priority] - order[right.priority]);
}

function buildIncrementalEntry(
  owner: string,
  repo: string,
  prNumber: number,
  focus: ReviewFocus,
  mode: ReviewMode,
  state: Extract<GeneratorState, { status: "loading" }>,
): CachedReview {
  return {
    pr:
      state.pr ?? {
        owner,
        repo,
        number: prNumber,
        title: `${owner}/${repo} #${prNumber}`,
        author: "",
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        changedFiles: 0,
        additions: 0,
        deletions: 0,
      },
    review: {
      summary: state.summary,
      commentsByPriority: {
        high: state.comments.filter((comment) => comment.priority === "high"),
        medium: state.comments.filter((comment) => comment.priority === "medium"),
        low: state.comments.filter((comment) => comment.priority === "low"),
      },
      testGaps: state.testGaps,
      suggestedFixes: state.suggestedFixes,
      riskAssessment: {
        level: "medium",
        reasons: [],
      },
      coverage: {
        mode,
        reviewedFiles: 0,
        supplementalContextFiles: 0,
        totalFiles: state.pr?.changedFiles ?? 0,
        skippedFiles: [],
        truncatedFiles: [],
      },
    },
    focus,
    mode,
    updatedAt: Date.now(),
  };
}

export function PRReviewGenerator({
  owner,
  repo,
  prNumber,
  focus,
  mode,
}: {
  owner: string;
  repo: string;
  prNumber: number;
  focus: ReviewFocus;
  mode: ReviewMode;
}) {
  const [state, setState] = useState<GeneratorState>({
    status: "loading",
    stage: {
      stage: "validating",
      message: "Connecting to review stream.",
    },
    pr: null,
    summary: "",
    comments: [],
    testGaps: [],
    suggestedFixes: [],
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  const startConnection = useCallback(() => {
    eventSourceRef.current?.close();

    const eventSource = new EventSource(
      `/api/review/${owner}/${repo}/${prNumber}?focus=${focus}&mode=${mode}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("stage", (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as StreamEventMap["stage"];
      setState((current) => {
        if (current.status !== "loading") {
          return current;
        }

        return {
          ...current,
          stage: payload,
        };
      });
    });

    eventSource.addEventListener("pr", (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as StreamEventMap["pr"];
      setState((current) => {
        if (current.status !== "loading") {
          return current;
        }

        return {
          ...current,
          pr: payload,
        };
      });
    });

    eventSource.addEventListener("summary_delta", (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as StreamEventMap["summary_delta"];
      setState((current) => {
        if (current.status !== "loading") {
          return current;
        }

        return {
          ...current,
          summary: `${current.summary}${payload.text}`,
        };
      });
    });

    eventSource.addEventListener("comment", (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as StreamEventMap["comment"];
      setState((current) => {
        if (current.status !== "loading") {
          return current;
        }

        return {
          ...current,
          comments: sortByPriority(upsertById(current.comments, payload)),
        };
      });
    });

    eventSource.addEventListener("test_gap", (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as StreamEventMap["test_gap"];
      setState((current) => {
        if (current.status !== "loading") {
          return current;
        }

        return {
          ...current,
          testGaps: sortByPriority(upsertById(current.testGaps, payload)),
        };
      });
    });

    eventSource.addEventListener("suggested_fix", (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as StreamEventMap["suggested_fix"];
      setState((current) => {
        if (current.status !== "loading") {
          return current;
        }

        return {
          ...current,
          suggestedFixes: sortByPriority(upsertById(current.suggestedFixes, payload)),
        };
      });
    });

    eventSource.addEventListener("complete", (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as StreamEventMap["complete"];
      setState({
        status: "complete",
        entry: payload,
      });
      eventSource.close();
    });

    eventSource.addEventListener("error", (event: Event) => {
      if (event instanceof MessageEvent && event.data) {
        const payload = JSON.parse(event.data) as StreamEventMap["error"];
        setState({
          status: "error",
          error: payload,
        });
      } else {
        setState({
          status: "error",
          error: {
            code: "CONNECTION_ERROR",
            message: "Lost connection to the review stream.",
            retryable: true,
          },
        });
      }
      eventSource.close();
    });
  }, [focus, mode, owner, prNumber, repo]);

  function handleRetry() {
    setState({
      status: "loading",
      stage: {
        stage: "validating",
        message: "Connecting to review stream.",
      },
      pr: null,
      summary: "",
      comments: [],
      testGaps: [],
      suggestedFixes: [],
    });
    startConnection();
  }

  useEffect(() => {
    startConnection();
    return () => eventSourceRef.current?.close();
  }, [startConnection]);

  if (state.status === "complete") {
    return <PRReviewShell entry={state.entry} />;
  }

  if (state.status === "error") {
    return (
      <div className="flex h-svh flex-col">
        <ReviewHeader subtitle={`${repo} #${prNumber}`} />
        <main id="main-content" className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/92 p-6 text-center shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10">
              <AlertCircle aria-hidden="true" className="h-5 w-5 text-destructive" />
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Review interrupted
              </div>
              <h2 className="font-ui text-xl font-medium text-foreground">The stream did not complete</h2>
              <p className="mx-auto max-w-sm text-[15px] leading-7 text-secondary-foreground">
                {state.error.message}
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link href="/">
                <Button variant="outline" size="sm">Home</Button>
              </Link>
              {state.error.retryable ? (
                <Button size="sm" onClick={handleRetry}>
                  <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                  Try again
                </Button>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <PRReviewShell
      entry={{
        ...buildIncrementalEntry(owner, repo, prNumber, focus, mode, state),
        focus,
        mode,
      }}
      streaming
      stage={state.stage}
    />
  );
}
