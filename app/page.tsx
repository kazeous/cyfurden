import type { Metadata } from "next";
import Link from "next/link";
import { DocumentLocale } from "@/components/i18n/document-locale";
import { LanguageToggle } from "@/components/landing/language-toggle";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { translate, type Locale } from "@/lib/i18n";
import styles from "./landing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await readLocaleCookie()) as Locale;
  const landing = translate(locale, "publicLanding");
  return {
    title: `Cyfurden — ${landing.heroTitle}`,
    description: landing.heroBody,
    openGraph: {
      title: `Cyfurden — ${landing.heroTitle}`,
      description: landing.heroBody,
    },
  };
}

export default async function Home() {
  const locale = (await readLocaleCookie()) as Locale;
  const landing = translate(locale, "publicLanding");
  return (
    <div className={styles.page}>
      <DocumentLocale locale={locale} />
      <a className={styles.skipLink} href="#main-content">
        {landing.skipLink}
      </a>

      <header className={styles.siteHeader}>
        <Link
          className={styles.wordmark}
          href="/"
          aria-label={landing.wordmarkAria}
        >
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>Cyfurden</span>
        </Link>
        <nav aria-label={landing.navAria}>
          <LanguageToggle
            current={locale}
            label={landing.languageToggleLabel}
            redirectTo="/"
          />
          <Link className={styles.signInLink} href="/sign-in">
            {landing.topbarSignIn}
          </Link>
        </nav>
      </header>

      <main id="main-content" className={styles.main}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>{landing.heroEyebrow}</p>
            <h1 id="landing-title">{landing.heroTitle}</h1>
            <p className={styles.heroLead}>{landing.heroBody}</p>
            <p className={styles.heroNote}>{landing.heroNote}</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryLink} href="/sign-up">
                {landing.heroActionPrimary} <span aria-hidden="true">→</span>
              </Link>
              <Link className={styles.secondaryLink} href="/sign-in">
                {landing.heroActionSecondary}
              </Link>
            </div>
          </div>

          <figure className={styles.heroFigure}>
            <div className={styles.previewCanvas}>
              <div className={styles.boothBoard}>
                <div className={styles.previewHeader}>
                  <div>
                    <span className={styles.previewLabel}>
                      {landing.mockPreviewHeading}
                    </span>
                    <strong>{landing.feature1Title}</strong>
                  </div>
                  <span className={styles.statusPill}>
                    {landing.mockPreviewStatus}
                  </span>
                </div>
                <p className={styles.previewTagline}>
                  {landing.mockPreviewTagline}
                </p>
                <ul className={styles.previewProductList}>
                  {landing.mockPreviewItems.map((item) => (
                    <li key={item.name}>
                      <span
                        className={`${styles.productSwatch} ${styles.swatch1}`}
                        aria-hidden="true"
                      />
                      <span className={styles.previewProductName}>
                        {item.name}
                      </span>
                      <span className={styles.previewPrice}>{item.tag}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.queueSlip}>
                <span className={styles.previewLabel}>
                  {landing.mockPreviewQueueLabel}
                </span>
                <strong>{landing.mockPreviewQueueTitle}</strong>
                <dl>
                  {landing.mockPreviewQueueItems.map((entry, idx) => (
                    <div key={idx}>
                      <dt>{entry.dt}</dt>
                      <dd>{entry.dd}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <figcaption>{landing.mockPreviewCaption}</figcaption>
          </figure>
        </section>

        <section
          className={styles.audienceRail}
          aria-labelledby="audience-title"
        >
          <h2 id="audience-title" className="sr-only">
            {landing.audienceHeading}
          </h2>
          <ul>
            {landing.audienceItems.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="workflow"
          className={styles.workflowSection}
          aria-labelledby="flow-title"
        >
          <header className={styles.sectionHeading}>
            <h2 id="flow-title">{landing.workflowHeading}</h2>
            <p>{landing.workflowIntro}</p>
          </header>

          <ol className={styles.workflowList}>
            {landing.workflowSteps.map((step, idx) => (
              <li key={step.title}>
                <div className={styles.stageCopy}>
                  <span className={styles.stageIndex}>
                    {(idx + 1).toFixed(1)}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
                <p className={styles.stageNote}>{step.note}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={styles.functionSection}
          aria-labelledby="function-title"
        >
          <header className={styles.functionHeading}>
            <h2 id="function-title">{landing.functionHeading}</h2>
            <p>{landing.functionIntro}</p>
          </header>
          <div className={styles.functionList}>
            {landing.functionItems.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span>{item.scope}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.manualBand} aria-labelledby="manual-title">
          <h2 id="manual-title">{landing.manualHeading}</h2>
          <div>
            <p>{landing.manualBody}</p>
            <p className={styles.boundaryLine}>{landing.manualBoundary}</p>
          </div>
        </section>

        <section
          className={styles.finalInvitation}
          aria-labelledby="final-title"
        >
          <div>
            <h2 id="final-title">{landing.finalHeading}</h2>
            <p>{landing.finalBody}</p>
          </div>
          <div className={styles.finalActions}>
            <Link className={styles.primaryLink} href="/sign-up">
              {landing.finalPrimary} <span aria-hidden="true">→</span>
            </Link>
            <Link className={styles.textLink} href="/sign-in">
              {landing.finalSecondary}
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <p className={styles.footerWordmark}>{landing.footerWordmark}</p>
          <p className={styles.footerTagline}>{landing.footerTagline}</p>
        </div>
        <nav className={styles.footerLinks} aria-label={landing.footerNavAria}>
          <Link href="/sign-in">{landing.footerSignIn}</Link>
          <Link href="/sign-up">{landing.footerCreateBooth}</Link>
        </nav>
      </footer>
    </div>
  );
}
