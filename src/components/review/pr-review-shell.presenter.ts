import { toReviewPath } from "@/lib/pr-url";
import type { CachedReview } from "@/lib/review-cache";
import { reviewModeOptions, type StageEvent } from "@/lib/review-types";

type ReviewItem = {
  id: string;
  priority: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  title: string;
  file?: string | null;
  summary: string;
  detail: string;
  suggestion?: string | null;
  assumption?: string | null;
  evidence: Array<{
    file: string | null;
    startLine: number | null;
    snippet: string;
    source: "diff" | "context" | "issue";
  }>;
  diffContext?: { snippet: string; startLine: number | null } | null;
};

type PriorityTone = {
  badge: string;
  marker: string;
  active: string;
};

export type ReviewFindingViewModel = ReviewItem & {
  priorityLabel: string;
  priorityRiskLabel: string;
  priorityTone: PriorityTone;
  location: {
    file: string | null;
    startLine: number | null;
  };
  evidenceFile: string | null;
  codeContext: { snippet: string; startLine: number | null } | null;
  additionalEvidence: ReviewItem["evidence"];
};

export type ReviewDecisionViewModel = {
  label: string;
  tone: string;
};

export type ReviewShellViewModel = {
  headerSubtitle: string;
  title: string;
  repoLabel: string;
  prUrl: string;
  modeLinks: Array<{
    value: string;
    label: string;
    href: string;
    active: boolean;
  }>;
  mergeDecision: ReviewDecisionViewModel;
  reviewOutlook: string;
  stageSummary: string | null;
  metadataChips: string[];
  heroContext: {
    label: string;
    title: string | null;
    body: string;
  };
  findings: ReviewFindingViewModel[];
  findingCounts: {
    high: number;
    medium: number;
    low: number;
  };
  reviewSummary: string;
  coverage: {
    supplementalContextFiles: number;
    skippedFiles: string[];
    truncatedFiles: string[];
  };
  copyableReview: string;
};

const STAGE_LABELS: Array<{ stage: StageEvent["stage"]; label: string }> = [
  { stage: "validating", label: "Fetching PR metadata" },
  { stage: "fetching_pr", label: "Downloading changed files" },
  { stage: "filtering_files", label: "Preparing review input" },
  { stage: "planning", label: "Scoring risky files" },
  { stage: "expanding_context", label: "Fetching extra context" },
  { stage: "reviewing", label: "Running AI analysis" },
  { stage: "verifying_findings", label: "Verifying findings" },
  { stage: "finalizing", label: "Finalizing review" },
];

function summarizeText(text: string) {
  const [firstSentence] = text.split(/(?<=[.!?])\s+/);
  return firstSentence || text;
}

function priorityWeight(priority: ReviewItem["priority"]) {
  if (priority === "high") {
    return 0;
  }
  if (priority === "medium") {
    return 1;
  }
  return 2;
}

function priorityClasses(priority: ReviewItem["priority"]): PriorityTone {
  if (priority === "high") {
    return {
      badge: "border-foreground bg-foreground text-background",
      marker: "bg-foreground",
      active: "border-foreground bg-accent",
    };
  }

  if (priority === "medium") {
    return {
      badge: "border-zinc-500 bg-muted text-foreground",
      marker: "bg-zinc-300",
      active: "border-zinc-500 bg-muted",
    };
  }

  return {
    badge: "border-border bg-background text-muted-foreground",
    marker: "bg-zinc-600",
    active: "border-border bg-background",
  };
}

function priorityLabel(priority: ReviewItem["priority"]) {
  return priority.toUpperCase();
}

function priorityRiskLabel(priority: ReviewItem["priority"]) {
  return `${priority.toUpperCase()} RISK`;
}

function primaryLocation(item: ReviewItem) {
  const evidence = item.evidence.find((entry) => entry.file || entry.startLine) ?? null;
  return {
    file: item.file ?? evidence?.file ?? null,
    startLine: evidence?.startLine ?? item.diffContext?.startLine ?? null,
  };
}

