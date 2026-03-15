import { z } from "zod";

export const prioritySchema = z.enum(["high", "medium", "low"]);
export const reviewFocusSchema = z.enum(["general", "bugs", "security", "tests"]);
export const reviewModeSchema = z.enum(["fast", "deep"]);

export const reviewFocusOptions = [
  { value: "general", label: "General review" },
  { value: "bugs", label: "Bugs" },
  { value: "security", label: "Security" },
  { value: "tests", label: "Tests" },
] as const;

export const reviewModeOptions = [
  { value: "fast", label: "Fast review" },
  { value: "deep", label: "Deep review" },
] as const;

const diffContextSchema = z.object({
  snippet: z.string().min(1),
  startLine: z.number().int().positive().nullable(),
});

const evidenceSchema = z.object({
  file: z.string().min(1).nullable(),
  startLine: z.number().int().positive().nullable(),
  snippet: z.string().min(1),
  source: z.enum(["diff", "context", "issue"]),
});

const findingMetaSchema = z.object({
  confidence: prioritySchema,
  assumption: z.string().min(1).nullable(),
  evidence: z.array(evidenceSchema).max(3),
});

const baseCommentSchema = z.object({
  priority: prioritySchema,
  file: z.string().min(1).nullable(),
  title: z.string().min(1),
  explanation: z.string().min(1),
  suggestedFix: z.string().min(1).nullable(),
}).merge(findingMetaSchema);

const baseTestGapSchema = z.object({
  priority: prioritySchema,
  file: z.string().min(1).nullable(),
  gap: z.string().min(1),
  whyItMatters: z.string().min(1),
}).merge(findingMetaSchema);

const baseSuggestedFixSchema = z.object({
  priority: prioritySchema,
  file: z.string().min(1).nullable(),
  suggestion: z.string().min(1),
}).merge(findingMetaSchema);

const riskAssessmentSchema = z.object({
  level: prioritySchema,
  reasons: z.array(z.string().min(1)),
});

export const modelReviewSchema = z.object({
  summary: z.string(),
  comments: z.array(baseCommentSchema),
  testGaps: z.array(baseTestGapSchema),
  suggestedFixes: z.array(baseSuggestedFixSchema),
  riskAssessment: riskAssessmentSchema,
});

export const commentSchema = baseCommentSchema.extend({
  id: z.string().min(1),
  diffContext: diffContextSchema.nullable(),
});

export const testGapSchema = baseTestGapSchema.extend({
  id: z.string().min(1),
});

export const suggestedFixSchema = baseSuggestedFixSchema.extend({
  id: z.string().min(1),
});

export const groupedCommentsSchema = z.object({
  high: z.array(commentSchema),
  medium: z.array(commentSchema),
  low: z.array(commentSchema),
});

export const finalReviewSchema = z.object({
  summary: z.string(),
  commentsByPriority: groupedCommentsSchema,
  testGaps: z.array(testGapSchema),
  suggestedFixes: z.array(suggestedFixSchema),
  riskAssessment: riskAssessmentSchema,
  coverage: z.object({
    mode: reviewModeSchema,
    reviewedFiles: z.number().int().nonnegative(),
    supplementalContextFiles: z.number().int().nonnegative(),
    totalFiles: z.number().int().nonnegative(),
    skippedFiles: z.array(z.string()),
    truncatedFiles: z.array(z.string()),
  }),
});

export const reviewRequestSchema = z.object({
  prUrl: z.string().url(),
  mode: reviewModeSchema.optional(),
});

export type Priority = z.infer<typeof prioritySchema>;
export type ReviewFocus = z.infer<typeof reviewFocusSchema>;
export type ReviewMode = z.infer<typeof reviewModeSchema>;
export type ModelReview = z.infer<typeof modelReviewSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type TestGap = z.infer<typeof testGapSchema>;
export type SuggestedFix = z.infer<typeof suggestedFixSchema>;
export type FinalReview = z.infer<typeof finalReviewSchema>;
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

export type StageName =
  | "validating"
  | "fetching_pr"
  | "filtering_files"
  | "planning"
  | "expanding_context"
  | "reviewing"
  | "verifying_findings"
  | "finalizing";

export type StageEvent = {
  stage: StageName;
  message: string;
};

export type ErrorEvent = {
  code: string;
  message: string;
  retryable: boolean;
};

export function normalizeReviewFocus(value: string | null | undefined): ReviewFocus {
  const parsed = reviewFocusSchema.safeParse(value);
  return parsed.success ? parsed.data : "general";
}

export function normalizeReviewMode(value: string | null | undefined): ReviewMode {
  const parsed = reviewModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "fast";
}
