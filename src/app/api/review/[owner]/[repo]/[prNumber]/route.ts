import { fetchPullRequest, GitHubServiceError } from "@/lib/github";
import { getCachedReview, setCachedReview, type CachedReview, type PullRequestSummary } from "@/lib/review-cache";
import { preparePullRequestForReview, ReviewInputError, runPullRequestReview } from "@/lib/review";
import {
  normalizeReviewFocus,
  normalizeReviewMode,
  type ErrorEvent,
  type FinalReview,
  type StageEvent,
} from "@/lib/review-types";

export const runtime = "nodejs";

type StreamWriter = {
  stage: (payload: StageEvent) => void;
  pr: (payload: PullRequestSummary) => void;
  commentsSnapshot: (payload: Array<FinalReview["commentsByPriority"]["high"][number]>) => void;
  summaryDelta: (payload: { text: string }) => void;
  complete: (payload: CachedReview) => void;
  error: (payload: ErrorEvent) => void;
  close: () => void;
};

function createWriter(controller: ReadableStreamDefaultController<Uint8Array>): StreamWriter {
  const encoder = new TextEncoder();

  function write(eventName: string, payload: unknown) {
    controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
  }

  return {
    stage: (payload) => write("stage", payload),
    pr: (payload) => write("pr", payload),
    commentsSnapshot: (payload) => write("comments_snapshot", payload),
    summaryDelta: (payload) => write("summary_delta", payload),
    complete: (payload) => write("complete", payload),
    error: (payload) => write("error", payload),
    close: () => controller.close(),
  };
}

function toErrorEvent(error: unknown): ErrorEvent {
  if (error instanceof GitHubServiceError || error instanceof ReviewInputError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error && error.name === "AbortError") {
    return {
      code: "REQUEST_ABORTED",
      message: "The request was aborted.",
      retryable: true,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "Something went wrong during the review.",
    retryable: true,
  };
}

function toPullRequestSummary(input: {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  changedFiles: number;
  additions: number;
  deletions: number;
}): PullRequestSummary {
  return {
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    title: input.title,
    author: input.author,
    url: input.url,
    changedFiles: input.changedFiles,
    additions: input.additions,
    deletions: input.deletions,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; prNumber: string }> },
) {
  const { owner, repo, prNumber } = await context.params;
  const parsedPrNumber = Number(prNumber);
  const searchParams = new URL(request.url).searchParams;
  const focus = normalizeReviewFocus(searchParams.get("focus"));
  const mode = normalizeReviewMode(searchParams.get("mode"));

  const cached = getCachedReview(owner, repo, prNumber, focus, mode);
  if (cached) {
    const payload = `event: complete\ndata: ${JSON.stringify(cached)}\n\n`;
    return new Response(payload, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writer = createWriter(controller);

      try {
        if (!Number.isInteger(parsedPrNumber) || parsedPrNumber <= 0) {
          throw new ReviewInputError("Pull request number must be a positive integer.", {
            status: 400,
            code: "INVALID_PR_NUMBER",
            retryable: false,
          });
        }

        writer.stage({
          stage: "validating",
          message: "Validating pull request route.",
        });

        writer.stage({
          stage: "fetching_pr",
          message: `Fetching ${owner}/${repo}#${parsedPrNumber} from GitHub.`,
        });

        const pullRequest = await fetchPullRequest(
          {
            owner,
            repo,
            prNumber: parsedPrNumber,
          },
          request.signal,
        );

        writer.pr(toPullRequestSummary(pullRequest));

        writer.stage({
          stage: "filtering_files",
          message: "Preparing review input.",
        });

        const prepared = await preparePullRequestForReview(
          pullRequest,
          mode,
          {
            onStage: (stage) => writer.stage(stage),
          },
          request.signal,
        );

        const review = await runPullRequestReview(
          prepared,
          focus,
          {
            onStage: (stage) => writer.stage(stage),
            onSummaryDelta: (delta) => writer.summaryDelta({ text: delta }),
            onCommentsSnapshot: (comments) => writer.commentsSnapshot(comments),
          },
          request.signal,
        );

        writer.stage({
          stage: "finalizing",
          message: "Finalizing review result.",
        });

        const entry: CachedReview = {
          pr: toPullRequestSummary(pullRequest),
          review,
          focus,
          mode,
          updatedAt: Date.now(),
        };

        setCachedReview(entry);
        writer.complete(entry);
      } catch (error) {
        writer.error(toErrorEvent(error));
      } finally {
        writer.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
