import { posix as path } from "node:path";
import { createHash } from "node:crypto";

import { openai } from "@ai-sdk/openai";
import { Output, streamText } from "ai";

import {
  fetchLinkedIssues,
  fetchRepositoryFileContent,
  type LinkedIssue,
  type PullRequestData,
  type PullRequestFile,
  type RepositoryFileContent,
} from "@/lib/github";
import {
  commentSchema,
  finalReviewSchema,
  modelReviewSchema,
  prioritySchema,
  type Comment,
  type FinalReview,
  type ModelReview,
  type Priority,
  type ReviewFocus,
  type ReviewMode,
  type StageEvent,
} from "@/lib/review-types";

const MAX_CHANGED_FILES = 18;
const MAX_REVIEWABLE_FILES = 12;
const MAX_TOTAL_CHANGES = 900;
const MAX_PATCH_CHARACTERS = 60_000;
const DEFAULT_FAST_MODEL = "gpt-5-mini";
const DEFAULT_DEEP_MODEL = "gpt-5.3-codex";

const DEEP_MAX_CONSIDERED_FILES = 60;
const DEEP_MAX_REVIEWED_FILES = 10;
const DEEP_MAX_SUPPORT_FILES = 10;
const DEEP_MAX_CONTEXT_CHARACTERS = 120_000;
const MAX_SEGMENT_CHARACTERS = 16_000;

const IMPORT_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
] as const;

type ReviewablePullRequest = {
  pr: PullRequestData;
  reviewMode: ReviewMode;
  reviewableFiles: PullRequestFile[];
  skippedFiles: string[];
  truncatedFiles: string[];
  supplementalContextFiles: number;
  linkedIssues: LinkedIssue[];
  deepContextText?: string;
};

type ReviewCallbacks = {
  onStage?: (stage: StageEvent) => void;
  onSummaryDelta?: (delta: string) => void;
  onCommentsSnapshot?: (comments: Comment[]) => void;
};

type PartialStreamState = {
  summary: string;
  commentsSignature: string;
};

type ReviewIssue = {
  status: number;
  code: string;
  retryable: boolean;
};

type EvidenceItem = Comment["evidence"][number];

type ContextSegment = {
  label: string;
  text: string;
  optional: boolean;
  countsAsSupplemental: boolean;
};

export class ReviewInputError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(message: string, issue: ReviewIssue) {
    super(message);
    this.name = "ReviewInputError";
    this.status = issue.status;
    this.code = issue.code;
    this.retryable = issue.retryable;
  }
}

function emitStage(callbacks: ReviewCallbacks, stage: StageEvent["stage"], message: string) {
  callbacks.onStage?.({ stage, message });
}

function createStableId(prefix: string, parts: Array<string | undefined>): string {
  return `${prefix}_${createHash("sha1")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 12)}`;
}

function normalizeWhitespace(value: string | null | undefined): string | undefined {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function toCommentId(value: Omit<Comment, "id" | "diffContext">): string {
  return createStableId("comment", [
    value.priority,
    normalizeWhitespace(value.file),
    normalizeWhitespace(value.title),
    normalizeWhitespace(value.explanation),
  ]);
}

function sortByPriority<T extends { priority: Priority }>(items: T[]): T[] {
  const weight: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return [...items].sort((left, right) => weight[left.priority] - weight[right.priority]);
}

function parseEvidenceCandidate(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const candidate = item as {
        file?: unknown;
        startLine?: unknown;
        snippet?: unknown;
        source?: unknown;
      };

      const snippet = typeof candidate.snippet === "string" ? candidate.snippet.trim() : "";
      if (!snippet) {
        return [];
      }

      return [
        {
          file: typeof candidate.file === "string" && candidate.file.trim() ? candidate.file.trim() : null,
          startLine:
            typeof candidate.startLine === "number" && Number.isInteger(candidate.startLine) && candidate.startLine > 0
              ? candidate.startLine
              : null,
          snippet,
          source:
            candidate.source === "context" || candidate.source === "issue" ? candidate.source : "diff",
        } satisfies EvidenceItem,
      ];
    })
    .slice(0, 3);
}

