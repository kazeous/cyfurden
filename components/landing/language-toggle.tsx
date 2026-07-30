import { setLocaleAction } from "@/app/actions";
import {
  localeDisplayCodes,
  localeDisplayNames,
  supportedLocales,
} from "@/lib/i18n";
import styles from "./language-toggle.module.css";

export function LanguageToggle({
  current,
  label = "Language",
  redirectTo = "/",
}: {
  current: string;
  label?: string;
  redirectTo?: string;
}) {
  return (
    <form action={setLocaleAction} className={styles.toggle} aria-label={label}>
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {supportedLocales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="submit"
            name="locale"
            value={locale}
            aria-pressed={active}
            aria-label={localeDisplayNames[locale]}
            lang={locale}
            className={active ? styles.active : styles.button}
          >
            {localeDisplayCodes[locale]}
          </button>
        );
      })}
    </form>
  );
}