function normalizeItems(entry: CachedReview): ReviewFindingViewModel[] {
  return [
    ...entry.review.commentsByPriority.high,
    ...entry.review.commentsByPriority.medium,
    ...entry.review.commentsByPriority.low,
  ]
    .map((comment) => {
      const item: ReviewItem = {
        id: comment.id,
        priority: comment.priority,
        confidence: comment.confidence,
        title: comment.title,
        file: comment.file,
        summary: summarizeText(comment.explanation),
        detail: comment.explanation,
        suggestion: comment.suggestedFix,
        assumption: comment.assumption,
        evidence: comment.evidence,
        diffContext: comment.diffContext,
      };
      const location = primaryLocation(item);
      const evidenceFile = item.evidence.find((entry) => entry.file)?.file ?? null;
      const codeContext = item.diffContext ?? item.evidence[0] ?? null;
      const additionalEvidence =
        item.diffContext && item.evidence.length > 0
          ? item.evidence
          : item.evidence.slice(codeContext && !item.diffContext ? 1 : 0);

      return {
        ...item,
        priorityLabel: priorityLabel(item.priority),
        priorityRiskLabel: priorityRiskLabel(item.priority),
        priorityTone: priorityClasses(item.priority),
        location,
        evidenceFile,
        codeContext,
        additionalEvidence,
      };
    })
    .sort((left, right) => {
      const priorityDelta = priorityWeight(left.priority) - priorityWeight(right.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.title.localeCompare(right.title);
    });
}

function decisionState({
  riskLevel,
  highFindings,
  mediumFindings,
  hasFindings,
  streaming,
}: {
  riskLevel: CachedReview["review"]["riskAssessment"]["level"];
  highFindings: number;
  mediumFindings: number;
  hasFindings: boolean;
  streaming: boolean;
}): ReviewDecisionViewModel {
  if (streaming) {
    return {
      label: "Scanning PR",
      tone: "text-foreground",
    };
  }

  if (riskLevel === "high" || highFindings > 0) {
    return {
      label: "Hold merge",
      tone: "text-foreground",
    };
  }

  if (riskLevel === "medium" || mediumFindings > 0) {
    return {
      label: "Review before merge",
      tone: "text-foreground",
    };
  }

  return {
    label: hasFindings ? "Merge with follow-up" : "Clear to merge carefully",
    tone: "text-foreground",
  };
}

function reviewOutlook({
  riskLevel,
  highFindings,
  mediumFindings,
  hasFindings,
  streaming,
}: {
  riskLevel: CachedReview["review"]["riskAssessment"]["level"];
  highFindings: number;
  mediumFindings: number;
  hasFindings: boolean;
  streaming: boolean;
}) {
  if (streaming) {
    return "A merge recommendation is still forming as the review stream verifies issues and coverage.";
  }

  if (riskLevel === "high" || highFindings > 0) {
    return "Hold merge until the highest-priority issue is understood or fixed.";
  }

  if (riskLevel === "medium" || mediumFindings > 0) {
    return "Merge needs a closer pass, but the current risk looks containable.";
  }

  if (hasFindings) {
    return "No critical blockers surfaced, but there are follow-ups worth checking before merge.";
  }

  return "No strong issues surfaced in the main workspace.";
}

function buildCopyableReview(entry: CachedReview, reviewItems: ReviewFindingViewModel[]) {
  const lines = [
    `${entry.pr.owner}/${entry.pr.repo} #${entry.pr.number}`,
    "",
    `Mode: ${entry.mode}`,
    "",
    "Summary",
    entry.review.summary || "No summary provided.",
    "",
  ];

  if (reviewItems.length) {
    lines.push(`Review Items (${reviewItems.length})`);
    for (const item of reviewItems) {
      lines.push(`- [${item.priorityLabel}] ${item.title}${item.file ? ` (${item.file})` : ""}`);
      lines.push(`  Confidence: ${item.confidence}`);
      lines.push(`  ${item.detail}`);
      if (item.assumption) {
        lines.push(`  Assumption: ${item.assumption}`);
      }
      for (const evidence of item.evidence) {
        lines.push(
          `  Evidence: [${evidence.source}] ${evidence.file ?? "context"}${evidence.startLine ? `:${evidence.startLine}` : ""} ${evidence.snippet}`,
        );
      }
      if (item.suggestion) {
        lines.push(`  Suggested fix: ${item.suggestion}`);
      }
    }
    lines.push("");
  }

  lines.push(`Risk: ${entry.review.riskAssessment.level}`);
  lines.push(
    `Coverage: reviewed ${entry.review.coverage.reviewedFiles} of ${entry.review.coverage.totalFiles} files`,
  );
  if (entry.review.coverage.supplementalContextFiles > 0) {
    lines.push(`Supplemental context files: ${entry.review.coverage.supplementalContextFiles}`);
  }
  if (entry.review.coverage.truncatedFiles.length > 0) {
    lines.push(`Truncated context: ${entry.review.coverage.truncatedFiles.join(", ")}`);
  }

  return lines.join("\n");
}

export function buildReviewShellViewModel(
  entry: CachedReview,
  streaming = false,
  stage?: StageEvent,
): ReviewShellViewModel {
  const findings = normalizeItems(entry);
  const findingCounts = {
    high: findings.filter((item) => item.priority === "high").length,
    medium: findings.filter((item) => item.priority === "medium").length,
    low: findings.filter((item) => item.priority === "low").length,
  };
  const hasRealMetadata = entry.pr.changedFiles > 0 || Boolean(entry.pr.author);
  const coverageLabel = `Reviewed ${entry.review.coverage.reviewedFiles} of ${entry.review.coverage.totalFiles} files`;
  const highPriorityCountLabel = `${findingCounts.high} high-priority ${findingCounts.high === 1 ? "finding" : "findings"}`;
  const activeStageLabel = stage ? STAGE_LABELS.find((item) => item.stage === stage.stage)?.label : null;
  const stageSummary = streaming && stage ? `${activeStageLabel ?? "Current stage"}: ${stage.message}` : null;
  const mergeDecision = decisionState({
    riskLevel: entry.review.riskAssessment.level,
    highFindings: findingCounts.high,
    mediumFindings: findingCounts.medium,
    hasFindings: findings.length > 0,
    streaming,
  });
  const topFinding = findings[0] ?? null;

  return {
    headerSubtitle: `${entry.pr.repo} #${entry.pr.number}`,
    title: hasRealMetadata
      ? entry.pr.title
      : `Reviewing ${entry.pr.owner}/${entry.pr.repo} #${entry.pr.number}`,
    repoLabel: `${entry.pr.owner}/${entry.pr.repo} #${entry.pr.number}`,
    prUrl: entry.pr.url,
    modeLinks: reviewModeOptions.map((option) => ({
      value: option.value,
      label: option.label,
      href: toReviewPath(
        {
          owner: entry.pr.owner,
          repo: entry.pr.repo,
          prNumber: String(entry.pr.number),
        },
        entry.focus,
        option.value,
      ),
      active: entry.mode === option.value,
    })),
    mergeDecision,
    reviewOutlook: reviewOutlook({
      riskLevel: entry.review.riskAssessment.level,
      highFindings: findingCounts.high,
      mediumFindings: findingCounts.medium,
      hasFindings: findings.length > 0,
      streaming,
    }),
    stageSummary,
    metadataChips: [
      `Risk ${entry.review.riskAssessment.level}`,
      `${findingCounts.high} high`,
      `${findingCounts.medium} medium`,
      `${findingCounts.low} low`,
      `${entry.review.coverage.reviewedFiles}/${entry.review.coverage.totalFiles} files reviewed`,
      `${entry.pr.additions + entry.pr.deletions} changed lines`,
    ],
    heroContext: topFinding
      ? {
          label: "Top issue",
          title: topFinding.title,
          body: topFinding.summary,
        }
      : {
          label: "Decision context",
          title: null,
          body: entry.review.riskAssessment.reasons[0] ?? coverageLabel ?? highPriorityCountLabel,
        },
    findings,
    findingCounts,
    reviewSummary: entry.review.summary,
    coverage: {
      supplementalContextFiles: entry.review.coverage.supplementalContextFiles,
      skippedFiles: entry.review.coverage.skippedFiles,
      truncatedFiles: entry.review.coverage.truncatedFiles,
    },
    copyableReview: buildCopyableReview(entry, findings),
  };
}
