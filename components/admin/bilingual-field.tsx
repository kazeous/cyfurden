"use client";

import { useId } from "react";
import styles from "./bilingual-field.module.css";
import { parseBilingual } from "@/lib/i18n/parser";

type BilingualFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
};

/**
 * Bilingual input wrapper.
 *
 * The textarea accepts either plain text or the bilingual inline form
 * '[en]English[/en][vi]Vietnamese[/vi]'. Below the field, two preview
 * rows show what the booth will render for each locale. The preview is
 * derived live from the current value via parseBilingual so any
 * missing or malformed tag falls back gracefully.
 */
export function BilingualField({
  label,
  value,
  onChange,
  rows = 4,
  maxLength,
  placeholder,
  required,
}: BilingualFieldProps) {
  const inputId = useId();

  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>{label}</label>
      <textarea
        id={inputId}
        value={value}
        required={required}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={styles.textarea}
      />
      <details className={styles.preview}>
        <summary>Preview both languages</summary>
        <p>
          <strong>EN:</strong> {parseBilingual(value, "en") || "—"}
        </p>
        <p>
          <strong>VI:</strong> {parseBilingual(value, "vi") || "—"}
        </p>
      </details>
    </div>
  );
}
