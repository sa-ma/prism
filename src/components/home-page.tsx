import { Card, CardContent } from "@/components/ui/card";
import { HomePageForm } from "@/components/home-page-form";

const setupHighlights = [
  {
    label: "Decision first",
    description: "Surface merge risk and top blockers before reading the diff.",
  },
  {
    label: "Evidence attached",
    description: "Keep file paths, snippets, and remediation close to each finding.",
  },
  {
    label: "Public PRs only",
    description: "Validate the URL, preview metadata, and stream the review without setup.",
  },
] as const;

export function HomePage() {
  return (
    <main id="main-content" className="relative flex min-h-svh flex-col px-0 py-6 md:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_calc(50%_-_32rem),rgba(255,255,255,0.08)_calc(50%_-_32rem),rgba(255,255,255,0.08)_calc(50%_-_32rem_+_1px),transparent_calc(50%_-_32rem_+_1px),transparent_calc(50%_+_32rem),rgba(255,255,255,0.08)_calc(50%_+_32rem),rgba(255,255,255,0.08)_calc(50%_+_32rem_+_1px),transparent_calc(50%_+_32rem_+_1px))]"
      />
      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <header className="border-b border-border px-8 py-4 md:px-12 md:py-5">
          <div className="font-ui text-3xl leading-none tracking-[0.02em] text-foreground md:text-4xl">
            <span className="font-extrabold">PR</span>
            <span className="typewriter-mark inline-block font-medium text-zinc-300">ISM</span>
          </div>
        </header>

        <section className="flex flex-1 flex-col px-8 pt-18 pb-10 md:px-12 md:pt-24 md:pb-14">
          <div className="max-w-3xl space-y-4">
            <div className="space-y-4">
              <h1 className="font-ui text-3xl leading-[1.15] font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
                Inspect a pull request before you read the diff.
              </h1>
              <p className="font-ui max-w-2xl text-base leading-8 tracking-[-0.04em] text-secondary-foreground md:text-xl">
                Paste a public GitHub PR and get a structured review that prioritizes merge
                risk, evidence, and likely follow-up work.
              </p>
            </div>
          </div>

          <Card className="inspection-panel mt-12 w-full border-border bg-card">
            <CardContent className="px-5 py-5 md:px-6 md:py-6">
              <HomePageForm />
            </CardContent>
          </Card>

          <div className="mt-8 w-full border-t border-border py-8">
            <div className="grid gap-4 md:grid-cols-3">
              {setupHighlights.map((item, index) => (
                <div key={item.label} className="space-y-2 text-left">
                  <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span>{item.label}</span>
                    <span>{`0${index + 1}`}</span>
                  </div>
                  <p className="font-ui text-sm leading-6 tracking-[-0.02em] text-secondary-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
