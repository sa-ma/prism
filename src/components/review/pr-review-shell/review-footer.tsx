import Link from "next/link";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ReviewFooter({
  supplementalContextFiles,
  skippedFiles,
  truncatedFiles,
  showSkippedFiles,
  onToggleSkippedFiles,
  streaming,
  onCopy,
  copyState,
}: {
  supplementalContextFiles: number;
  skippedFiles: string[];
  truncatedFiles: string[];
  showSkippedFiles: boolean;
  onToggleSkippedFiles: () => void;
  streaming: boolean;
  onCopy: () => void | Promise<void>;
  copyState: "idle" | "copied";
}) {
  return (
    <section className="border-t border-border pt-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="font-ui flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {supplementalContextFiles > 0 ? <span>Context files {supplementalContextFiles}</span> : null}
          {skippedFiles.length ? (
            <button
              type="button"
              onClick={onToggleSkippedFiles}
              className="text-left transition-colors hover:text-foreground"
            >
              Skipped {skippedFiles.length} files
            </button>
          ) : null}
          {truncatedFiles.length ? <span>Truncated {truncatedFiles.length} items</span> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {!streaming ? (
            <Button size="sm" onClick={onCopy}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {copyState === "copied" ? "Copied" : "Copy Review"}
            </Button>
          ) : null}
          <Link href="/">
            <Button size="sm" variant="outline">
              Review Another PR
            </Button>
          </Link>
        </div>
      </div>

      {!streaming && showSkippedFiles && skippedFiles.length ? (
        <div className="mt-4 border-t border-border pt-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {skippedFiles.map((filename) => (
                <span
                  key={filename}
                  className="font-ui border border-border bg-background px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {filename}
                </span>
              ))}
            </div>
            {truncatedFiles.length ? (
              <div className="space-y-2">
                <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Truncated context
                </div>
                <div className="flex flex-wrap gap-2">
                  {truncatedFiles.map((filename) => (
                    <span
                      key={filename}
                      className="font-ui border border-zinc-500 bg-muted px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-foreground"
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
  );
}
