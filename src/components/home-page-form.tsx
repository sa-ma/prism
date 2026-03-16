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
      className={`flex h-full flex-col border px-3 py-3 text-left transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 ${
        selected
          ? "border-foreground bg-accent text-foreground"
          : "border-border bg-background text-secondary-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <div className="font-ui text-xs font-medium uppercase tracking-[0.12em]">{title}</div>
      <div className="font-ui mt-2 flex-1 text-sm leading-6 tracking-[-0.02em] text-muted-foreground">
        {description}
      </div>
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <section className="space-y-4">
        <div className="space-y-1 text-left">
          <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Review input
          </div>
          <h2 className="font-ui text-lg font-semibold tracking-tight text-foreground md:text-xl">
            Paste the PR URL
          </h2>
        </div>

        <div className="relative">
          <label
            htmlFor="pr-url"
            className="mb-2 block text-left font-ui text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
          >
            GitHub Pull Request URL
          </label>
          <Github
            aria-hidden="true"
            className="absolute top-[calc(50%+0.875rem)] left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="pr-url"
            name="prUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://github.com/org/repo/pull/123"
            value={prUrl}
            aria-describedby="pr-url-help pr-url-status"
            aria-invalid={hasInvalidUrl || Boolean(error)}
            onChange={(event) => {
              setPrUrl(event.target.value);
              if (error) {
                setError("");
              }
            }}
            className="h-[52px] pl-9 text-sm placeholder:text-muted-foreground/60 md:text-[15px]"
          />
        </div>

        <div
          id="pr-url-help"
          className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
        >
          <span className="font-ui border border-border bg-muted px-2 py-1">Public repos only</span>
        </div>

        <div id="pr-url-status" aria-live="polite" aria-atomic="true" className="sr-only">
          {error || (hasInvalidUrl ? "That URL does not look like a GitHub pull request." : previewStatusMessage)}
        </div>

        {hasInvalidUrl ? (
          <div
            className="font-ui border border-border bg-muted px-4 py-3 text-sm leading-6 tracking-[-0.02em] text-foreground"
            aria-live="polite"
          >
            That URL does not parse as a GitHub pull request. Use the full{" "}
            <code>https://github.com/owner/repo/pull/123</code> form.
          </div>
        ) : null}

        {target ? (
          <div className="border border-border bg-muted p-4" aria-live="polite" aria-busy={currentPreviewState.status === "loading"}>
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1.5">
                <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {currentPreviewState.status === "error"
                    ? "Preview unavailable"
                    : currentPreviewState.status === "ready"
                      ? "Preview ready"
                      : "PR detected"}
                </div>
                <div className="font-ui text-sm tracking-[-0.02em] text-foreground">
                  {target.owner}/{target.repo} #{target.prNumber}
                </div>
              </div>

              {currentPreviewState.status === "loading" ? (
                <div className="inline-flex items-center gap-2 border border-border bg-background px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-foreground">
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  Fetching metadata
                </div>
              ) : null}
            </div>

            {currentPreviewState.status === "ready" ? (
              <div className="mt-4 space-y-3">
                <div className="font-ui text-[15px] leading-7 tracking-[-0.02em] text-foreground">
                  {currentPreviewState.preview.title}
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <span className="border border-border bg-background px-2.5 py-1">
                    Author {currentPreviewState.preview.author}
                  </span>
                  <span className="border border-border bg-background px-2.5 py-1">
                    Files {currentPreviewState.preview.changedFiles}
                  </span>
                  <span className="border border-border bg-background px-2.5 py-1 tabular-nums">
                    Lines +{currentPreviewState.preview.additions} -{currentPreviewState.preview.deletions}
                  </span>
                </div>
              </div>
            ) : null}

            {currentPreviewState.status === "error" ? (
              <div className="font-ui mt-3 text-sm leading-6 tracking-[-0.02em] text-foreground">
                {currentPreviewState.message}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="font-ui flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-secondary-foreground">
          <button
            type="button"
            aria-expanded={showAdvancedOptions}
            aria-controls="advanced-review-settings"
            onClick={() => setShowAdvancedOptions((current) => !current)}
            className="inline-flex items-center gap-2 border border-border bg-background px-3 py-1.5 font-ui text-[11px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {showAdvancedOptions ? "Hide advanced settings" : "Refine review"}
          </button>
          <span>
            Default mode is <span className="text-foreground">general</span> and{" "}
            <span className="text-foreground">fast</span>.
          </span>
        </div>

        {showAdvancedOptions ? (
          <section id="advanced-review-settings" className="border border-border bg-background p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-1 text-left">
              <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Review settings
              </div>
              <h3 className="font-ui text-base font-medium tracking-[-0.02em] text-foreground">
                Adjust focus or depth when the default pass is not enough.
              </h3>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
              <div className="space-y-3">
                <div className="font-ui text-sm text-foreground">Focus</div>
                <div className="grid gap-2 sm:grid-cols-2">
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
                <div className="grid gap-2">
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
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
        <p className="font-ui text-sm leading-6 tracking-[-0.02em] text-muted-foreground">
          The review opens in a dedicated workspace with staged progress and cached results.
        </p>

        <div className="flex flex-col items-stretch gap-2 md:min-w-60">
          <Button type="submit" size="lg" className="h-11">
            Start review
            <ArrowRight aria-hidden="true" className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          {error ? (
            <p className="text-xs text-foreground" aria-live="polite">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
