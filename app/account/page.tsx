import type { Metadata } from "next";
import Link from "next/link";
import { LanguageToggle } from "@/components/landing/language-toggle";
import { readCurrentAccount } from "@/lib/account";
import { requireUser } from "@/lib/authorization";
import { getAccountStrings } from "@/lib/i18n/account";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import styles from "./account.module.css";
import { EmailForm } from "./email-form";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const strings = getAccountStrings(await readLocaleCookie());
  return {
    title: strings.metadataTitle,
    description: strings.metadataDescription,
    robots: { index: false, follow: false },
  };
}

function AccountMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      C
    </span>
  );
}

export default async function AccountPage() {
  const [session, locale] = await Promise.all([
    requireUser("/account"),
    readLocaleCookie(),
  ]);
  const [account, strings] = await Promise.all([
    readCurrentAccount(session.user.id),
    Promise.resolve(getAccountStrings(locale)),
  ]);
  const providerLabels = account.providerKinds.map((provider) => {
    if (provider === "credential") return strings.providerCredential;
    if (provider === "google") return strings.providerGoogle;
    return strings.providerOther(provider);
  });

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link
            aria-label={strings.brandAria}
            className={styles.brand}
            href="/"
          >
            <AccountMark />
            <span>
              <strong>Cyfurden</strong>
              <small>{strings.brandSubline}</small>
            </span>
          </Link>
          <div className={styles.topbarActions}>
            <LanguageToggle
              current={locale}
              label={strings.language}
              redirectTo="/account"
            />
            <Link className={styles.dashboardLink} href="/dashboard">
              <span aria-hidden="true">←</span>
              {strings.backDashboard}
            </Link>
          </div>
        </div>
      </header>

      <div className={styles.accountShell}>
        <header className={styles.identityHeader}>
          <div>
            <h1>{strings.pageTitle}</h1>
            <p>{strings.pageDescription}</p>
          </div>
          <div className={styles.signedInIdentity}>
            <span>{strings.signedInAs}</span>
            <strong>{account.name}</strong>
            <small>{account.email}</small>
            {providerLabels.length ? (
              <ul
                className={styles.providerList}
                aria-label={strings.signInMethods}
              >
                {providerLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </header>

        <div className={styles.workspace}>
          <nav
            aria-label={strings.sectionNavigation}
            className={styles.sectionNavigation}
          >
            <a href="#profile">{strings.sections.profile}</a>
            <a href="#email">{strings.sections.email}</a>
            <a href="#password">{strings.sections.password}</a>
            <a href="#two-factor">{strings.sections.twoFactor}</a>
          </nav>

          <div className={styles.sections}>
            <section
              aria-labelledby="profile-heading"
              className={styles.section}
              id="profile"
            >
              <header className={styles.sectionHeader}>
                <h2 id="profile-heading">{strings.sections.profile}</h2>
                <p>{strings.profileDescription}</p>
              </header>
              <ProfileForm
                initialName={account.name}
                strings={{
                  displayNameLabel: strings.displayNameLabel,
                  displayNameHelp: strings.displayNameHelp,
                  saveName: strings.saveName,
                  savingName: strings.savingName,
                  nameSaved: strings.nameSaved,
                  nameRequired: strings.nameRequired,
                  nameLength: strings.nameLength,
                  nameTooLong: strings.nameTooLong,
                  nameSaveFailed: strings.nameSaveFailed,
                }}
              />
            </section>

            <section
              aria-labelledby="email-heading"
              className={styles.section}
              id="email"
            >
              <header className={styles.sectionHeader}>
                <h2 id="email-heading">{strings.sections.email}</h2>
                <p>{strings.emailDescription}</p>
              </header>
              <dl className={styles.identityRows}>
                <div>
                  <dt>{strings.currentEmail}</dt>
                  <dd>{account.email}</dd>
                </div>
                <div>
                  <dt>{strings.emailVerified}</dt>
                  <dd>
                    <span
                      className={styles.statusText}
                      data-state={account.emailVerified ? "ready" : "attention"}
                    >
                      {account.emailVerified
                        ? strings.emailVerified
                        : strings.emailUnverified}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{strings.signInMethods}</dt>
                  <dd>{providerLabels.join(" · ")}</dd>
                </div>
              </dl>
              {account.credentialEnabled ? (
                <EmailForm
                  currentEmail={account.email}
                  strings={{
                    newEmailLabel: strings.newEmailLabel,
                    confirmEmailLabel: strings.confirmEmailLabel,
                    currentPasswordLabel: strings.currentPasswordLabel,
                    secondFactorLabel: strings.secondFactorLabel,
                    secondFactorHelp: strings.secondFactorHelp,
                    changeEmailWarning: strings.changeEmailWarning,
                    changeEmail: strings.changeEmail,
                    changingEmail: strings.changingEmail,
                    emailRequired: strings.emailRequired,
                    emailInvalid: strings.emailInvalid,
                    emailTooLong: strings.emailTooLong,
                    emailSame: strings.emailSame,
                    emailMismatch: strings.emailMismatch,
                    passwordRequired: strings.passwordRequired,
                    passwordTooLong: strings.passwordTooLong,
                    secondFactorRequired: strings.secondFactorRequired,
                    emailChangeFailed: strings.emailChangeFailed,
                  }}
                  twoFactorRequired={account.twoFactorEnabled}
                />
              ) : (
                <p className={styles.readOnlyNote}>{strings.emailReadOnly}</p>
              )}
            </section>

            <section
              aria-labelledby="password-heading"
              className={styles.section}
              id="password"
            >
              <header className={styles.sectionHeader}>
                <h2 id="password-heading">{strings.sections.password}</h2>
                <p>{strings.passwordDescription}</p>
              </header>
              <p className={styles.stateLine}>
                <span
                  aria-hidden="true"
                  data-state={account.credentialEnabled ? "ready" : "neutral"}
                />
                {account.credentialEnabled
                  ? strings.passwordCredentialReady
                  : strings.passwordProviderOwned}
              </p>
              {account.credentialEnabled ? (
                <PasswordForm
                  strings={{
                    currentPasswordLabel: strings.currentPasswordLabel,
                    newPasswordLabel: strings.newPasswordLabel,
                    confirmPasswordLabel: strings.confirmPasswordLabel,
                    passwordHelp: strings.passwordHelp,
                    changePassword: strings.changePassword,
                    changingPassword: strings.changingPassword,
                    passwordChanged: strings.passwordChanged,
                    passwordRequired: strings.passwordRequired,
                    passwordTooLong: strings.passwordTooLong,
                    newPasswordTooShort: strings.newPasswordTooShort,
                    newPasswordSame: strings.newPasswordSame,
                    passwordMismatch: strings.passwordMismatch,
                    passwordChangeFailed: strings.passwordChangeFailed,
                  }}
                />
              ) : null}
            </section>

            <section
              aria-labelledby="two-factor-heading"
              className={styles.section}
              id="two-factor"
            >
              <header className={styles.sectionHeader}>
                <h2 id="two-factor-heading">{strings.sections.twoFactor}</h2>
                <p>{strings.twoFactorDescription}</p>
              </header>
              <p className={styles.stateLine}>
                <span
                  aria-hidden="true"
                  data-state={account.twoFactorEnabled ? "ready" : "neutral"}
                />
                {account.twoFactorEnabled
                  ? strings.twoFactorEnabled
                  : strings.twoFactorDisabled}
              </p>
              {account.platformGrantActive ? (
                <p className={styles.constraintNote}>
                  {strings.twoFactorPlatformConstraint}
                </p>
              ) : null}
              <Link className={styles.secondaryAction} href="/account/security">
                {strings.manageTwoFactor}
                <span aria-hidden="true">→</span>
              </Link>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
