"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Github, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePullRequestRouteTarget, toReviewPath } from "@/lib/pr-url";
import {
  normalizeReviewFocus,
  normalizeReviewMode,
  reviewFocusOptions,
  reviewModeOptions,
  type ReviewFocus,
  type ReviewMode,
} from "@/lib/review-types";

type PreviewState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | {
      status: "ready";
      key: string;
      preview: {
        owner: string;
        repo: string;
        number: number;
        title: string;
        author: string;
        changedFiles: number;
        additions: number;
        deletions: number;
      };
    }
  | { status: "error"; key: string; message: string };

const focusDescriptions: Record<ReviewFocus, string> = {
  general: "Broad second opinion across correctness, regressions, and maintainability.",
  bugs: "Bias the review toward breakage risk and behavioral regressions.",
  security: "Inspect auth, data exposure, trust boundaries, and unsafe inputs.",
  tests: "Look for missing coverage and weak assertions around the changed paths.",
};

const modeDescriptions: Record<ReviewMode, string> = {
  fast: "Quick pass for the highest-risk issues and merge blockers.",
  deep: "More context gathering for edge cases, tests, and lower-signal defects.",
};

function OptionPill({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
        selected
          ? "border-primary/35 bg-primary/12 text-foreground shadow-[inset_0_0_0_1px_rgba(var(--signal-rgb),0.22)]"
          : "border-border/80 bg-secondary/35 text-secondary-foreground hover:border-primary/25 hover:text-foreground"
      }`}
    >
      <div className="font-ui text-sm font-medium">{title}</div>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div>
    </button>
  );
}

export function HomePageForm() {
  const [prUrl, setPrUrl] = useState("");
  const [focus, setFocus] = useState<ReviewFocus>("general");
  const [mode, setMode] = useState<ReviewMode>("fast");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [error, setError] = useState("");
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
  const router = useRouter();

  const target = useMemo(() => parsePullRequestRouteTarget(prUrl), [prUrl]);
  const targetKey = target ? `${target.owner}/${target.repo}#${target.prNumber}` : null;
  const hasInput = prUrl.trim().length > 0;
  const hasInvalidUrl = hasInput && !target;
  const currentPreviewState =
    targetKey && previewState.status !== "idle" && previewState.key === targetKey
      ? previewState
      : ({ status: "idle" } as const);
  const previewStatusMessage =
    currentPreviewState.status === "loading"
      ? "Loading PR metadata…"
      : currentPreviewState.status === "ready"
        ? `Preview ready for ${currentPreviewState.preview.owner}/${currentPreviewState.preview.repo} pull request ${currentPreviewState.preview.number}.`
        : currentPreviewState.status === "error"
          ? currentPreviewState.message
          : "";

  useEffect(() => {
    if (!target) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPreviewState({ status: "loading", key: `${target.owner}/${target.repo}#${target.prNumber}` });

      try {
        const response = await fetch(
          `/api/review-preview/${target.owner}/${target.repo}/${target.prNumber}`,
          { signal: controller.signal },
        );

        const payload = (await response.json()) as
          | {
              owner: string;
              repo: string;
              number: number;
              title: string;
              author: string;
              changedFiles: number;
              additions: number;
              deletions: number;
            }
          | { message?: string };

        if (!response.ok) {
          const message =
            "message" in payload ? payload.message ?? "Failed to load PR preview." : "Failed to load PR preview.";
          setPreviewState({
            status: "error",
            key: `${target.owner}/${target.repo}#${target.prNumber}`,
            message,
          });
          return;
        }

        setPreviewState({
          status: "ready",
          key: `${target.owner}/${target.repo}#${target.prNumber}`,
          preview: payload as {
            owner: string;
            repo: string;
            number: number;
            title: string;
            author: string;
            changedFiles: number;
            additions: number;
            deletions: number;
          },
        });
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setPreviewState({
          status: "error",
          key: `${target.owner}/${target.repo}#${target.prNumber}`,
          message:
            fetchError instanceof Error ? fetchError.message : "Failed to load PR preview.",
        });
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [target]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!target) {
      setError(prUrl.trim() ? "That doesn't look like a GitHub PR." : "Paste a GitHub PR to start.");
      return;
    }

    setError("");
    router.push(toReviewPath(target, focus, mode));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1 text-left">
            <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Start with the PR
            </div>
            <h2 className="font-ui text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              Paste the URL
            </h2>
          </div>
        </div>

        <div className="relative">
          <label
            htmlFor="pr-url"
            className="mb-2 block text-left font-ui text-sm font-medium text-foreground"
          >
            GitHub Pull Request URL
          </label>
          <Github
            aria-hidden="true"
            className="absolute left-3 top-[calc(50%+0.875rem)] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="pr-url"
            name="prUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://github.com/org/repo/pull/123…"
            value={prUrl}
            aria-describedby="pr-url-help pr-url-status"
            aria-invalid={hasInvalidUrl || Boolean(error)}
            onChange={(event) => {
              setPrUrl(event.target.value);
              if (error) {
                setError("");
              }
            }}
            className="h-12 rounded-xl bg-secondary/70 pl-9 text-sm placeholder:text-muted-foreground/60"
          />
        </div>

        <div id="pr-url-help" className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Example: https://github.com/org/repo/pull/123</span>
          <span className="rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]">
            Public repos only
          </span>
        </div>

        <div id="pr-url-status" aria-live="polite" aria-atomic="true" className="sr-only">
          {error || (hasInvalidUrl ? "That URL does not look like a GitHub pull request." : previewStatusMessage)}
        </div>

        {hasInvalidUrl ? (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            aria-live="polite"
          >
            That URL does not parse as a GitHub pull request. Use the full
            {" "}
            <code>https://github.com/owner/repo/pull/123</code>
            {" "}
            form.
          </div>
        ) : null}

        {target ? (
          <div
            className="rounded-2xl border border-primary/18 bg-[linear-gradient(180deg,rgba(var(--signal-rgb),0.1),rgba(23,28,29,0.72))] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
            aria-live="polite"
            aria-busy={currentPreviewState.status === "loading"}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1.5">
                <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {currentPreviewState.status === "error"
                    ? "Preview unavailable"
                    : currentPreviewState.status === "ready"
                      ? "Preview ready"
                      : "PR detected"}
                </div>
                <div className="font-mono text-sm text-foreground">
                  {target.owner}/{target.repo} #{target.prNumber}
                </div>
              </div>

              {currentPreviewState.status === "loading" ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  Fetching metadata…
                </div>
              ) : null}
            </div>

            {currentPreviewState.status === "ready" ? (
              <div className="mt-4 space-y-3">
                <div className="text-[17px] leading-7 text-foreground">
                  {currentPreviewState.preview.title}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border bg-card px-3 py-1">
                    Author {currentPreviewState.preview.author}
                  </span>
                  <span className="rounded-full border border-border bg-card px-3 py-1">
                    Files {currentPreviewState.preview.changedFiles}
                  </span>
                  <span className="rounded-full border border-border bg-card px-3 py-1 tabular-nums">
                    Lines +{currentPreviewState.preview.additions} -{currentPreviewState.preview.deletions}
                  </span>
                </div>
              </div>
            ) : null}

            {currentPreviewState.status === "error" ? (
              <div className="mt-3 text-sm text-destructive">{currentPreviewState.message}</div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 border-t border-border/70 pt-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-secondary-foreground">
          <button
            type="button"
            aria-expanded={showAdvancedOptions}
            aria-controls="advanced-review-settings"
            onClick={() => setShowAdvancedOptions((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/45 px-3 py-1.5 font-ui text-[11px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {showAdvancedOptions ? "Hide advanced settings" : "Refine review"}
          </button>
          <span>
            Default mode is <span className="text-foreground">general</span> and <span className="text-foreground">fast</span>.
          </span>
        </div>

        <div className="flex flex-col items-stretch gap-2 md:min-w-60">
          <Button type="submit" size="lg" className="h-11 rounded-xl shadow-[0_10px_24px_rgba(var(--signal-rgb),0.2)]">
            Start Review
            <ArrowRight aria-hidden="true" className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          {error ? (
            <p className="text-xs text-destructive" aria-live="polite">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {showAdvancedOptions ? (
        <section
          id="advanced-review-settings"
          className="rounded-2xl border border-border/70 bg-secondary/20 p-4 md:p-5"
        >
          <div className="mb-4 flex flex-col gap-1 text-left">
            <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Review settings
            </div>
            <h3 className="font-ui text-base font-medium text-foreground">
              Adjust focus or depth when the default pass is not enough.
            </h3>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
            <div className="space-y-3">
              <div className="font-ui text-sm text-foreground">Focus</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {reviewFocusOptions.map((option) => {
                  const value = normalizeReviewFocus(option.value);
                  const selected = value === focus;

                  return (
                    <OptionPill
                      key={option.value}
                      selected={selected}
                      title={option.label}
                      description={focusDescriptions[value]}
                      onClick={() => setFocus(value)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-ui text-sm text-foreground">Depth</div>
              <div className="grid gap-3">
                {reviewModeOptions.map((option) => {
                  const value = normalizeReviewMode(option.value);
                  const selected = value === mode;

                  return (
                    <OptionPill
                      key={option.value}
                      selected={selected}
                      title={option.label}
                      description={modeDescriptions[value]}
                      onClick={() => setMode(value)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </form>
  );
}
