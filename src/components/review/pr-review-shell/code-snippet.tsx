"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CodeSnippet({
  title,
  startLine,
  snippet,
  defaultOpen = false,
}: {
  title: string;
  startLine: number | null;
  snippet: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = snippet.split("\n");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((current) => !current)}>
          {open ? "Hide code" : "Show code"}
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </div>

      {open ? (
        <div className="overflow-hidden border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {startLine ? `Line ${startLine}` : "Patch excerpt"}
            </div>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-zinc-200">
            <code>
              {lines.map((line, index) => {
                const tone =
                  line.startsWith("+") && !line.startsWith("+++")
                    ? "bg-zinc-100/5 text-zinc-100"
                    : line.startsWith("-") && !line.startsWith("---")
                      ? "bg-black/30 text-zinc-400"
                      : line.startsWith("@@")
                        ? "text-zinc-100"
                        : "text-zinc-300";

                return (
                  <div key={`${line}-${index}`} className={`px-2 py-0.5 ${tone}`}>
                    {line || " "}
                  </div>
                );
              })}
            </code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}
