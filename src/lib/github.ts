import { Octokit } from "octokit";

export type PullRequestTarget = {
  owner: string;
  repo: string;
  prNumber: number;
};

export type PullRequestFile = {
  filename: string;
  previousFilename?: string | null;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
  isBinary: boolean;
  isGeneratedCandidate: boolean;
};

export type PullRequestData = {
  owner: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  body: string;
  author: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PullRequestFile[];
};

export type PullRequestPreview = {
  owner: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  author: string;
  changedFiles: number;
  additions: number;
  deletions: number;
};

export type RepositoryFileContent = {
  path: string;
  ref: string;
  content: string;
};

export type LinkedIssue = {
  number: number;
  title: string;
  state: string;
  url: string;
  body: string;
};

type OctokitError = Error & {
  status?: number;
  response?: {
    headers?: Record<string, string | undefined>;
  };
};

const GENERATED_FILE_PATTERNS = [
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^bun\.lockb?$/,
  /^dist\//,
  /^build\//,
  /^coverage\//,
  /^\.next\//,
  /^vendor\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /\.min\.(js|css)$/,
  /\.map$/,
];

export class GitHubServiceError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(
    message: string,
    { status, code, retryable }: { status: number; code: string; retryable: boolean },
  ) {
    super(message);
    this.name = "GitHubServiceError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function parsePullRequestUrl(prUrl: string): PullRequestTarget {
  const trimmed = prUrl.trim();
  const match = trimmed.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/)?(?:\?.*)?$/,
  );

  if (!match) {
    throw new GitHubServiceError("Enter a canonical GitHub pull request URL.", {
      status: 400,
      code: "INVALID_PR_URL",
      retryable: false,
    });
  }

  return {
    owner: match[1],
    repo: match[2],
    prNumber: Number(match[3]),
  };
}