function parseConfidenceCandidate(value: unknown): Priority {
  const parsed = prioritySchema.safeParse(value);
  return parsed.success ? parsed.data : "medium";
}

function validateCommentCandidate(candidate: unknown): Comment | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const parsedPriority = prioritySchema.safeParse((candidate as { priority?: unknown }).priority);
  const title =
    typeof (candidate as { title?: unknown }).title === "string"
      ? (candidate as { title: string }).title.trim()
      : "";
  const explanation =
    typeof (candidate as { explanation?: unknown }).explanation === "string"
      ? (candidate as { explanation: string }).explanation.trim()
      : "";
  const file =
    typeof (candidate as { file?: unknown }).file === "string"
      ? (candidate as { file: string }).file.trim()
      : null;
  const suggestedFix =
    typeof (candidate as { suggestedFix?: unknown }).suggestedFix === "string"
      ? (candidate as { suggestedFix: string }).suggestedFix.trim()
      : null;
  const assumption =
    typeof (candidate as { assumption?: unknown }).assumption === "string"
      ? (candidate as { assumption: string }).assumption.trim()
      : null;

  if (!parsedPriority.success || !title || !explanation) {
    return null;
  }

  const value = {
    priority: parsedPriority.data,
    confidence: parseConfidenceCandidate((candidate as { confidence?: unknown }).confidence),
    file: file || null,
    title,
    explanation,
    suggestedFix: suggestedFix || null,
    assumption: assumption || null,
    evidence: parseEvidenceCandidate((candidate as { evidence?: unknown }).evidence),
  };

  return commentSchema.parse({
    id: toCommentId(value),
    ...value,
    diffContext: null,
  });
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function focusInstruction(focus: ReviewFocus): string {
  switch (focus) {
    case "bugs":
      return "Focus especially on behavioral bugs, regressions, and edge-case failures.";
    case "security":
      return "Focus especially on security issues, trust boundaries, auth mistakes, and data exposure.";
    case "tests":
      return "Focus especially on missing tests, weak coverage, and untested branches.";
    default:
      return "Perform a balanced general review across correctness, regressions, security, and tests.";
  }
}

function extractStartLine(patch: string | null): number | null {
  if (!patch) {
    return null;
  }

  const match = patch.match(/^@@ -\d+(?:,\d+)? \+(\d+)/m);
  return match ? Number(match[1]) : null;
}

function buildDiffContext(file: PullRequestFile | undefined) {
  if (!file?.patch) {
    return null;
  }

  const snippet = file.patch.split("\n").slice(0, 18).join("\n").trim();
  if (!snippet) {
    return null;
  }

  return {
    snippet,
    startLine: extractStartLine(file.patch),
  };
}

function filterReviewableFiles(pr: PullRequestData) {
  const skippedFiles = pr.files
    .filter((file) => file.isBinary || file.isGeneratedCandidate)
    .map((file) => file.filename);

  const reviewableFiles = pr.files.filter(
    (file) => !file.isBinary && !file.isGeneratedCandidate && file.patch,
  );

  return { skippedFiles, reviewableFiles };
}

function scoreReviewFile(file: PullRequestFile): number {
  const name = file.filename.toLowerCase();
  let score = file.additions + file.deletions;

  if (/(auth|token|secret|credential|permission|role|policy|session|oauth|crypto|security)/.test(name)) {
    score += 140;
  }
  if (/(api|server|route|middleware|gateway|network|proxy|cache|config|db|sql|queue)/.test(name)) {
    score += 100;
  }
  if (/(review|parser|serializer|schema|types)/.test(name)) {
    score += 50;
  }
  if (/\b(delete|remove|drop)\b/i.test(file.patch ?? "")) {
    score += 20;
  }
  if (file.status === "renamed") {
    score += 35;
  }
  if (/(\.|\/)(test|spec)\./.test(name)) {
    score -= 25;
  }

  return score;
}

