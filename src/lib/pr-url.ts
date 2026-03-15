import type { ReviewMode } from "@/lib/review-types";

export type PullRequestRouteTarget = {
  owner: string;
  repo: string;
  prNumber: string;
};

export function parsePullRequestRouteTarget(input: string): PullRequestRouteTarget | null {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/)?(?:\?.*)?$/,
  );

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    prNumber: match[3],
  };
}

export function toReviewPath(
  target: PullRequestRouteTarget,
  focus?: "general" | "bugs" | "security" | "tests",
  mode: ReviewMode = "fast",
): string {
  const path = `/review/${target.owner}/${target.repo}/${target.prNumber}`;
  const params = new URLSearchParams();
  if (focus && focus !== "general") {
    params.set("focus", focus);
  }
  if (mode !== "fast") {
    params.set("mode", mode);
  }

  const query = params.toString();
  if (!query) {
    return path;
  }

  return `${path}?${query}`;
}
