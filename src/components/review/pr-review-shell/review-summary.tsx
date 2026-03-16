import { RichParagraphs, toParagraphs } from "@/components/review/pr-review-shell/inline-rich-text";

export function ReviewSummary({ summary }: { summary: string }) {
  if (!summary) {
    return null;
  }

  return (
    <section className="border-t border-border pt-4">
      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div>
          <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Review summary
          </div>
        </div>
        <RichParagraphs
          paragraphs={toParagraphs(summary)}
          className="font-ui space-y-3 text-[15px] leading-7 tracking-[-0.02em] text-secondary-foreground"
        />
      </div>
    </section>
  );
}
