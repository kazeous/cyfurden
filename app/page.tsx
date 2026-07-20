import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Cyfurden — Artist booths for convention days",
  description:
    "Build a shareable artist storefront, collect manual-payment reservations, and keep a convention team aligned with Cyfurden.",
  openGraph: {
    title: "Cyfurden artist booths",
    description:
      "A practical online booth for independent artists, convention pre-orders, and manual handoff.",
  },
};

const workflow = [
  {
    index: "1.0",
    title: "Set the table online.",
    description:
      "Choose your booth copy, colours, sections, products, and manual-payment instructions in one focused workspace.",
    note: "Preview the storefront at phone and desktop sizes before publishing.",
  },
  {
    index: "2.0",
    title: "Share one booth link.",
    description:
      "Fans can browse featured work, filter the catalogue, inspect variants, and build a cart without creating an account.",
    note: "Use the public link online, in a bio, or beside your table QR.",
  },
  {
    index: "3.0",
    title: "Hand off payment clearly.",
    description:
      "Cyfurden displays your bank QR or account details with a clear order reference. It never claims a transfer was verified.",
    note: "Payment confirmation stays with the artist or an approved helper.",
  },
  {
    index: "4.0",
    title: "Run the queue together.",
    description:
      "Owners and invited teammates can review reservations, update their status, and prepare convention pickup by hand.",
    note: "Role-based access keeps each booth and its work separate.",
  },
] as const;

const functions = [
  {
    title: "Public storefront",
    description:
      "Featured drops, search, filters, product details, availability, and a persistent cart.",
    scope: "For fans",
  },
  {
    title: "Storefront designer",
    description:
      "Edit booth identity, reorder visible sections, preview layouts, and manage payment instructions.",
    scope: "For artists",
  },
  {
    title: "Products and orders",
    description:
      "Maintain the catalogue and move manual reservations through a clear convention-day queue.",
    scope: "For the table",
  },
  {
    title: "Team access",
    description:
      "Invite trusted helpers with owner, admin, or staff permissions for the booth they support.",
    scope: "For helpers",
  },
  {
    title: "Free promotion tools",
    description:
      "Configure an optional free gacha-style promotion without paid pulls or stored-value mechanics.",
    scope: "For events",
  },
] as const;

