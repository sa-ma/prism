import { fetchPullRequestPreview, GitHubServiceError } from "@/lib/github";
import { ReviewInputError } from "@/lib/review";

function toError(error: unknown) {
  if (error instanceof GitHubServiceError || error instanceof ReviewInputError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "Failed to load PR preview.",
    retryable: true,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; prNumber: string }> },
) {
  const { owner, repo, prNumber } = await context.params;
  const parsedPrNumber = Number(prNumber);

  try {
    if (!Number.isInteger(parsedPrNumber) || parsedPrNumber <= 0) {
      throw new ReviewInputError("Pull request number must be a positive integer.", {
        status: 400,
        code: "INVALID_PR_NUMBER",
        retryable: false,
      });
    }

    const preview = await fetchPullRequestPreview(
      {
        owner,
        repo,
        prNumber: parsedPrNumber,
      },
      request.signal,
    );

    return Response.json(preview);
  } catch (error) {
    const payload = toError(error);
    const status =
      error instanceof GitHubServiceError || error instanceof ReviewInputError
        ? error.status
        : 500;

    return Response.json(payload, { status });
  }
}
