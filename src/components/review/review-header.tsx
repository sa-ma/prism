import Link from "next/link";

type ReviewHeaderProps = {
  subtitle?: string;
};

export function ReviewHeader({ subtitle }: ReviewHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur md:px-6">
      <Link
        href="/"
        className="font-ui flex items-center gap-2 text-sm font-medium text-secondary-foreground transition-colors hover:text-foreground"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          className="text-primary"
          aria-hidden="true"
        >
          <path
            d="M3 4h14M3 8h10M3 12h12M3 16h8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        PR Reviewer
      </Link>
      {subtitle ? (
        <>
          <span className="text-muted-foreground/30">/</span>
          <span className="font-mono text-xs text-muted-foreground md:text-sm">{subtitle}</span>
        </>
      ) : null}
    </header>
  );
}
