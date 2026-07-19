import Link from "next/link";
import { AuthForm } from "./auth-form";
import styles from "./auth.module.css";

interface AuthPageProps {
  googleEnabled: boolean;
  mode: "sign-in" | "sign-up";
  returnTo?: string;
}

export function AuthPage({ googleEnabled, mode, returnTo }: AuthPageProps) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link
            className={styles.brand}
            href="/"
            aria-label="Cyfurden storefront"
          >
            <span className={styles.brandMark} aria-hidden="true" />
            <span>
              <strong>Cyfurden</strong>
              <small>Artist booth studio</small>
            </span>
          </Link>
          <Link className={styles.storefrontLink} href="/">
            <span aria-hidden="true">←</span>
            Visit storefront
          </Link>
        </header>

        <section className={styles.card}>
          <aside className={styles.storyPanel}>
            <div className={styles.storyCopy}>
              <span className={styles.storyTag}>Built for small makers</span>
              <h2>One quiet place for every busy booth.</h2>
              <p>
                Gather the details before the doors open, welcome every order,
                and keep your team moving together.
              </p>
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

            <p className={styles.storyNote}>
              Public storefronts stay open for visitors—no account required.
            </p>
          </aside>

          <AuthForm
            googleEnabled={googleEnabled}
            mode={mode}
            returnTo={returnTo}
          />
        </section>
      </div>
    </main>
  );
}
