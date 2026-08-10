"use client";

import { useState } from "react";
import {
  resolveFaceboothPngSize,
  type FaceboothPngBackground,
  type FaceboothPngCapture,
} from "@/components/facebooth/facebooth-png-export";
import {
  downloadFaceboothFile,
  faceboothFileStem,
} from "@/lib/facebooth-portable";
import type { FaceboothStrings } from "@/lib/i18n/facebooth";
import styles from "./facebooth-export-controls.module.css";

export function FaceboothExportControls({
  capture,
  aspect,
  name,
  strings,
  prepareCapture,
}: {
  capture: FaceboothPngCapture | null;
  aspect: number;
  name: string;
  strings: FaceboothStrings;
  prepareCapture?: (active: boolean) => void;
}) {
  const [preset, setPreset] = useState<"SQUARE" | "CURRENT">("SQUARE");
  const [background, setBackground] =
    useState<FaceboothPngBackground>("STUDIO");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const exportPng = async () => {
    if (!capture || exporting) return;
    setError("");
    setExporting(true);
    try {
      prepareCapture?.(true);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const size = resolveFaceboothPngSize(preset, aspect);
      const png = await capture({ ...size, background });
      downloadFaceboothFile(png, `${faceboothFileStem(name)}.png`, "image/png");
    } catch {
      setError(strings.exportPngFailed);
    } finally {
      prepareCapture?.(false);
      setExporting(false);
    }
  };
  return (
    <div className={styles.controls} aria-label={strings.exportPng}>
      <label>
        <span>{strings.pngSize}</span>
        <select
          onChange={(event) =>
            setPreset(event.target.value as "SQUARE" | "CURRENT")
          }
          value={preset}
        >
          <option value="SQUARE">{strings.pngSquare}</option>
          <option value="CURRENT">{strings.pngCurrent}</option>
        </select>
      </label>
      <label>
        <span>{strings.background}</span>
        <select
          onChange={(event) =>
            setBackground(event.target.value as FaceboothPngBackground)
          }
          value={background}
        >
          <option value="STUDIO">{strings.studio}</option>
          <option value="TRANSPARENT">{strings.transparent}</option>
        </select>
      </label>
      <button
        disabled={!capture || exporting}
        onClick={exportPng}
        type="button"
      >
        {exporting ? strings.exporting : strings.downloadPng}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
