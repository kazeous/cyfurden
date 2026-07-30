import { setLocaleAction } from "@/app/actions";
import {
  localeCookieName,
  localeDisplayCodes,
  supportedLocales,
} from "@/lib/i18n";
import styles from "./language-toggle.module.css";

export function LanguageToggle({
  current,
  redirectTo = "/",
}: {
  current: string;
  redirectTo?: string;
}) {
  return (
    <form
      action={setLocaleAction}
      className={styles.toggle}
      aria-label="Language"
    >
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
            className={active ? styles.active : styles.button}
          >
            {localeDisplayCodes[locale]}
          </button>
        );
      })}
    </form>
  );
}

export const languageCookieName = localeCookieName;
