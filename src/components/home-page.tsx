import { Eye, ScanSearch, ShieldAlert, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { HomePageForm } from "@/components/home-page-form";

const setupHighlights = [
  {
    icon: ScanSearch,
    title: "Decision first",
    description: "Surface merge risk and top blockers before reading the diff.",
  },
  {
    icon: Eye,
    title: "Evidence attached",
    description: "Every surfaced issue keeps its file path, snippet, and remediation nearby.",
  },
  {
    icon: Sparkles,
    title: "Built for public PRs",
    description: "Validate the URL, preview the PR, then stream the review without extra setup.",
  },
] as const;

export function HomePage() {
  return (
    <main
      id="main-content"
      className="relative flex min-h-svh flex-col overflow-hidden px-4 py-10 md:px-6"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(var(--signal-rgb),0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(var(--signal-amber-rgb),0.08),transparent_26%)]" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-7">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-primary">
            <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />
            PR risk inspection
          </div>
          <div className="mx-auto max-w-3xl space-y-3">
            <h1 className="font-ui text-4xl font-semibold tracking-[-0.04em] text-balance text-foreground md:text-6xl">
              Know if a PR is safe to merge in seconds.
            </h1>
            <p className="mx-auto max-w-2xl text-[17px] leading-8 text-secondary-foreground">
              Paste a public GitHub pull request and get a streamed review that elevates risk,
              evidence, and the top issue before the long summary.
            </p>
          </div>
        </div>

        <Card className="inspection-panel mx-auto w-full overflow-hidden border border-border/70 bg-card/92 shadow-[0_18px_48px_rgba(0,0,0,0.3)] backdrop-blur">
          <CardContent className="space-y-6 px-5 pt-5 pb-5 md:px-6 md:pt-6 md:pb-6">
            <HomePageForm />

            <section className="grid gap-3 border-t border-border/70 pt-5 md:grid-cols-3">
              {setupHighlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border/60 bg-background/30 p-4 text-left"
                >
                  <item.icon aria-hidden="true" className="h-4 w-4 text-primary" />
                  <div className="mt-4 space-y-1.5">
                    <div className="font-ui text-sm font-medium text-foreground">{item.title}</div>
                    <p className="text-sm leading-6 text-secondary-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </section>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
