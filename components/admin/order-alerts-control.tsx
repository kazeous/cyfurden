"use client";

import { useState } from "react";
import { getAdminShellStrings } from "@/lib/i18n/admin-shell";
import type { Locale } from "@/lib/i18n";
import {
  requestBrowserNotificationPermission,
  unlockOrderAlertSound,
  useBrowserNotificationPermission,
  useOrderAlertsEnabled,
  writeOrderAlertsEnabled,
} from "@/lib/order-alerts-client";
import styles from "./admin.module.css";

export function OrderAlertsControl({
  boothId,
  locale,
}: {
  boothId: string;
  locale: Locale;
}) {
  const strings = getAdminShellStrings(locale);
  const enabled = useOrderAlertsEnabled(boothId);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported" | null
  >(null);
  const detectedPermission = useBrowserNotificationPermission();
  const visiblePermission = permission ?? detectedPermission;

  async function toggleAlerts() {
    const next = !enabled;
    writeOrderAlertsEnabled(boothId, next);
    if (!next) return;

    try {
      await unlockOrderAlertSound();
      const nextPermission = await requestBrowserNotificationPermission();
      setPermission(nextPermission);
    } catch {
      setPermission("unsupported");
    }
  }

  const detail = !enabled
    ? strings.alertsOff
    : visiblePermission === "denied"
      ? strings.alertsBrowserBlocked
      : visiblePermission === "unsupported"
        ? strings.alertsUnsupported
        : strings.alertsOn;

  return (
    <button
      className={styles.alertToggle}
      type="button"
      aria-pressed={enabled}
      onClick={toggleAlerts}
    >
      <span className={styles.menuItemIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 6 2.5 6 2.5 7.5H4C4 15 6.5 15 6.5 9ZM10 20h4" />
        </svg>
      </span>
      <span>
        <strong>{strings.alerts}</strong>
        <small>{detail}</small>
      </span>
      <span
        className={styles.alertSwitch}
        data-enabled={enabled || undefined}
        aria-hidden="true"
      >
        <span />
      </span>
    </button>
  );
}