function isGeneratedCandidate(filename: string): boolean {
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function getClient(): Octokit {
  const auth = process.env.GITHUB_TOKEN;

  if (!auth) {
    throw new GitHubServiceError("GITHUB_TOKEN is not configured.", {
      status: 500,
      code: "GITHUB_TOKEN_MISSING",
      retryable: false,
    });
  }

  return new Octokit({ auth });
}

function isNotFoundError(error: unknown): boolean {
  return typeof (error as OctokitError | undefined)?.status === "number"
    && (error as OctokitError).status === 404;
}

function toGitHubError(error: unknown): GitHubServiceError {
  if (error instanceof GitHubServiceError) {
    return error;
  }

  const maybeError = error as OctokitError;
  const status = maybeError?.status;
  const remaining = maybeError?.response?.headers?.["x-ratelimit-remaining"];

  if (status === 404) {
    return new GitHubServiceError("Pull request not found or not accessible.", {
      status: 404,
      code: "PR_NOT_FOUND",
      retryable: false,
    });
  }

  if (status === 401) {
    return new GitHubServiceError("GitHub rejected the configured token.", {
      status: 401,
      code: "GITHUB_AUTH_FAILED",
      retryable: false,
    });
  }

  if (status === 403 && remaining === "0") {
    return new GitHubServiceError("GitHub rate limit exceeded.", {
      status: 429,
      code: "GITHUB_RATE_LIMITED",
      retryable: true,
    });
  }

  if (status === 403) {
    return new GitHubServiceError("GitHub denied access to this pull request.", {
      status: 403,
      code: "GITHUB_ACCESS_DENIED",
      retryable: false,
    });
  }

  return new GitHubServiceError("Unable to fetch pull request details from GitHub.", {
    status: 502,
    code: "GITHUB_FETCH_FAILED",
    retryable: true,
  });
}

export async function fetchPullRequest(
  target: PullRequestTarget,
  abortSignal?: AbortSignal,
): Promise<PullRequestData> {
  const octokit = getClient();

  try {
    const [pullRequest, files] = await Promise.all([
      octokit.rest.pulls.get({
        owner: target.owner,
        repo: target.repo,
        pull_number: target.prNumber,
        request: abortSignal ? { signal: abortSignal } : undefined,
      }),
      octokit.paginate(octokit.rest.pulls.listFiles, {
        owner: target.owner,
        repo: target.repo,
        pull_number: target.prNumber,
        per_page: 100,
        request: abortSignal ? { signal: abortSignal } : undefined,
      }),
    ]);

    return {
      owner: target.owner,
      repo: target.repo,
      number: pullRequest.data.number,
      url: pullRequest.data.html_url,
      title: pullRequest.data.title,
      body: pullRequest.data.body ?? "",
      author: pullRequest.data.user?.login ?? "unknown",
      baseRef: pullRequest.data.base.ref,
      headRef: pullRequest.data.head.ref,
      baseSha: pullRequest.data.base.sha,
      headSha: pullRequest.data.head.sha,
      additions: pullRequest.data.additions,
      deletions: pullRequest.data.deletions,
      changedFiles: pullRequest.data.changed_files,
      files: files.map((file) => ({
        filename: file.filename,
        previousFilename: "previous_filename" in file ? file.previous_filename ?? null : null,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch ?? null,
        isBinary: !file.patch,
        isGeneratedCandidate: isGeneratedCandidate(file.filename),
      })),
    };
  } catch (error) {
    throw toGitHubError(error);
  }
}

export async function fetchRepositoryFileContent(
  target: { owner: string; repo: string; path: string; ref: string },
  abortSignal?: AbortSignal,
): Promise<RepositoryFileContent | null> {
  const octokit = getClient();

  try {
    const response = await octokit.rest.repos.getContent({
      owner: target.owner,
      repo: target.repo,
      path: target.path,
      ref: target.ref,
      request: abortSignal ? { signal: abortSignal } : undefined,
    });
    const data = response.data as
      | {
          type?: string;
          encoding?: string;
          content?: string;
          path?: string;
        }
      | Array<unknown>;

    if (Array.isArray(data) || data.type !== "file" || typeof data.content !== "string") {
      return null;
    }

    const content =
      data.encoding === "base64"
        ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
        : data.content;

    return {
      path: data.path ?? target.path,
      ref: target.ref,
      content,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw toGitHubError(error);
  }
}

function extractLinkedIssueNumbers(body: string): number[] {
  const matches = body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi);
  return Array.from(new Set([...matches].map((match) => Number(match[1])).filter(Number.isFinite)));
}

export async function fetchLinkedIssues(
  target: { owner: string; repo: string; body: string },
  abortSignal?: AbortSignal,
): Promise<LinkedIssue[]> {
  const octokit = getClient();
  const issueNumbers = extractLinkedIssueNumbers(target.body).slice(0, 5);

  if (issueNumbers.length === 0) {
    return [];
  }

  const issues = await Promise.all(
    issueNumbers.map(async (issueNumber) => {
      try {
        const response = await octokit.rest.issues.get({
          owner: target.owner,
          repo: target.repo,
          issue_number: issueNumber,
          request: abortSignal ? { signal: abortSignal } : undefined,
        });

        return {
          number: response.data.number,
          title: response.data.title,
          state: response.data.state,
          url: response.data.html_url,
          body: response.data.body ?? "",
        } satisfies LinkedIssue;
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }
        throw toGitHubError(error);
      }
    }),
  );

  return issues.filter((issue): issue is LinkedIssue => issue !== null);
}

export async function fetchPullRequestPreview(
  target: PullRequestTarget,
  abortSignal?: AbortSignal,
): Promise<PullRequestPreview> {
  const octokit = getClient();

  try {
    const pullRequest = await octokit.rest.pulls.get({
      owner: target.owner,
      repo: target.repo,
      pull_number: target.prNumber,
      request: abortSignal ? { signal: abortSignal } : undefined,
    });

    return {
      owner: target.owner,
      repo: target.repo,
      number: pullRequest.data.number,
      url: pullRequest.data.html_url,
      title: pullRequest.data.title,
      author: pullRequest.data.user?.login ?? "unknown",
      changedFiles: pullRequest.data.changed_files,
      additions: pullRequest.data.additions,
      deletions: pullRequest.data.deletions,
    };
  } catch (error) {
    throw toGitHubError(error);
  }
}
