import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformAuditList } from "@/components/platform-admin/platform-audit-list";
import {
  PlatformPageHeader,
  PlatformStatusBadge,
  platformAdminStyles as styles,
} from "@/components/platform-admin/platform-admin-shell";
import {
  formatPlatformDateTime,
  formatPlatformNumber,
  getPlatformAdminStrings,
  shortPlatformId,
} from "@/lib/i18n/platform-admin";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { requirePlatformPermission } from "@/lib/platform-authorization";
import { readPlatformUserDetail } from "@/lib/platform-inventory";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getPlatformAdminStrings(await readLocaleCookie());
  return { title: strings.userDetail.metadataTitle };
}

export default async function PlatformUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const [access, locale] = await Promise.all([
    requirePlatformPermission("platform.read"),
    readLocaleCookie(),
  ]);
  const user = await readPlatformUserDetail(access, userId);
  if (!user) notFound();
  const strings = getPlatformAdminStrings(locale);
  const methodLabels = user.authMethods.map((method) => {
    if (method === "credential") return strings.userDetail.credential;
    if (method === "google") return strings.userDetail.google;
    return method;
  });

  return (
    <>
      <PlatformPageHeader
        back={{ href: "/admin/users", label: strings.userDetail.back }}
        title={strings.userDetail.title}
        description={strings.userDetail.description}
        actions={
          <span className={styles.readOnlyChip}>{strings.shell.readOnly}</span>
        }
      />

      <div className={styles.detailGrid}>
        <section className={styles.detailSection}>
          <h2>{strings.userDetail.identity}</h2>
          <dl className={styles.factGrid}>
            <div>
              <dt>{strings.common.identifier}</dt>
              <dd className={styles.mono}>{user.id}</dd>
            </div>
            <div>
              <dt>{strings.common.email}</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>{strings.userDetail.accountState}</dt>
              <dd>
                <PlatformStatusBadge
                  state={user.state}
                  label={strings.common.stateLabel(user.state)}
                />
              </dd>
            </div>
            <div>
              <dt>{strings.userDetail.emailVerification}</dt>
              <dd>
                {user.emailVerified
                  ? strings.common.verified
                  : strings.common.unverified}
              </dd>
            </div>
            <div>
              <dt>{strings.userDetail.authMethods}</dt>
              <dd>{methodLabels.length ? methodLabels.join(" · ") : "—"}</dd>
            </div>
            <div>
              <dt>{strings.userDetail.totp}</dt>
              <dd>
                {user.twoFactorEnabled && user.verifiedTotp
                  ? strings.common.verified
                  : strings.common.unverified}
              </dd>
            </div>
            <div>
              <dt>{strings.common.created}</dt>
              <dd>{formatPlatformDateTime(user.createdAt, locale)}</dd>
            </div>
            <div>
              <dt>{strings.common.updated}</dt>
              <dd>{formatPlatformDateTime(user.updatedAt, locale)}</dd>
            </div>
            {user.suspensionReason ? (
              <div>
                <dt>{strings.userDetail.suspensionReason}</dt>
                <dd>{user.suspensionReason}</dd>
              </div>
            ) : null}
            {user.banExpires ? (
              <div>
                <dt>{strings.userDetail.suspensionExpiry}</dt>
                <dd>{formatPlatformDateTime(user.banExpires, locale)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className={styles.detailSection}>
          <h2>{strings.userDetail.quota}</h2>
          <dl className={styles.quotaList}>
            <div>
              <dt>{strings.userDetail.effectiveLimit}</dt>
              <dd>
                {formatPlatformNumber(user.quota.effective, locale)}
                <small>
                  {user.quota.configured === null
                    ? strings.common.defaultValue
                    : strings.common.configured}
                </small>
              </dd>
            </div>
            <div>
              <dt>{strings.userDetail.configuredLimit}</dt>
              <dd>
                {user.quota.configured === null
                  ? "—"
                  : formatPlatformNumber(user.quota.configured, locale)}
              </dd>
            </div>
          </dl>
          <h3>{strings.userDetail.deletion}</h3>
          {user.deletionRequest ? (
            <dl className={styles.factGrid}>
              <div>
                <dt>{strings.common.status}</dt>
                <dd>
                  <PlatformStatusBadge
                    state={user.deletionRequest.state}
                    label={strings.common.stateLabel(
                      user.deletionRequest.state,
                    )}
                  />
                </dd>
              </div>
              <div>
                <dt>{strings.userDetail.deletionRequested}</dt>
                <dd>
                  {formatPlatformDateTime(
                    user.deletionRequest.requestedAt,
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{strings.userDetail.coolingOffEnds}</dt>
                <dd>
                  {formatPlatformDateTime(
                    user.deletionRequest.coolingOffEndsAt,
                    locale,
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.emptyInline}>
              {strings.userDetail.noDeletion}
            </p>
          )}
        </section>

        <section className={styles.detailSection} data-wide="true">
          <div className={styles.sectionHeader}>
            <div>
              <h2>{strings.userDetail.sessions}</h2>
              <p>{strings.userDetail.sessionsDescription}</p>
            </div>
          </div>
          {user.sessions.length ? (
            <ol className={styles.membershipList}>
              {user.sessions.map((session, index) => (
                <li
                  key={`${session.createdAt.toISOString()}-${session.expiresAt.toISOString()}-${index}`}
                >
                  <div className={styles.membershipHeader}>
                    <strong>
                      {strings.userDetail.sessions} {index + 1}
                    </strong>
                    <PlatformStatusBadge
                      state="ACTIVE"
                      label={strings.common.active}
                    />
                  </div>
                  <div className={styles.membershipMeta}>
                    <span>
                      {strings.userDetail.sessionStarted}:{" "}
                      {formatPlatformDateTime(session.createdAt, locale)}
                    </span>
                    <span>
                      {strings.userDetail.sessionExpires}:{" "}
                      {formatPlatformDateTime(session.expiresAt, locale)}
                    </span>
                    <span>
                      {strings.userDetail.platformVerified}:{" "}
                      {session.platformAuthenticatedAt
                        ? formatPlatformDateTime(
                            session.platformAuthenticatedAt,
                            locale,
                          )
                        : strings.common.no}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyInline}>
              {strings.userDetail.noSessions}
            </p>
          )}
        </section>

        <section className={styles.detailSection}>
          <h2>{strings.userDetail.ownedBooths}</h2>
          {user.ownedBooths.length ? (
            <ol className={styles.membershipList}>
              {user.ownedBooths.map((booth) => (
                <li key={booth.id}>
                  <div className={styles.membershipHeader}>
                    <div>
                      <strong>{booth.name}</strong>
                      <small>/{booth.slug}</small>
                    </div>
                    <PlatformStatusBadge
                      state={booth.serviceState}
                      label={strings.common.stateLabel(booth.serviceState)}
                    />
                  </div>
                  <div className={styles.membershipMeta}>
                    <span>{strings.common.stateLabel(booth.status)}</span>
                    <span>{shortPlatformId(booth.id, 14)}</span>
                  </div>
                  <Link
                    className={styles.inlineLink}
                    href={`/admin/booths/${encodeURIComponent(booth.id)}`}
                  >
                    {strings.booths.openBooth}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyInline}>
              {strings.userDetail.noOwnedBooths}
            </p>
          )}
        </section>

        <section className={styles.detailSection}>
          <h2>{strings.userDetail.joinedBooths}</h2>
          {user.memberships.length ? (
            <ol className={styles.membershipList}>
              {user.memberships.map((membership) => (
                <li key={membership.id}>
                  <div className={styles.membershipHeader}>
                    <div>
                      <strong>{membership.booth.name}</strong>
                      <small>/{membership.booth.slug}</small>
                    </div>
                    <PlatformStatusBadge
                      state={membership.status}
                      label={strings.common.stateLabel(membership.status)}
                    />
                  </div>
                  <div className={styles.membershipMeta}>
                    <span>{strings.common.roleLabel(membership.role)}</span>
                    <span>{shortPlatformId(membership.booth.id, 14)}</span>
                  </div>
                  <Link
                    className={styles.inlineLink}
                    href={`/admin/booths/${encodeURIComponent(membership.booth.id)}`}
                  >
                    {strings.booths.openBooth}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyInline}>
              {strings.userDetail.noJoinedBooths}
            </p>
          )}
        </section>

        <section className={styles.detailSection} data-wide="true">
          <h2>{strings.userDetail.audit}</h2>
          <PlatformAuditList
            audit={user.audit}
            emptyMessage={strings.userDetail.noAudit}
            locale={locale}
          />
        </section>
      </div>
    </>
  );
}
