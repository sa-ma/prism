"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, ExternalLink } from "lucide-react";

import { ReviewHeader } from "@/components/review/review-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CachedReview } from "@/lib/review-cache";
import type { StageEvent } from "@/lib/review-types";

type ReviewItemKind = "comment" | "test_gap" | "suggested_fix";

type ReviewItem = {
  id: string;
  kind: ReviewItemKind;
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

function toParagraphs(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const explicitParagraphs = normalized.split(/\n\s*\n/).filter(Boolean);
  if (explicitParagraphs.length > 1) {
    return explicitParagraphs;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 2) {
    return [normalized];
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(" "));
  }
  return paragraphs;
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

function kindWeight(kind: ReviewItemKind) {
  if (kind === "comment") {
    return 0;
  }
  if (kind === "test_gap") {
    return 1;
  }
  return 2;
}

function normalizeItems(entry: CachedReview): ReviewItem[] {
  const items: ReviewItem[] = [
    ...entry.review.commentsByPriority.high,
    ...entry.review.commentsByPriority.medium,
    ...entry.review.commentsByPriority.low,
  ].map((comment) => ({
    id: comment.id,
    kind: "comment" as const,
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
  }));

  items.push(
    ...entry.review.testGaps.map((gap) => ({
      id: gap.id,
      kind: "test_gap" as const,
      priority: gap.priority,
      confidence: gap.confidence,
      title: gap.gap,
      file: gap.file,
      summary: summarizeText(gap.whyItMatters),
      detail: gap.whyItMatters,
      suggestion: null,
      assumption: gap.assumption,
      evidence: gap.evidence,
      diffContext: null,
    })),
  );

  items.push(
    ...entry.review.suggestedFixes.map((fix) => ({
      id: fix.id,
      kind: "suggested_fix" as const,
      priority: fix.priority,
      confidence: fix.confidence,
      title: summarizeText(fix.suggestion),
      file: fix.file,
      summary: summarizeText(fix.suggestion),
      detail: fix.suggestion,
      suggestion: null,
      assumption: fix.assumption,
      evidence: fix.evidence,
      diffContext: null,
    })),
  );

  return items.sort((left, right) => {
    const priorityDelta = priorityWeight(left.priority) - priorityWeight(right.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const kindDelta = kindWeight(left.kind) - kindWeight(right.kind);
    if (kindDelta !== 0) {
      return kindDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

function priorityClasses(priority: ReviewItem["priority"]) {
  if (priority === "high") {
    return {
      badge: "border-red-500/25 bg-red-500/10 text-red-200",
      marker: "bg-red-400",
      active: "border-red-500/20 bg-red-500/8",
    };
  }

  if (priority === "medium") {
    return {
      badge: "border-amber-500/25 bg-amber-500/10 text-amber-200",
      marker: "bg-amber-400",
      active: "border-amber-500/20 bg-amber-500/8",
    };
  }

  return {
    badge: "border-border bg-secondary text-zinc-200",
    marker: "bg-zinc-400",
    active: "border-border bg-secondary/70",
  };
}

function priorityLabel(priority: ReviewItem["priority"]) {
  return priority.toUpperCase();
}

function confidenceLabel(confidence: ReviewItem["confidence"]) {
  return `Confidence ${confidence}`;
}

function kindLabel(kind: ReviewItemKind) {
  if (kind === "comment") {
    return "Finding";
  }
  if (kind === "test_gap") {
    return "Test gap";
  }
  return "Suggestion";
}

function sectionLabel(item: ReviewItem) {
  if (item.kind === "comment") {
    return "Issue";
  }
  if (item.kind === "test_gap") {
    return "Test gap";
  }
  return "Suggestion";
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
}) {
  if (streaming) {
    return {
      label: "Scanning PR",
      eyebrow: "Merge safety",
      tone: "text-primary",
      surface: "border-primary/20 bg-primary/10",
    };
  }

  if (riskLevel === "high" || highFindings > 0) {
    return {
      label: "Hold merge",
      eyebrow: "Merge safety",
      tone: "text-red-200",
      surface: "border-red-500/25 bg-red-500/10 shadow-[0_0_40px_rgba(229,72,77,0.12)]",
    };
  }

  if (riskLevel === "medium" || mediumFindings > 0) {
    return {
      label: "Review before merge",
      eyebrow: "Merge safety",
      tone: "text-amber-100",
      surface: "border-amber-500/25 bg-amber-500/10 shadow-[0_0_36px_rgba(227,134,39,0.1)]",
    };
  }

  return {
    label: hasFindings ? "Merge with follow-up" : "Clear to merge carefully",
    eyebrow: "Merge safety",
    tone: "text-emerald-100",
    surface: "border-emerald-500/25 bg-emerald-500/10 shadow-[0_0_34px_rgba(13,147,115,0.1)]",
  };
}

function primaryLocation(item: ReviewItem) {
  const evidence = item.evidence.find((entry) => entry.file || entry.startLine) ?? null;
  return {
    file: item.file ?? evidence?.file ?? null,
    startLine: evidence?.startLine ?? item.diffContext?.startLine ?? null,
  };
}

function riskTone(level: CachedReview["review"]["riskAssessment"]["level"]) {
  if (level === "high") {
    return "border-red-500/25 bg-red-500/10 text-red-100";
  }

  if (level === "medium") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-100";
  }

  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
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

function CodeSnippet({
  title,
  startLine,
  snippet,
  defaultOpen = false,
}: {
  title: string;
  startLine: number | null;
  snippet: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = snippet.split("\n");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((current) => !current)}>
          {open ? "Hide code" : "Show code"}
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </div>

      {open ? (
        <div className="overflow-hidden rounded-lg border border-border bg-secondary/40">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-2">
            <div className="font-mono text-xs text-muted-foreground">
              {startLine ? `Line ${startLine}` : "Patch excerpt"}
            </div>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-zinc-200">
            <code>
              {lines.map((line, index) => {
                const tone =
                  line.startsWith("+") && !line.startsWith("+++")
                    ? "bg-emerald-500/10 text-emerald-100"
                    : line.startsWith("-") && !line.startsWith("---")
                      ? "bg-red-500/10 text-red-100"
                      : line.startsWith("@@")
                        ? "text-sky-200"
                        : "text-zinc-300";

                return (
                  <div key={`${line}-${index}`} className={`rounded px-2 py-0.5 ${tone}`}>
                    {line || " "}
                  </div>
                );
              })}
            </code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: ReviewItem["evidence"] }) {
  if (!evidence.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Evidence
      </div>
      <div className="space-y-4">
        {evidence.map((item, index) => (
          <div key={`${item.file ?? "context"}-${item.startLine ?? index}-${index}`} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border border-border bg-secondary px-2 py-1 uppercase">
                {item.source}
              </span>
              {item.file ? <span className="font-mono">{item.file}</span> : null}
              {item.startLine ? <span>Line {item.startLine}</span> : null}
            </div>
            <CodeSnippet title="Evidence snippet" startLine={item.startLine} snippet={item.snippet} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewDetail({ item }: { item: ReviewItem }) {
  const sections = toParagraphs(item.detail);
  const location = primaryLocation(item);
  const evidenceFile = item.evidence.find((entry) => entry.file)?.file ?? null;
  const codeContext = item.diffContext ?? item.evidence[0] ?? null;
  const additionalEvidence =
    item.diffContext && item.evidence.length > 0
      ? item.evidence
      : item.evidence.slice(codeContext && !item.diffContext ? 1 : 0);
  const priorityTone = priorityClasses(item.priority);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-ui inline-flex rounded-md border px-2 py-1 text-[11px] tracking-[0.14em] ${
              priorityTone.badge
            }`}
          >
            {priorityLabel(item.priority)}
          </span>
          <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] capitalize text-muted-foreground">
            {confidenceLabel(item.confidence)}
          </span>
          <span className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {kindLabel(item.kind)}
          </span>
        </div>

        <div className="space-y-1.5">
          <h3 className="font-ui text-xl font-medium tracking-tight text-foreground">{item.title}</h3>
          {location.file ? <div className="font-mono text-xs text-muted-foreground">{location.file}</div> : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-background/55 px-4 py-3">
          <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Confidence
          </div>
          <div className="mt-1 text-sm capitalize text-foreground">{item.confidence}</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/55 px-4 py-3">
          <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            File
          </div>
          <div className="mt-1 truncate font-mono text-sm text-foreground">
            {location.file ?? evidenceFile ?? "Context only"}
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/55 px-4 py-3">
          <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Lines affected
          </div>
          <div className="mt-1 text-sm text-foreground">
            {location.startLine ? `Around line ${location.startLine}` : "Not pinned to a line"}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {sectionLabel(item)}
        </div>
        <div className="space-y-3 text-[15px] leading-7 text-secondary-foreground">
          {sections.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>

      {codeContext ? (
        <div
          className={`space-y-3 rounded-2xl border px-4 py-4 ${priorityTone.active} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Code context
              </div>
              <div className="mt-1 text-sm text-secondary-foreground">
                Review the most relevant snippet before deciding whether to merge.
              </div>
            </div>
            {location.file ? <div className="font-mono text-xs text-muted-foreground">{location.file}</div> : null}
          </div>

          <CodeSnippet
            title={item.diffContext ? "Diff context" : "Primary evidence"}
            startLine={codeContext.startLine}
            snippet={codeContext.snippet}
            defaultOpen
          />
        </div>
      ) : null}

      {item.assumption ? (
        <div className="space-y-2">
          <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Assumption
          </div>
          <p className="text-[15px] leading-7 text-secondary-foreground">{item.assumption}</p>
        </div>
      ) : null}

      <EvidenceList evidence={additionalEvidence} />

      {item.suggestion ? (
        <div className="space-y-2">
          <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Suggested fix
          </div>
          <div className="space-y-3 text-[15px] leading-7 text-foreground">
            {toParagraphs(item.suggestion).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      ) : null}

    </div>
  );
}

export function PRReviewShell({
  entry,
  streaming = false,
  stage,
}: {
  entry: CachedReview;
  streaming?: boolean;
  stage?: StageEvent;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showSkippedFiles, setShowSkippedFiles] = useState(false);
  const detailPaneRef = useRef<HTMLDivElement | null>(null);

  const reviewItems = useMemo(() => normalizeItems(entry), [entry]);

  const findingCounts = useMemo(
    () => ({
      high: reviewItems.filter((item) => item.priority === "high").length,
      medium: reviewItems.filter((item) => item.priority === "medium").length,
      low: reviewItems.filter((item) => item.priority === "low").length,
    }),
    [reviewItems],
  );
  const topFinding = reviewItems[0] ?? null;

  const activeItemId =
    selectedItemId && reviewItems.some((item) => item.id === selectedItemId)
      ? selectedItemId
      : reviewItems[0]?.id ?? null;

  const activeItem = useMemo(
    () => reviewItems.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, reviewItems],
  );

  const hasRealMetadata = entry.pr.changedFiles > 0 || Boolean(entry.pr.author);
  const coverageLabel = `Reviewed ${entry.review.coverage.reviewedFiles} of ${entry.review.coverage.totalFiles} files`;
  const highPriorityCountLabel = `${findingCounts.high} high-priority ${findingCounts.high === 1 ? "finding" : "findings"}`;
  const activeStageLabel = stage ? STAGE_LABELS.find((item) => item.stage === stage.stage)?.label : null;
  const stageSummary = streaming && stage ? `${activeStageLabel ?? "Current stage"}: ${stage.message}` : null;
  const mergeDecision = decisionState({
    riskLevel: entry.review.riskAssessment.level,
    highFindings: findingCounts.high,
    mediumFindings: findingCounts.medium,
    hasFindings: reviewItems.length > 0,
    streaming,
  });

  useEffect(() => {
    detailPaneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeItemId]);

  const copyableReview = useMemo(() => {
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
        lines.push(`- [${item.priority.toUpperCase()}] ${item.title}${item.file ? ` (${item.file})` : ""}`);
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
  }, [entry, reviewItems]);

  async function handleCopy() {
    await navigator.clipboard.writeText(copyableReview);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div className="flex h-svh flex-col">
      <ReviewHeader subtitle={`${entry.pr.repo} #${entry.pr.number}`} />

      <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 font-body">
          <section className="overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(180deg,rgba(var(--signal-rgb),0.08),rgba(18,22,23,0.98)_36%)] shadow-[0_16px_42px_rgba(0,0,0,0.24)]">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.18fr)_minmax(18rem,0.82fr)]">
              <div className="space-y-5 p-5 md:p-6">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-border bg-secondary/70 px-3 py-1 font-ui uppercase tracking-[0.18em] text-muted-foreground">
                    {entry.mode} review
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 font-ui uppercase tracking-[0.18em] ${riskTone(entry.review.riskAssessment.level)}`}
                  >
                    Risk {entry.review.riskAssessment.level}
                  </span>
                </div>

                <div className="space-y-2">
                  <h1 className="font-ui text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl">
                    {hasRealMetadata
                      ? entry.pr.title
                      : `Reviewing ${entry.pr.owner}/${entry.pr.repo} #${entry.pr.number}`}
                  </h1>
                  <a
                    href={entry.pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {entry.pr.owner}/{entry.pr.repo} #{entry.pr.number}
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </a>
                  {stageSummary ? (
                    <p className="text-sm leading-6 text-secondary-foreground">{stageSummary}</p>
                  ) : null}
                </div>

                <div className={`rounded-3xl border px-5 py-5 ${mergeDecision.surface}`}>
                  <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {mergeDecision.eyebrow}
                  </div>
                  <div className={`mt-2 font-ui text-3xl font-semibold tracking-[-0.04em] md:text-4xl ${mergeDecision.tone}`}>
                    {mergeDecision.label}
                  </div>
                  <div className="mt-3 max-w-xl text-sm leading-6 text-secondary-foreground">
                    {reviewOutlook({
                      riskLevel: entry.review.riskAssessment.level,
                      highFindings: findingCounts.high,
                      mediumFindings: findingCounts.medium,
                      hasFindings: reviewItems.length > 0,
                      streaming,
                    })}
                  </div>
                </div>
              </div>

              <div className="border-t border-border/70 bg-background/20 p-5 md:p-6 lg:border-t-0 lg:border-l">
                <div className="grid gap-3">
                  <div className="rounded-2xl border border-border/70 bg-background/40 px-4 py-4">
                    <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      High-priority findings
                    </div>
                    <div className="mt-2 text-3xl font-semibold text-foreground">{findingCounts.high}</div>
                    <div className="mt-1 text-sm text-secondary-foreground">Merge blockers surfaced</div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/40 px-4 py-4">
                    <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Coverage
                    </div>
                    <div className="mt-2 text-3xl font-semibold text-foreground">
                      {entry.review.coverage.reviewedFiles}/{entry.review.coverage.totalFiles}
                    </div>
                    <div className="mt-1 text-sm text-secondary-foreground">Files reviewed directly</div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/40 px-4 py-4">
                    <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Changed lines
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-foreground">
                      {entry.pr.additions + entry.pr.deletions}
                    </div>
                    <div className="mt-1 text-sm text-secondary-foreground">
                      +{entry.pr.additions} / -{entry.pr.deletions}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border/70 px-5 py-4 md:px-6">
              <div className="max-w-3xl">
                {topFinding ? (
                  <div className="space-y-2">
                    <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Top issue
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em]">
                      <span
                        className={`rounded-md border px-2 py-1 font-ui ${priorityClasses(topFinding.priority).badge}`}
                      >
                        {priorityLabel(topFinding.priority)}
                      </span>
                      <span className="rounded-md border border-border bg-secondary/70 px-2 py-1 text-muted-foreground">
                        {confidenceLabel(topFinding.confidence)}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-foreground">{topFinding.title}</div>
                    <div className="text-sm leading-6 text-secondary-foreground">{topFinding.summary}</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="font-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Decision context
                    </div>
                    <div className="text-sm leading-6 text-secondary-foreground">
                      {entry.review.riskAssessment.reasons[0] ?? coverageLabel ?? highPriorityCountLabel}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {reviewItems.length ? (
            <Card className="gap-0">
              <CardHeader className="border-b border-border/70">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="font-ui text-sm">Prioritized findings</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Triage the queue from highest risk to lowest confidence-adjusted follow-up.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-200">
                      {findingCounts.high} High
                    </span>
                    <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-200">
                      {findingCounts.medium} Medium
                    </span>
                    <span className="rounded-md border border-border bg-secondary px-2 py-1 text-zinc-200">
                      {findingCounts.low} Low
                    </span>
                  </div>
                </div>
              </CardHeader>

              <div className="grid min-h-[30rem] grid-cols-1 lg:h-[min(72vh,56rem)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-stretch">
                <div className="min-h-0 border-b border-border/70 lg:border-b-0 lg:border-r lg:border-border/70">
                  <div className="h-full p-2 lg:min-h-0 lg:overflow-y-auto">
                    {reviewItems.map((item) => {
                      const classes = priorityClasses(item.priority);
                      const active = activeItem?.id === item.id;
                      const location = primaryLocation(item);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className={`mb-2 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 text-left transition-[border-color,background-color,box-shadow,transform] last:mb-0 ${
                            active
                              ? `${classes.active} ${item.priority === "high" ? "shadow-[0_0_28px_rgba(229,72,77,0.12),inset_0_0_0_1px_rgba(255,255,255,0.03)]" : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"}`
                              : "border-border/70 bg-transparent hover:bg-secondary/40 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] hover:translate-x-[2px]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${classes.marker}`} />
                              <span
                                className={`font-ui inline-flex rounded-md border px-1.5 py-0.5 text-[10px] tracking-[0.14em] ${classes.badge}`}
                              >
                                {priorityLabel(item.priority)}
                              </span>
                              <span className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                {kindLabel(item.kind)}
                              </span>
                            </div>
                            <span className="rounded-md border border-border bg-secondary/70 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                              {item.confidence}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div className="font-ui text-sm font-medium text-foreground">{item.title}</div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              {location.file ? (
                                <span className="font-mono text-[11px]">{location.file}</span>
                              ) : (
                                <span>Context only</span>
                              )}
                              {location.startLine ? <span>Line {location.startLine}</span> : null}
                            </div>
                            <div className="text-sm leading-6 text-secondary-foreground">{item.summary}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div ref={detailPaneRef} className="min-h-0 bg-background/20 p-4 lg:overflow-y-auto lg:p-5">
                  {activeItem ? (
                    <ReviewDetail key={activeItem.id} item={activeItem} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Select a finding to inspect.
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ) : streaming ? (
            <Card size="sm">
              <CardHeader className="border-b border-border/70">
                <CardTitle className="font-ui text-sm">Prioritized findings</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="font-ui text-base font-medium text-foreground">
                    Findings will appear here as they are verified
                  </div>
                  <p className="text-[15px] leading-7 text-secondary-foreground">
                    The reviewer is still working through the diff and gathering enough evidence to
                    promote issues into the workspace.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card size="sm">
              <CardHeader className="border-b border-border/70">
                <CardTitle className="font-ui text-sm">Prioritized findings</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="font-ui text-base font-medium text-foreground">No strong findings surfaced</div>
                  <p className="text-[15px] leading-7 text-secondary-foreground">
                    The review completed without issues strong enough to promote into the main findings workspace.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {entry.review.summary ? (
            <section className="border-t border-border/70 pt-4">
              <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
                <div>
                  <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Review summary
                  </div>
                </div>
                <div className="space-y-3 text-[15px] leading-7 text-secondary-foreground">
                  {toParagraphs(entry.review.summary).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <section className="border-t border-border/70 pt-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {entry.review.coverage.supplementalContextFiles > 0 ? (
                  <span>Context files {entry.review.coverage.supplementalContextFiles}</span>
                ) : null}
                {entry.review.coverage.skippedFiles.length ? (
                  <button
                    type="button"
                    onClick={() => setShowSkippedFiles((current) => !current)}
                    className="text-left transition-colors hover:text-foreground"
                  >
                    Skipped {entry.review.coverage.skippedFiles.length} files
                  </button>
                ) : null}
                {entry.review.coverage.truncatedFiles.length ? (
                  <span>Truncated {entry.review.coverage.truncatedFiles.length} items</span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {!streaming ? (
                  <Button size="sm" onClick={handleCopy}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {copyState === "copied" ? "Copied" : "Copy Review"}
                  </Button>
                ) : null}
                <Link href="/">
                  <Button size="sm" variant="outline">Review Another PR</Button>
                </Link>
              </div>
            </div>

            {!streaming && showSkippedFiles && entry.review.coverage.skippedFiles.length ? (
              <div className="mt-4 border-t border-border/70 pt-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {entry.review.coverage.skippedFiles.map((filename) => (
                      <span
                        key={filename}
                        className="rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-muted-foreground"
                      >
                        {filename}
                      </span>
                    ))}
                  </div>
                  {entry.review.coverage.truncatedFiles.length ? (
                    <div className="space-y-2">
                      <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Truncated context
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {entry.review.coverage.truncatedFiles.map((filename) => (
                          <span
                            key={filename}
                            className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-mono text-xs text-amber-200"
                          >
                            {filename}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