function formatPatchContext(reviewableFiles: PullRequestFile[]): string {
  return reviewableFiles
    .map((file) =>
      [
        `FILE: ${file.filename}`,
        `STATUS: ${file.status}`,
        `ADDITIONS: ${file.additions}`,
        `DELETIONS: ${file.deletions}`,
        "PATCH:",
        file.patch ?? "[No patch available]",
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

function numberLines(content: string): string {
  return content
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

function clipContent(content: string, maxCharacters = MAX_SEGMENT_CHARACTERS) {
  if (content.length <= maxCharacters) {
    return { content, truncated: false };
  }

  return {
    content: `${content.slice(0, Math.max(0, maxCharacters - 32))}\n... [truncated for review budget]`,
    truncated: true,
  };
}

function buildFileContextSegment(label: string, content: RepositoryFileContent, source: "HEAD" | "BASE") {
  const clipped = clipContent(numberLines(content.content));

  return {
    segment: [
      `${source} FILE: ${content.path}`,
      `REF: ${content.ref}`,
      "CONTENT:",
      clipped.content,
    ].join("\n"),
    truncated: clipped.truncated,
    label,
  };
}

function buildIssueContextSegment(issue: LinkedIssue) {
  const clipped = clipContent(issue.body || "[No description provided]", 2_000);

  return {
    segment: [
      `LINKED ISSUE #${issue.number}: ${issue.title}`,
      `STATE: ${issue.state}`,
      `URL: ${issue.url}`,
      "BODY:",
      clipped.content,
    ].join("\n"),
    truncated: clipped.truncated,
    label: `issue#${issue.number}`,
  };
}

function parseRelativeImports(content: string): string[] {
  const matches = content.matchAll(
    /\b(?:import|export)\b[\s\S]*?\bfrom\s+["'](\.{1,2}\/[^"']+)["']|import\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
  );

  return Array.from(
    new Set(
      [...matches]
        .map((match) => match[1] ?? match[2] ?? "")
        .map((specifier) => specifier.trim())
        .filter(Boolean),
    ),
  );
}

function resolveImportCandidates(fromFile: string, specifier: string): string[] {
  const basePath = path.normalize(path.join(path.dirname(fromFile), specifier));
  return Array.from(new Set(IMPORT_EXTENSIONS.map((extension) => path.normalize(`${basePath}${extension}`))));
}

function isLikelyTestFile(filePath: string): boolean {
  return /(^|\/)(__tests__\/|tests?\/)|(\.|\/)(test|spec)\.[^/]+$/i.test(filePath);
}

function buildRelatedTestCandidates(filePath: string): string[] {
  const extension = path.extname(filePath);
  const withoutExtension = extension ? filePath.slice(0, -extension.length) : filePath;
  const directory = path.dirname(filePath);
  const baseName = path.basename(withoutExtension);

  return Array.from(
    new Set([
      `${withoutExtension}.test${extension}`,
      `${withoutExtension}.spec${extension}`,
      path.join(directory, "__tests__", `${baseName}.test${extension}`),
      path.join(directory, "__tests__", `${baseName}.spec${extension}`),
    ].map((candidate) => path.normalize(candidate))),
  );
}

function fitContextSegments(segments: ContextSegment[], budget: number) {
  let remaining = budget;
  let supplementalContextFiles = 0;
  const kept: string[] = [];
  const truncatedLabels: string[] = [];

  for (const segment of segments) {
    if (remaining <= 0) {
      truncatedLabels.push(segment.label);
      continue;
    }

    if (segment.text.length > remaining) {
      if (segment.optional) {
        truncatedLabels.push(segment.label);
        continue;
      }

      const clipped = clipContent(segment.text, remaining);
      kept.push(clipped.content);
      truncatedLabels.push(segment.label);
      if (segment.countsAsSupplemental) {
        supplementalContextFiles += 1;
      }
      remaining = 0;
      continue;
    }

    kept.push(segment.text);
    remaining -= segment.text.length;
    if (segment.countsAsSupplemental) {
      supplementalContextFiles += 1;
    }
  }

  return {
    text: kept.join("\n\n---\n\n"),
    truncatedLabels,
    supplementalContextFiles,
  };
}

function buildFastPrompt(pr: PullRequestData, reviewableFiles: PullRequestFile[], focus: ReviewFocus): string {
  return [
    "You are reviewing a GitHub pull request.",
    "Focus only on the supplied diff.",
    "Prioritize correctness, regressions, security issues, and missing tests.",
    "Do not produce style-only feedback.",
    focusInstruction(focus),
    "Return findings only in the comments array.",
    "Represent missing tests or concrete follow-up work as findings, not separate categories.",
    "Assign every finding a required priority of high, medium, or low.",
    "Assign each finding a confidence of high, medium, or low.",
    "Include 1-3 short evidence references per finding using the supplied diff.",
    "Use suggestedFix on a finding when a concrete remediation is clear.",
    "Use assumption only when a finding is an informed inference rather than directly proven.",
    "Keep the summary concise and execution-oriented.",
    "Provide a short risk assessment with a low, medium, or high level and concrete reasons.",
    "",
    `REPOSITORY: ${pr.owner}/${pr.repo}`,
    `PULL REQUEST: #${pr.number}`,
    `TITLE: ${pr.title}`,
    `AUTHOR: ${pr.author}`,
    `BASE BRANCH: ${pr.baseRef}`,
    `HEAD BRANCH: ${pr.headRef}`,
    `PR DESCRIPTION:\n${pr.body || "[No description provided]"}`,
    "",
    "FILES:",
    formatPatchContext(reviewableFiles),
  ].join("\n");
}

function buildDeepReviewPrompt(
  reviewable: ReviewablePullRequest,
  focus: ReviewFocus,
): string {
  return [
    "You are performing a deep review of a GitHub pull request.",
    "Start from the selected diff and use the additional repository context to validate behavior.",
    "Prioritize correctness, regressions, security issues, and missing tests.",
    "Do not produce style-only feedback.",
    focusInstruction(focus),
    "Prefer dropping weak or speculative findings over mentioning them.",
    "Return findings only in the comments array.",
    "Represent missing tests or concrete follow-up work as findings, not separate categories.",
    "Every finding must include priority, confidence, optional assumption, and 1-3 evidence references.",
    "Evidence must cite only the supplied diff, repository context, or linked issue context.",
    "Keep the summary concise and execution-oriented.",
    "Provide a short risk assessment with a low, medium, or high level and concrete reasons.",
    "",
    `REPOSITORY: ${reviewable.pr.owner}/${reviewable.pr.repo}`,
    `PULL REQUEST: #${reviewable.pr.number}`,
    `TITLE: ${reviewable.pr.title}`,
    `AUTHOR: ${reviewable.pr.author}`,
    `BASE BRANCH: ${reviewable.pr.baseRef}`,
    `HEAD BRANCH: ${reviewable.pr.headRef}`,
    `PR DESCRIPTION:\n${reviewable.pr.body || "[No description provided]"}`,
    "",
    "SELECTED DIFF FILES:",
    formatPatchContext(reviewable.reviewableFiles),
    "",
    "ADDITIONAL CONTEXT:",
    reviewable.deepContextText || "[No additional context available]",
  ].join("\n");
}

function buildVerificationPrompt(reviewable: ReviewablePullRequest, candidate: ModelReview): string {
  return [
    "You are verifying candidate findings for a GitHub pull request review.",
    "Keep only findings that are strongly supported by the supplied diff, repository context, or linked issues.",
    "Remove duplicates, collapse overlapping findings, and tighten vague language.",
    "If evidence is weak or speculative, drop the finding instead of hedging.",
    "Return a complete final review object.",
    "",
    `REPOSITORY: ${reviewable.pr.owner}/${reviewable.pr.repo}`,
    `PULL REQUEST: #${reviewable.pr.number}`,
    "",
    "CANDIDATE REVIEW JSON:",
    JSON.stringify(candidate, null, 2),
    "",
    "DIFF FILES:",
    formatPatchContext(reviewable.reviewableFiles),
    "",
    "ADDITIONAL CONTEXT:",
    reviewable.deepContextText || "[No additional context available]",
  ].join("\n");
}

function validateEnvironment() {
  if (!process.env.OPENAI_API_KEY) {
    throw new ReviewInputError("OPENAI_API_KEY is not configured.", {
      status: 500,
      code: "OPENAI_KEY_MISSING",
      retryable: false,
    });
  }
}

function resolveModelForMode(reviewMode: ReviewMode): string {
  const modeSpecific =
    reviewMode === "deep" ? process.env.OPENAI_MODEL_DEEP : process.env.OPENAI_MODEL_FAST;
  const legacy = process.env.OPENAI_MODEL;
  const fallback = reviewMode === "deep" ? DEFAULT_DEEP_MODEL : DEFAULT_FAST_MODEL;

  return modeSpecific?.trim() || legacy?.trim() || fallback;
}

async function prepareFastReview(pr: PullRequestData): Promise<ReviewablePullRequest> {
  const { reviewableFiles, skippedFiles } = filterReviewableFiles(pr);

  if (pr.changedFiles > MAX_CHANGED_FILES) {
    throw new ReviewInputError(
      `This MVP only reviews pull requests with up to ${MAX_CHANGED_FILES} changed files.`,
      {
        status: 422,
        code: "PR_TOO_LARGE",
        retryable: false,
      },
    );
  }

  if (reviewableFiles.length > MAX_REVIEWABLE_FILES) {
    throw new ReviewInputError(
      `This MVP only reviews pull requests with up to ${MAX_REVIEWABLE_FILES} reviewable files.`,
      {
        status: 422,
        code: "PR_TOO_LARGE",
        retryable: false,
      },
    );
  }

  if (pr.additions + pr.deletions > MAX_TOTAL_CHANGES) {
    throw new ReviewInputError(
      `This MVP only reviews pull requests with up to ${MAX_TOTAL_CHANGES} changed lines.`,
      {
        status: 422,
        code: "PR_TOO_LARGE",
        retryable: false,
      },
    );
  }

  const patchCharacters = reviewableFiles.reduce((total, file) => total + (file.patch?.length ?? 0), 0);

  if (patchCharacters > MAX_PATCH_CHARACTERS) {
    throw new ReviewInputError(
      `This app only reviews pull requests with up to ${MAX_PATCH_CHARACTERS.toLocaleString()} diff characters.`,
      {
        status: 422,
        code: "PR_TOO_LARGE",
        retryable: false,
      },
    );
  }

  if (reviewableFiles.length === 0) {
    throw new ReviewInputError("This pull request does not contain reviewable text patches.", {
      status: 422,
      code: "NO_REVIEWABLE_DIFF",
      retryable: false,
    });
  }

  return {
    pr,
    reviewMode: "fast",
    reviewableFiles,
    skippedFiles,
    truncatedFiles: [],
    supplementalContextFiles: 0,
    linkedIssues: [],
  };
}

async function resolveSupportFileContent(
  pr: PullRequestData,
  supportPath: string,
  abortSignal?: AbortSignal,
): Promise<RepositoryFileContent | null> {
  return await fetchRepositoryFileContent(
    {
      owner: pr.owner,
      repo: pr.repo,
      path: supportPath,
      ref: pr.headSha,
    },
    abortSignal,
  );
}

async function prepareDeepReview(
  pr: PullRequestData,
  callbacks: ReviewCallbacks,
  abortSignal?: AbortSignal,
): Promise<ReviewablePullRequest> {
  const { reviewableFiles, skippedFiles } = filterReviewableFiles(pr);

  if (reviewableFiles.length === 0) {
    throw new ReviewInputError("This pull request does not contain reviewable text patches.", {
      status: 422,
      code: "NO_REVIEWABLE_DIFF",
      retryable: false,
    });
  }

  emitStage(callbacks, "planning", "Scoring changed files for deeper review.");

  const scoredFiles = reviewableFiles
    .map((file) => ({ file, score: scoreReviewFile(file) }))
    .sort((left, right) => right.score - left.score);

  const consideredFiles = scoredFiles.slice(0, DEEP_MAX_CONSIDERED_FILES);
  const selectedFiles = consideredFiles.slice(0, DEEP_MAX_REVIEWED_FILES).map(({ file }) => file);
  const truncatedFiles = [
    ...scoredFiles.slice(DEEP_MAX_CONSIDERED_FILES).map(({ file }) => file.filename),
    ...consideredFiles.slice(DEEP_MAX_REVIEWED_FILES).map(({ file }) => file.filename),
  ];

  emitStage(callbacks, "expanding_context", "Fetching supporting files and linked issue context.");

  const linkedIssues = await fetchLinkedIssues(
    { owner: pr.owner, repo: pr.repo, body: pr.body },
    abortSignal,
  );

  const changedTests = reviewableFiles.filter((file) => isLikelyTestFile(file.filename));
  const changedTestMap = new Map(changedTests.map((file) => [file.filename, file]));
  const selectedFileNames = new Set(selectedFiles.map((file) => file.filename));
  const supportPaths: string[] = [];

  const headContexts = await Promise.all(
    selectedFiles.map(async (file) => {
      const headContent = await fetchRepositoryFileContent(
        {
          owner: pr.owner,
          repo: pr.repo,
          path: file.filename,
          ref: pr.headSha,
        },
        abortSignal,
      );

      if (headContent) {
        for (const specifier of parseRelativeImports(headContent.content)) {
          for (const candidate of resolveImportCandidates(file.filename, specifier)) {
            if (!supportPaths.includes(candidate) && !selectedFileNames.has(candidate)) {
              supportPaths.push(candidate);
            }
          }
        }
      }

      for (const candidate of buildRelatedTestCandidates(file.filename)) {
        if (!supportPaths.includes(candidate) && !selectedFileNames.has(candidate)) {
          supportPaths.push(candidate);
        }
      }

      return {
        file,
        headContent,
      };
    }),
  );

  for (const testFile of changedTests) {
    const root = testFile.filename.replace(/(\.|\/)(test|spec)\.[^/]+$/i, "");
    if (selectedFiles.some((file) => file.filename.replace(/\.[^/.]+$/, "") === root)) {
      if (!supportPaths.includes(testFile.filename) && !selectedFileNames.has(testFile.filename)) {
        supportPaths.push(testFile.filename);
      }
    }
  }

  const supportFiles: RepositoryFileContent[] = [];
  for (const candidate of supportPaths) {
    if (supportFiles.length >= DEEP_MAX_SUPPORT_FILES) {
      truncatedFiles.push(candidate);
      continue;
    }

    const changedTest = changedTestMap.get(candidate);
    const content = changedTest
      ? await fetchRepositoryFileContent(
          {
            owner: pr.owner,
            repo: pr.repo,
            path: changedTest.filename,
            ref: pr.headSha,
          },
          abortSignal,
        )
      : await resolveSupportFileContent(pr, candidate, abortSignal);

    if (!content) {
      continue;
    }

    if (!supportFiles.some((file) => file.path === content.path)) {
      supportFiles.push(content);
    }
  }

  const patchCharacters = selectedFiles.reduce((total, file) => total + (file.patch?.length ?? 0), 0);
  const contextBudget = Math.max(24_000, DEEP_MAX_CONTEXT_CHARACTERS - patchCharacters);
  const contextSegments: ContextSegment[] = [];

  for (const { file, headContent } of headContexts) {
    if (headContent) {
      const headSegment = buildFileContextSegment(file.filename, headContent, "HEAD");
      contextSegments.push({
        label: headSegment.label,
        text: headSegment.segment,
        optional: false,
        countsAsSupplemental: false,
      });
      if (headSegment.truncated) {
        truncatedFiles.push(file.filename);
      }
    }

    if (file.status === "modified" || file.status === "renamed") {
      const baseContent = await fetchRepositoryFileContent(
        {
          owner: pr.owner,
          repo: pr.repo,
          path: file.previousFilename ?? file.filename,
          ref: pr.baseSha,
        },
        abortSignal,
      );

      if (baseContent) {
        const baseSegment = buildFileContextSegment(`${file.filename}@base`, baseContent, "BASE");
        contextSegments.push({
          label: baseSegment.label,
          text: baseSegment.segment,
          optional: true,
          countsAsSupplemental: false,
        });
        if (baseSegment.truncated) {
          truncatedFiles.push(baseSegment.label);
        }
      }
    }
  }

  for (const issue of linkedIssues) {
    const issueSegment = buildIssueContextSegment(issue);
    contextSegments.push({
      label: issueSegment.label,
      text: issueSegment.segment,
      optional: true,
      countsAsSupplemental: false,
    });
    if (issueSegment.truncated) {
      truncatedFiles.push(issueSegment.label);
    }
  }

  for (const supportFile of supportFiles) {
    const supportSegment = buildFileContextSegment(supportFile.path, supportFile, "HEAD");
    contextSegments.push({
      label: supportSegment.label,
      text: supportSegment.segment,
      optional: true,
      countsAsSupplemental: true,
    });
    if (supportSegment.truncated) {
      truncatedFiles.push(supportFile.path);
    }
  }

  const fittedContext = fitContextSegments(contextSegments, contextBudget);

  return {
    pr,
    reviewMode: "deep",
    reviewableFiles: selectedFiles,
    skippedFiles,
    truncatedFiles: Array.from(new Set(truncatedFiles)),
    supplementalContextFiles: fittedContext.supplementalContextFiles,
    linkedIssues,
    deepContextText: fittedContext.text || "[No additional context available]",
  };
}

export async function preparePullRequestForReview(
  pr: PullRequestData,
  reviewMode: ReviewMode,
  callbacks: ReviewCallbacks = {},
  abortSignal?: AbortSignal,
): Promise<ReviewablePullRequest> {
  if (reviewMode === "deep") {
    return await prepareDeepReview(pr, callbacks, abortSignal);
  }

  return await prepareFastReview(pr);
}

function emitPartialOutput(
  partial: {
    summary?: string;
    comments?: Array<unknown>;
  },
  state: PartialStreamState,
  callbacks: ReviewCallbacks,
) {
  if (typeof partial.summary === "string" && partial.summary.length > state.summary.length) {
    const delta = partial.summary.startsWith(state.summary)
      ? partial.summary.slice(state.summary.length)
      : partial.summary;
    state.summary = partial.summary;

    if (delta) {
      callbacks.onSummaryDelta?.(delta);
    }
  }

  if (Array.isArray(partial.comments)) {
    const comments = sortByPriority(dedupeById(partial.comments.flatMap((candidate) => {
      const comment = validateCommentCandidate(candidate);
      return comment ? [comment] : [];
    })));
    const signature = JSON.stringify(comments);
    if (signature !== state.commentsSignature) {
      state.commentsSignature = signature;
      callbacks.onCommentsSnapshot?.(comments);
    }
  }
}

function backfillEvidence(
  evidence: EvidenceItem[],
  fallbackFile: PullRequestFile | undefined,
  preferredFile: string | null,
): EvidenceItem[] {
  if (evidence.length > 0) {
    return evidence;
  }

  const diffContext = buildDiffContext(fallbackFile);
  if (!diffContext) {
    return [];
  }

  return [
    {
      file: preferredFile ?? fallbackFile?.filename ?? null,
      startLine: diffContext.startLine,
      snippet: diffContext.snippet,
      source: "diff",
    },
  ];
}

function finalizeReview(reviewable: ReviewablePullRequest, output: ModelReview): FinalReview {
  const reviewableFileByName = new Map(reviewable.reviewableFiles.map((file) => [file.filename, file]));

  const comments = sortByPriority(
    dedupeById(
      output.comments.map((comment) => {
        const file = comment.file ? reviewableFileByName.get(comment.file) : undefined;
        const evidence = backfillEvidence(comment.evidence, file, comment.file);

        return commentSchema.parse({
          id: toCommentId(comment),
          ...comment,
          evidence,
          diffContext: buildDiffContext(file),
        });
      }),
    ),
  );

  return finalReviewSchema.parse({
    summary: output.summary.trim(),
    commentsByPriority: {
      high: comments.filter((comment) => comment.priority === "high"),
      medium: comments.filter((comment) => comment.priority === "medium"),
      low: comments.filter((comment) => comment.priority === "low"),
    },
    riskAssessment: output.riskAssessment,
    coverage: {
      mode: reviewable.reviewMode,
      reviewedFiles: reviewable.reviewableFiles.length,
      supplementalContextFiles: reviewable.supplementalContextFiles,
      totalFiles: reviewable.pr.files.length,
      skippedFiles: reviewable.skippedFiles,
      truncatedFiles: reviewable.truncatedFiles,
    },
  });
}

function isRetryableModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("schema") || message.includes("json") || message.includes("parse");
}

async function runStructuredReview(
  reviewMode: ReviewMode,
  prompt: string,
  callbacks: ReviewCallbacks,
  abortSignal: AbortSignal | undefined,
  streamPartials: boolean,
): Promise<ModelReview> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < 2) {
    try {
      const result = streamText({
        model: openai(resolveModelForMode(reviewMode)),
        abortSignal,
        temperature: 0.15,
        output: Output.object({
          schema: modelReviewSchema,
        }),
        prompt,
      });

      if (streamPartials) {
        const state: PartialStreamState = {
          summary: "",
          commentsSignature: "",
        };

        for await (const partial of result.partialOutputStream) {
          emitPartialOutput(partial, state, callbacks);
        }
      }

      return await result.output;
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt < 2 && isRetryableModelError(error)) {
        continue;
      }
    }
  }

  throw lastError;
}

