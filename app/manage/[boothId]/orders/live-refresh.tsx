"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import styles from "./orders.module.css";

const REFRESH_INTERVAL_MS = 10_000;

export function OrdersLiveRefresh() {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);

  const refresh = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    router.refresh();
    setLastRefresh(new Date());
  }, [router]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.visibilityState !== "visible";
      setPaused(hidden);
      if (!hidden) refresh();
    };
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const refreshedAt = lastRefresh
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(lastRefresh)
    : null;

  return (
    <div
      className={styles.liveRefresh}
      data-paused={paused}
      title={
        paused
          ? "Polling pauses while this tab is hidden."
          : "The queue refreshes every 10 seconds while this tab is visible."
      }
    >
      <span className={styles.liveDot} aria-hidden="true" />
      <span>
        <strong>{paused ? "Live updates paused" : "Live updates on"}</strong>
        <small>
          {paused
            ? "Return to this tab to resume"
            : refreshedAt
              ? `Refreshed ${refreshedAt}`
              : "Refreshes every 10 seconds"}
        </small>
      </span>
    </div>
  );
}
