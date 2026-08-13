import Link from "next/link";
import { PlatformAuditList } from "@/components/platform-admin/platform-audit-list";
import { PlatformDefaultQuotaControls } from "@/components/platform-admin/platform-resource-controls";
import {
  PlatformPageHeader,
  PlatformStatusBadge,
  platformAdminStyles as styles,
} from "@/components/platform-admin/platform-admin-shell";
import {
  formatPlatformBytes,
  formatPlatformDateTime,
  formatPlatformNumber,
  getPlatformAdminStrings,
} from "@/lib/i18n/platform-admin";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { requirePlatformPermission } from "@/lib/platform-authorization";
import { readPlatformOverview } from "@/lib/platform-inventory";
import { platformRoleHasPermission } from "@/lib/platform-policy";

export default async function PlatformOverviewPage() {
  const [access, locale] = await Promise.all([
    requirePlatformPermission("platform.read"),
    readLocaleCookie(),
  ]);
  const [overview] = await Promise.all([readPlatformOverview(access)]);
  const strings = getPlatformAdminStrings(locale);

  return (
    <>
      <PlatformPageHeader
        title={strings.overview.title}
        description={strings.overview.description}
        actions={
          <span className={styles.readOnlyChip}>
            {platformRoleHasPermission(access.role, "quota.manage")
              ? strings.shell.mutationEnabled
              : strings.shell.readOnly}
          </span>
        }
      />

      {platformRoleHasPermission(access.role, "quota.manage") ? (
        <PlatformDefaultQuotaControls
          defaults={overview.quotaDefaults}
          locale={locale}
        />
      ) : null}

      <div className={styles.sectionGrid}>
        <section className={styles.inventorySection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{strings.overview.accounts}</h2>
              <p>{strings.overview.accountsDescription}</p>
            </div>
            <Link className={styles.inlineLink} href="/admin/users">
              {strings.shell.users}
            </Link>
          </div>
          <dl className={styles.metricList}>
            <div>
              <dt>{strings.overview.totalAccounts}</dt>
              <dd>{formatPlatformNumber(overview.accounts.total, locale)}</dd>
            </div>
            <div>
              <dt>{strings.overview.activeAccounts}</dt>
              <dd>{formatPlatformNumber(overview.accounts.active, locale)}</dd>
            </div>
            <div>
              <dt>{strings.overview.suspendedAccounts}</dt>
              <dd>
                {formatPlatformNumber(overview.accounts.suspended, locale)}
              </dd>
            </div>
            <div>
              <dt>{strings.overview.pendingAccounts}</dt>
              <dd>
                {formatPlatformNumber(
                  overview.accounts.pendingDeletion,
                  locale,
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.inventorySection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{strings.overview.booths}</h2>
              <p>{strings.overview.boothsDescription}</p>
            </div>
            <Link className={styles.inlineLink} href="/admin/booths">
              {strings.shell.booths}
            </Link>
          </div>
          <dl className={styles.metricList}>
            <div>
              <dt>{strings.overview.totalBooths}</dt>
              <dd>{formatPlatformNumber(overview.booths.total, locale)}</dd>
            </div>
            <div>
              <dt>{strings.overview.serviceActive}</dt>
              <dd>{formatPlatformNumber(overview.booths.active, locale)}</dd>
            </div>
            <div>
              <dt>{strings.overview.serviceSuspended}</dt>
              <dd>{formatPlatformNumber(overview.booths.suspended, locale)}</dd>
            </div>
            <div>
              <dt>{strings.overview.pendingBooths}</dt>
              <dd>
                {formatPlatformNumber(overview.booths.pendingDeletion, locale)}
              </dd>
            </div>
          </dl>
          <div className={styles.publicationLine}>
            <strong>{strings.overview.publicationBreakdown}</strong>
            <span>
              {strings.common.draft}:{" "}
              {formatPlatformNumber(overview.booths.draft, locale)}
            </span>
            <span>
              {strings.common.published}:{" "}
              {formatPlatformNumber(overview.booths.published, locale)}
            </span>
            <span>
              {strings.common.archived}:{" "}
              {formatPlatformNumber(overview.booths.archived, locale)}
            </span>
          </div>
        </section>

        <section className={styles.inventorySection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{strings.overview.storage}</h2>
              <p>{strings.overview.storageDescription}</p>
            </div>
            <Link className={styles.inlineLink} href="/admin/storage">
              {strings.shell.storage}
            </Link>
          </div>
          <dl className={styles.metricList}>
            <div>
              <dt>{strings.overview.tracked}</dt>
              <dd>
                {formatPlatformBytes(overview.storage.trackedBytes, locale)}
              </dd>
            </div>
            <div>
              <dt>{strings.overview.reserved}</dt>
              <dd>
                {formatPlatformBytes(overview.storage.reservedBytes, locale)}
              </dd>
            </div>
            <div>
              <dt>{strings.overview.drift}</dt>
              <dd>
                {formatPlatformBytes(overview.storage.driftBytes, locale)}
              </dd>
            </div>
            <div>
              <dt>{strings.overview.configuredQuota}</dt>
              <dd>
                {formatPlatformBytes(
                  overview.storage.configuredQuotaBytes,
                  locale,
                )}
              </dd>
            </div>
          </dl>
          <div className={styles.publicationLine}>
            <strong>{strings.overview.lastReconciliation}</strong>
            {overview.storage.lastReconciliationStatus ? (
              <PlatformStatusBadge
                state={overview.storage.lastReconciliationStatus}
                label={strings.common.stateLabel(
                  overview.storage.lastReconciliationStatus,
                )}
              />
            ) : null}
            <span>
              {formatPlatformDateTime(
                overview.storage.lastReconciliationAt,
                locale,
              )}
            </span>
          </div>
        </section>
      </div>

      <section
        className={styles.inventorySection}
        style={{ marginTop: "var(--space-lg)" }}
      >
        <div className={styles.sectionHeader}>
          <div>
            <h2>{strings.overview.recentAudit}</h2>
            <p>{strings.overview.recentAuditDescription}</p>
          </div>
          <Link className={styles.inlineLink} href="/admin/audit">
            {strings.overview.viewAudit}
          </Link>
        </div>
        <PlatformAuditList
          audit={overview.recentAudit}
          compact
          emptyMessage={strings.overview.noAudit}
          locale={locale}
        />
      </section>
    </>
  );
}
