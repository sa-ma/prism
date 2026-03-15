"use client";

import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReviewHeader } from "@/components/review/review-header";

export default function ReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-svh flex-col">
      <ReviewHeader />

      <main id="main-content" className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/92 p-6 text-center shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10">
            <AlertCircle aria-hidden="true" className="h-5 w-5 text-destructive" />
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <div className="font-ui text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Page error
            </div>
            <h2 className="font-ui text-xl font-medium text-foreground">Something went wrong</h2>
            <p className="mx-auto max-w-sm text-[15px] leading-7 text-secondary-foreground">{error.message}</p>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/">
              <Button variant="outline" size="sm">Home</Button>
            </Link>
            <Button size="sm" onClick={() => reset()}>
              <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