export async function runPullRequestReview(
  reviewable: ReviewablePullRequest,
  focus: ReviewFocus,
  callbacks: ReviewCallbacks = {},
  abortSignal?: AbortSignal,
): Promise<FinalReview> {
  validateEnvironment();

  try {
    if (reviewable.reviewMode === "deep") {
      emitStage(callbacks, "reviewing", "Generating candidate findings from the diff and expanded context.");
      const candidate = await runStructuredReview(
        "deep",
        buildDeepReviewPrompt(reviewable, focus),
        callbacks,
        abortSignal,
        false,
      );

      emitStage(callbacks, "verifying_findings", "Verifying findings against the gathered evidence.");
      const verified = await runStructuredReview(
        "deep",
        buildVerificationPrompt(reviewable, candidate),
        callbacks,
        abortSignal,
        true,
      );

      return finalizeReview(reviewable, verified);
    }

    emitStage(callbacks, "reviewing", "Running AI analysis.");
    const output = await runStructuredReview(
      "fast",
      buildFastPrompt(reviewable.pr, reviewable.reviewableFiles, focus),
      callbacks,
      abortSignal,
      true,
    );

    return finalizeReview(reviewable, output);
  } catch (error) {
    if (error instanceof ReviewInputError) {
      throw error;
    }

    throw new ReviewInputError("The review model did not return a valid result.", {
      status: 502,
      code: "REVIEW_FAILED",
      retryable: true,
    });
  }
}
