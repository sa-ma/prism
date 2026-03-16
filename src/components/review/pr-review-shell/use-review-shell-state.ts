"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useReviewShellState(itemIds: string[], copyableReview: string) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showSkippedFiles, setShowSkippedFiles] = useState(false);
  const detailPaneRef = useRef<HTMLDivElement | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const activeItemId = useMemo(() => {
    if (selectedItemId && itemIds.includes(selectedItemId)) {
      return selectedItemId;
    }

    return itemIds[0] ?? null;
  }, [itemIds, selectedItemId]);

  useEffect(() => {
    detailPaneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeItemId]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(copyableReview);
    setCopyState("copied");

    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => setCopyState("idle"), 1500);
  }, [copyableReview]);

  return {
    copyState,
    activeItemId,
    detailPaneRef,
    showSkippedFiles,
    selectItem: setSelectedItemId,
    toggleSkippedFiles: () => setShowSkippedFiles((current) => !current),
    handleCopy,
  };
}
