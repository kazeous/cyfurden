import Link from "next/link";
import { DocumentLocale } from "@/components/i18n/document-locale";
import { LanguageToggle } from "@/components/landing/language-toggle";
import { translate, type Locale } from "@/lib/i18n";
import { safeReturnTo } from "@/lib/redirect";
import { AuthForm } from "./auth-form";
import styles from "./auth.module.css";

interface AuthPageProps {
  googleEnabled: boolean;
  mode: "sign-in" | "sign-up";
  notice?: "email-changed";
  returnTo?: string;
  locale?: Locale;
}

export function AuthPage({
  googleEnabled,
  mode,
  notice,
  returnTo,
  locale = "en",
}: AuthPageProps) {
  const t = translate(locale, "publicAuth");
  const destination = safeReturnTo(returnTo, "/dashboard");
  const currentPath = mode === "sign-up" ? "/sign-up" : "/sign-in";
  const localizedRedirect = `${currentPath}?returnTo=${encodeURIComponent(destination)}${notice ? `&notice=${notice}` : ""}`;

  return (
    <main className={styles.page}>
      <DocumentLocale locale={locale} />
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link className={styles.brand} href="/" aria-label={t.pageBrandAria}>
            <span className={styles.brandMark} aria-hidden="true" />
            <span>
              <strong>Cyfurden</strong>
              <small>{t.pageBrandSubline}</small>
            </span>
          </Link>
          <div className={styles.headerActions}>
            <LanguageToggle
              current={locale}
              label={t.languageToggleLabel}
              redirectTo={localizedRedirect}
            />
            <Link className={styles.storefrontLink} href="/">
              <span aria-hidden="true">←</span> {t.pageBackHome}
            </Link>
          </div>
        </header>

        <section className={styles.card}>
          <aside className={styles.storyPanel}>
            <div className={styles.storyCopy}>
              <span className={styles.storyTag}>{t.storyTag}</span>
              <h2>{t.storyHeading}</h2>
              <p>{t.storyBody}</p>
            </div>

            <div className={styles.artwork} aria-hidden="true">
              <span className={styles.artMoon} />
              <span className={styles.artStarOne}>✦</span>
              <span className={styles.artStarTwo}>✦</span>
              <span className={styles.artHillBack} />
              <span className={styles.artHillFront} />
              <span className={styles.artBooth}>
                <i />
              </span>
              <span className={styles.artPath} />
            </div>

            <p className={styles.storyNote}>{t.storyNote}</p>
          </aside>

          <AuthForm
            googleEnabled={googleEnabled}
            locale={locale}
            mode={mode}
            notice={notice}
            returnTo={returnTo}
          />
        </section>
      </div>
    </main>
  );
}
