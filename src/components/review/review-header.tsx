import Link from "next/link";

type ReviewHeaderProps = {
  subtitle?: string;
  subtitleHref?: string;
};

export function ReviewHeader({ subtitle, subtitleHref }: ReviewHeaderProps) {
  return (
    <header className="border-b border-border px-8 py-4 md:px-12 md:py-5">
      <div className="font-ui flex flex-wrap items-center gap-2 text-lg leading-none tracking-[0.01em] md:text-xl">
        <Link href="/" className="text-foreground">
          <span className="font-extrabold">PR</span>
          <span className="font-medium text-zinc-300">ISM</span>
        </Link>
        {subtitle ? (
          <>
            <span className="text-muted-foreground">/</span>
            {subtitleHref ? (
              <a
                href={subtitleHref}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground md:text-xs"
              >
                {subtitle}
              </a>
            ) : (
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground md:text-xs">
                {subtitle}
              </div>
            )}
          </>
        ) : null}
      </div>
    </header>
  );
}