export default function Home() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>

      <header className={styles.siteHeader}>
        <Link className={styles.wordmark} href="/" aria-label="Cyfurden home">
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>Cyfurden</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link className={styles.signInLink} href="/sign-in">
            Sign in
          </Link>
        </nav>
      </header>

      <main id="main-content" className={styles.main}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <h1 id="landing-title">A calmer booth for busy convention days.</h1>
            <p className={styles.heroLead}>
              Publish your merch, collect reservations, show manual
              bank-transfer instructions, and keep helpers aligned while fans
              browse from their phones.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryLink} href="/sign-up">
                Create your booth <span aria-hidden="true">→</span>
              </Link>
              <Link className={styles.secondaryLink} href="#workflow">
                See how it works
              </Link>
            </div>
            <p className={styles.heroNote}>
              Fans browse without an account. Artists sign in to manage their
              booths.
            </p>
          </div>

          <figure className={styles.heroFigure}>
            <div className={styles.previewCanvas}>
              <div className={styles.boothBoard}>
                <div className={styles.previewHeader}>
                  <div>
                    <span className={styles.previewLabel}>
                      Storefront preview
                    </span>
                    <strong>Your booth</strong>
                  </div>
                  <span className={styles.statusPill}>Draft preview</span>
                </div>
                <p className={styles.previewTagline}>
                  A storefront shaped around your work.
                </p>
                <ul className={styles.previewProductList}>
                  <li>
                    <span
                      className={`${styles.productSwatch} ${styles.swatch1}`}
                      aria-hidden="true"
                    />
                    <span className={styles.previewProductName}>
                      Featured work
                    </span>
                    <span className={styles.previewPrice}>Lead</span>
                  </li>
                  <li>
                    <span
                      className={`${styles.productSwatch} ${styles.swatch2}`}
                      aria-hidden="true"
                    />
                    <span className={styles.previewProductName}>
                      Product catalogue
                    </span>
                    <span className={styles.previewPrice}>Browse</span>
                  </li>
                  <li>
                    <span
                      className={`${styles.productSwatch} ${styles.swatch3}`}
                      aria-hidden="true"
                    />
                    <span className={styles.previewProductName}>
                      Reservation handoff
                    </span>
                    <span className={styles.previewPrice}>Reserve</span>
                  </li>
                </ul>
              </div>

              <div className={styles.queueSlip}>
                <span className={styles.previewLabel}>Reservation queue</span>
                <strong>Ready for a human check</strong>
                <dl>
                  <div>
                    <dt>Items</dt>
                    <dd>3</dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>Manual</dd>
                  </div>
                  <div>
                    <dt>Handoff</dt>
                    <dd>Event pickup</dd>
                  </div>
                </dl>
              </div>
            </div>
            <figcaption>
              A schematic preview of the storefront and reservation workflow.
            </figcaption>
          </figure>
        </section>

        <section
          className={styles.audienceRail}
          aria-labelledby="audience-title"
        >
          <h2 id="audience-title" className="sr-only">
            Who Cyfurden helps
          </h2>
          <ul>
            <li>
              <strong>Fans</strong>
              <span>Browse and reserve from a phone</span>
            </li>
            <li>
              <strong>Artists</strong>
              <span>Shape a booth around their work</span>
            </li>
            <li>
              <strong>Helpers</strong>
              <span>Share one practical order queue</span>
            </li>
            <li>
              <strong>Payments</strong>
              <span>Stay manual and clearly labelled</span>
            </li>
          </ul>
        </section>

        <section
          id="workflow"
          className={styles.workflowSection}
          aria-labelledby="flow-title"
        >
          <header className={styles.sectionHeading}>
            <h2 id="flow-title">From first scan to final handoff.</h2>
            <p>
              Cyfurden follows the real order of a convention table, without
              pretending that software replaces the person running it.
            </p>
          </header>

          <ol className={styles.workflowList}>
            {workflow.map((step) => (
              <li key={step.index}>
                <div className={styles.stageCopy}>
                  <span className={styles.stageIndex}>{step.index}</span>
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
            <h2 id="function-title">What lives inside Cyfurden.</h2>
            <p>
              One public storefront, one protected booth workspace, and no
              marketplace feed competing with your own identity.
            </p>
          </header>
          <div className={styles.functionList}>
            {functions.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span>{item.scope}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.manualBand} aria-labelledby="manual-title">
          <h2 id="manual-title">Payment stays manual—and visibly so.</h2>
          <div>
            <p>
              Booth owners provide their bank QR or account details. Cyfurden
              shows the order reference and keeps the queue organised; the
              artist or a staff member confirms the transfer themselves.
            </p>
            <p className={styles.boundaryLine}>
              No card checkout · No automatic transfer verification · No paid
              gacha
            </p>
          </div>
        </section>

        <section
          className={styles.finalInvitation}
          aria-labelledby="final-title"
        >
          <div>
            <h2 id="final-title">Give your next table an online front door.</h2>
            <p>
              Start with a booth of your own and shape the public storefront
              around your work.
            </p>
          </div>
          <div className={styles.finalActions}>
            <Link className={styles.primaryLink} href="/sign-up">
              Create your booth <span aria-hidden="true">→</span>
            </Link>
            <Link className={styles.textLink} href="/sign-in">
              Sign in to manage <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <p className={styles.footerWordmark}>Cyfurden</p>
          <p className={styles.footerTagline}>
            Artist storefronts for conventions, pre-orders, and human handoff.
          </p>
        </div>
        <nav className={styles.footerLinks} aria-label="Footer navigation">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up">Create booth</Link>
        </nav>
      </footer>
    </div>
  );
}
