export function toParagraphs(text: string) {
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

export function InlineRichText({ text }: { text: string }) {
  const segments = text.split(/(`[^`]+`)/g).filter(Boolean);

  return (
    <>
      {segments.map((segment, index) => {
        const isCode = segment.startsWith("`") && segment.endsWith("`") && segment.length > 1;

        if (!isCode) {
          return <span key={`${segment}-${index}`}>{segment}</span>;
        }

        return (
          <code
            key={`${segment}-${index}`}
            className="rounded-none bg-muted px-[0.22rem] py-[0.08rem] font-mono text-[0.92em] text-foreground"
          >
            {segment.slice(1, -1)}
          </code>
        );
      })}
    </>
  );
}

export function RichParagraphs({
  paragraphs,
  className,
}: {
  paragraphs: string[];
  className?: string;
}) {
  return (
    <div className={className}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>
          <InlineRichText text={paragraph} />
        </p>
      ))}
    </div>
  );
}
