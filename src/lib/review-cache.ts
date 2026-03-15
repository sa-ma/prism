import type { FinalReview, ReviewFocus, ReviewMode } from "@/lib/review-types";

export type PullRequestSummary = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  changedFiles: number;
  additions: number;
  deletions: number;
};

export type CachedReview = {
  pr: PullRequestSummary;
  review: FinalReview;
  focus: ReviewFocus;
  mode: ReviewMode;
  updatedAt: number;
};

const cache = globalThis.__prReviewCache ?? new Map<string, CachedReview>();

if (!globalThis.__prReviewCache) {
  globalThis.__prReviewCache = cache;
}

function toKey(
  owner: string,
  repo: string,
  prNumber: number | string,
  focus: ReviewFocus,
  mode: ReviewMode,
): string {
  return `${owner}/${repo}#${prNumber}?focus=${focus}&mode=${mode}`;
}

export function getCachedReview(
  owner: string,
  repo: string,
  prNumber: number | string,
  focus: ReviewFocus,
  mode: ReviewMode,
): CachedReview | undefined {
  return cache.get(toKey(owner, repo, prNumber, focus, mode));
}

export function setCachedReview(entry: CachedReview) {
  cache.set(toKey(entry.pr.owner, entry.pr.repo, entry.pr.number, entry.focus, entry.mode), entry);
}

declare global {
  var __prReviewCache: Map<string, CachedReview> | undefined;
}
