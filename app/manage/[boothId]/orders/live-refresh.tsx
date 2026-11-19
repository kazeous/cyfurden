"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isNewPendingOrder, type LatestOrderSignal } from "@/lib/order-alerts";
import type { Locale } from "@/lib/i18n";
import { createBoothDateTimeFormat } from "@/lib/i18n/intl";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import {
  playOrderAlertSound,
  showOrderBrowserNotification,
  useOrderAlertsEnabled,
} from "@/lib/order-alerts-client";
import styles from "./orders.module.css";

const REFRESH_INTERVAL_MS = 10_000;

export function OrdersLiveRefresh({
  boothId,
  boothName,
  latestOrder,
  locale,
}: {
  boothId: string;
  boothName: string;
  latestOrder: LatestOrderSignal | null;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).orders;
  const router = useRouter();
  const initializedOrder = useRef(false);
  const previousOrder = useRef<LatestOrderSignal | null>(latestOrder);
  const dismissTimer = useRef<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);
  const alertsEnabled = useOrderAlertsEnabled(boothId);
  const [visualAlert, setVisualAlert] = useState<LatestOrderSignal | null>(
    null,
  );

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

  useEffect(() => {
    if (!initializedOrder.current) {
      initializedOrder.current = true;
      previousOrder.current = latestOrder;
      return;
    }

    const shouldAlert =
      alertsEnabled && isNewPendingOrder(previousOrder.current, latestOrder);
    previousOrder.current = latestOrder;
    if (!shouldAlert || !latestOrder) return;

    void playOrderAlertSound();
    showOrderBrowserNotification(boothName, latestOrder.code, locale);
    setVisualAlert(latestOrder);
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(
      () => setVisualAlert(null),
      10_000,
    );
  }, [alertsEnabled, boothName, latestOrder, locale]);

  useEffect(
    () => () => {
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    },
    [],
  );

  const refreshedAt = lastRefresh
    ? createBoothDateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(lastRefresh)
    : null;

  return (
    <>
      <div
        className={styles.liveRefresh}
        data-paused={paused}
        title={paused ? strings.pollingPausedTitle : strings.pollingOnTitle}
      >
        <span className={styles.liveDot} aria-hidden="true" />
        <span>
          <strong>{paused ? strings.livePaused : strings.liveOn}</strong>
          <small>
            {paused
              ? strings.resume
              : refreshedAt
                ? strings.refreshed(refreshedAt)
                : strings.refreshInterval}
          </small>
        </span>
      </div>

      {visualAlert ? (
        <aside
          className={styles.orderAlertToast}
          role="status"
          aria-live="assertive"
        >
          <span className={styles.orderAlertMark} aria-hidden="true">
            !
          </span>
          <span>
            <strong>{strings.newPending}</strong>
            <small>{strings.newPendingBody(visualAlert.code)}</small>
          </span>
          <button
            type="button"
            onClick={() => setVisualAlert(null)}
            aria-label={strings.dismissAlert}
          >
            ×
          </button>
        </aside>
      ) : null}
    </>
  );
}
