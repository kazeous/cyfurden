"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  orderAlertsChangedEvent,
  orderAlertsStorageKey,
} from "@/lib/order-alerts";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";

let alertAudioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }
  alertAudioContext ??= new AudioContext();
  return alertAudioContext;
}

export function readOrderAlertsEnabled(boothId: string) {
  try {
    return localStorage.getItem(orderAlertsStorageKey(boothId)) === "on";
  } catch {
    return false;
  }
}

export function useOrderAlertsEnabled(boothId: string) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onPreferenceChange = () => onStoreChange();
      const onStorage = (event: StorageEvent) => {
        if (event.key === orderAlertsStorageKey(boothId)) onStoreChange();
      };
      window.addEventListener(orderAlertsChangedEvent, onPreferenceChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(orderAlertsChangedEvent, onPreferenceChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [boothId],
  );
  const getSnapshot = useCallback(
    () => readOrderAlertsEnabled(boothId),
    [boothId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function writeOrderAlertsEnabled(boothId: string, enabled: boolean) {
  try {
    localStorage.setItem(
      orderAlertsStorageKey(boothId),
      enabled ? "on" : "off",
    );
  } catch {
    // Visual state remains available for this tab when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent(orderAlertsChangedEvent, {
      detail: { boothId, enabled },
    }),
  );
}

export async function unlockOrderAlertSound() {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") await context.resume();
}

export async function playOrderAlertSound() {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }
  if (context.state !== "running") return;

  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
  gain.connect(context.destination);

  [740, 988].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now + index * 0.12);
    oscillator.stop(now + 0.5);
  });
}

export function browserNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported";
}

function subscribeToBrowserNotificationPermission(onStoreChange: () => void) {
  document.addEventListener("visibilitychange", onStoreChange);
  window.addEventListener("focus", onStoreChange);
  return () => {
    document.removeEventListener("visibilitychange", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
  };
}

export function useBrowserNotificationPermission() {
  return useSyncExternalStore(
    subscribeToBrowserNotificationPermission,
    browserNotificationPermission,
    () => null,
  );
}

export async function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) return "unsupported" as const;
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function showOrderBrowserNotification(
  boothName: string,
  code: string,
  locale: Locale = "en",
) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  try {
    const strings = getWorkspaceStrings(locale).orders;
    const notification = new Notification(
      strings.notificationTitle(boothName),
      {
        body: strings.notificationBody(code),
        tag: `cyfurden-order-${code}`,
      },
    );
    window.setTimeout(() => notification.close(), 10_000);
  } catch {
    // Visual and sound alerts remain available if the browser rejects this.
  }
}
