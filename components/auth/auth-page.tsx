import Link from "next/link";
import { LanguageToggle } from "@/components/landing/language-toggle";
import type { Locale } from "@/lib/i18n";
import { AuthForm } from "./auth-form";
import styles from "./auth.module.css";

interface AuthPageProps {
  googleEnabled: boolean;
  mode: "sign-in" | "sign-up";
  returnTo?: string;
  locale?: Locale;
}

export function AuthPage({
  googleEnabled,
  mode,
  returnTo,
  locale = "en",
}: AuthPageProps) {
  const isVi = locale === "vi";
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
              <small>
                {isVi ? "Studio booth cho nghệ sĩ" : "Artist booth studio"}
              </small>
            </span>
          </Link>
          <div className={styles.headerActions}>
            <LanguageToggle current={locale} redirectTo="/sign-in" />
            <Link className={styles.storefrontLink} href="/">
              <span aria-hidden="true">←</span>{" "}
              {isVi ? "Về trang chủ" : "Visit storefront"}
            </Link>
          </div>
        </header>

        <section className={styles.card}>
          <aside className={styles.storyPanel}>
            <div className={styles.storyCopy}>
              <span className={styles.storyTag}>
                {isVi ? "Dành cho nghệ nhân nhỏ" : "Built for small makers"}
              </span>
              <h2>
                {isVi
                  ? "Một nơi yên tĩnh cho mỗi booth bận rộn."
                  : "One quiet place for every busy booth."}
              </h2>
              <p>
                {isVi
                  ? "Gom các chi tiết trước khi cửa mở, chào đón từng đơn và giữ team vận hành cùng nhau."
                  : "Gather the details before the doors open, welcome every order, and keep your team moving together."}
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
              {isVi
                ? "Cửa hàng công khai luôn mở cho khách — không cần tài khoản."
                : "Public storefronts stay open for visitors—no account required."}
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
