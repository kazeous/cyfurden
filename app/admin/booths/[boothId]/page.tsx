import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformAuditList } from "@/components/platform-admin/platform-audit-list";
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
  shortPlatformId,
} from "@/lib/i18n/platform-admin";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { requirePlatformPermission } from "@/lib/platform-authorization";
import { readPlatformBoothDetail } from "@/lib/platform-inventory";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getPlatformAdminStrings(await readLocaleCookie());
  return { title: strings.boothDetail.metadataTitle };
}

export default async function PlatformBoothDetailPage({
  params,
}: {
  params: Promise<{ boothId: string }>;
}) {
  const { boothId } = await params;
  const [access, locale] = await Promise.all([
    requirePlatformPermission("platform.read"),
    readLocaleCookie(),
  ]);
  const booth = await readPlatformBoothDetail(access, boothId);
  if (!booth) notFound();
  const strings = getPlatformAdminStrings(locale);
  const usedSeats =
    booth.usage.activeTeamSeats + booth.usage.pendingInvitations;

  return (
    <>
      <PlatformPageHeader
        back={{ href: "/admin/booths", label: strings.boothDetail.back }}
        title={strings.boothDetail.title}
        description={strings.boothDetail.description}
        actions={
          <span className={styles.readOnlyChip}>{strings.shell.readOnly}</span>
        }
      />

      <div className={styles.detailGrid}>
        <section className={styles.detailSection}>
          <h2>{strings.boothDetail.identity}</h2>
          <dl className={styles.factGrid}>
            <div>
              <dt>{strings.common.identifier}</dt>
              <dd className={styles.mono}>{booth.id}</dd>
            </div>
            <div>
              <dt>{strings.boothDetail.publicSlug}</dt>
              <dd>/{booth.slug}</dd>
            </div>
            <div>
              <dt>{strings.boothDetail.serviceState}</dt>
              <dd>
                <PlatformStatusBadge
                  state={booth.serviceState}
                  label={strings.common.stateLabel(booth.serviceState)}
                />
              </dd>
            </div>
            <div>
              <dt>{strings.boothDetail.publicationState}</dt>
              <dd>
                <PlatformStatusBadge
                  state={booth.publicationState}
                  label={strings.common.stateLabel(booth.publicationState)}
                />
              </dd>
            </div>
            <div>
              <dt>{strings.common.owner}</dt>
              <dd>
                {booth.owner.name}
                <small>{booth.owner.email}</small>
              </dd>
            </div>
            <div>
              <dt>{strings.boothDetail.serviceVersion}</dt>
              <dd>{formatPlatformNumber(booth.serviceVersion, locale)}</dd>
            </div>
            <div>
              <dt>{strings.common.created}</dt>
              <dd>{formatPlatformDateTime(booth.createdAt, locale)}</dd>
            </div>
            <div>
              <dt>{strings.common.updated}</dt>
              <dd>{formatPlatformDateTime(booth.updatedAt, locale)}</dd>
            </div>
            {booth.serviceReason ? (
              <div>
                <dt>{strings.boothDetail.serviceReason}</dt>
                <dd>{booth.serviceReason}</dd>
              </div>
            ) : null}
            {booth.serviceStateChangedAt ? (
              <div>
                <dt>{strings.boothDetail.changedAt}</dt>
                <dd>
                  {formatPlatformDateTime(booth.serviceStateChangedAt, locale)}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className={styles.detailSection}>
          <h2>{strings.boothDetail.quota}</h2>
          <dl className={styles.quotaList}>
            <div>
              <dt>{strings.boothDetail.teamSeats}</dt>
              <dd>
                {formatPlatformNumber(usedSeats, locale)} /{" "}
                {formatPlatformNumber(booth.quota.maxTeamSeats, locale)}
                <span
                  className={styles.limitState}
                  data-over={booth.overLimit.teamSeats || undefined}
                >
                  {booth.overLimit.teamSeats
                    ? strings.boothDetail.overLimit
                    : strings.boothDetail.withinLimit}
                </span>
              </dd>
            </div>
            <div>
              <dt>{strings.boothDetail.products}</dt>
              <dd>
                {formatPlatformNumber(booth.usage.products, locale)} /{" "}
                {formatPlatformNumber(booth.quota.maxProducts, locale)}
                <span
                  className={styles.limitState}
                  data-over={booth.overLimit.products || undefined}
                >
                  {booth.overLimit.products
                    ? strings.boothDetail.overLimit
                    : strings.boothDetail.withinLimit}
                </span>
              </dd>
            </div>
            <div>
              <dt>{strings.boothDetail.facebooth}</dt>
              <dd>
                {formatPlatformNumber(booth.usage.faceboothProjects, locale)} /{" "}
                {formatPlatformNumber(booth.quota.maxFaceboothProjects, locale)}
                <span
                  className={styles.limitState}
                  data-over={booth.overLimit.faceboothProjects || undefined}
                >
                  {booth.overLimit.faceboothProjects
                    ? strings.boothDetail.overLimit
                    : strings.boothDetail.withinLimit}
                </span>
              </dd>
            </div>
            <div>
              <dt>{strings.boothDetail.storage}</dt>
              <dd>
                {formatPlatformBytes(booth.usage.countedStorageBytes, locale)} /{" "}
                {formatPlatformBytes(booth.quota.maxStorageBytes, locale)}
                <span
                  className={styles.limitState}
                  data-over={booth.overLimit.storage || undefined}
                >
                  {booth.overLimit.storage
                    ? strings.boothDetail.overLimit
                    : strings.boothDetail.withinLimit}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.detailSection} data-wide="true">
          <div className={styles.sectionHeader}>
            <div>
              <h2>{strings.boothDetail.members}</h2>
              <p>{strings.boothDetail.membersDescription}</p>
            </div>
          </div>
          <ol className={styles.membershipList}>
            {booth.memberships.map((membership) => (
              <li key={membership.id}>
                <div className={styles.membershipHeader}>
                  <div>
                    <strong>{membership.user.name}</strong>
                    <small>{membership.user.email}</small>
                  </div>
                  <PlatformStatusBadge
                    state={membership.status}
                    label={strings.common.stateLabel(membership.status)}
                  />
                </div>
                <div className={styles.membershipMeta}>
                  <span>{strings.common.roleLabel(membership.role)}</span>
                  <span>{shortPlatformId(membership.user.id, 14)}</span>
                  <span>
                    {strings.boothDetail.memberSince}:{" "}
                    {formatPlatformDateTime(membership.createdAt, locale)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.detailSection} data-wide="true">
          <div className={styles.sectionHeader}>
            <div>
              <h2>{strings.boothDetail.storageLedger}</h2>
              <p>{strings.boothDetail.storageDescription}</p>
            </div>
          </div>
          {booth.storage.length ? (
            <>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>{strings.boothDetail.purpose}</th>
                    <th>{strings.boothDetail.objectState}</th>
                    <th>{strings.boothDetail.objects}</th>
                    <th>{strings.boothDetail.bytes}</th>
                  </tr>
                </thead>
                <tbody>
                  {booth.storage.map((group) => (
                    <tr key={`${group.purpose}-${group.state}`}>
                      <td>{strings.common.purposeLabel(group.purpose)}</td>
                      <td>
                        <PlatformStatusBadge
                          state={group.state}
                          label={strings.common.stateLabel(group.state)}
                        />
                      </td>
                      <td className={styles.numeric}>
                        {formatPlatformNumber(group.objectCount, locale)}
                      </td>
                      <td className={styles.numeric}>
                        {formatPlatformBytes(group.byteLength, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ol className={styles.mobileList}>
                {booth.storage.map((group) => (
                  <li
                    className={styles.resourceCard}
                    key={`${group.purpose}-${group.state}`}
                  >
                    <div className={styles.resourceCardHeader}>
                      <strong>
                        {strings.common.purposeLabel(group.purpose)}
                      </strong>
                      <PlatformStatusBadge
                        state={group.state}
                        label={strings.common.stateLabel(group.state)}
                      />
                    </div>
                    <div className={styles.resourceCardFacts}>
                      <div>
                        <span>{strings.boothDetail.objects}</span>
                        <strong>
                          {formatPlatformNumber(group.objectCount, locale)}
                        </strong>
                      </div>
                      <div>
                        <span>{strings.boothDetail.bytes}</span>
                        <strong>
                          {formatPlatformBytes(group.byteLength, locale)}
                        </strong>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className={styles.emptyInline}>
              {strings.boothDetail.noStorage}
            </p>
          )}
        </section>

        <section className={styles.detailSection}>
          <h2>{strings.boothDetail.reconciliation}</h2>
          {booth.latestReconciliation ? (
            <dl className={styles.factGrid}>
              <div>
                <dt>{strings.common.status}</dt>
                <dd>
                  <PlatformStatusBadge
                    state={booth.latestReconciliation.status}
                    label={strings.common.stateLabel(
                      booth.latestReconciliation.status,
                    )}
                  />
                </dd>
              </div>
              <div>
                <dt>{strings.common.updated}</dt>
                <dd>
                  {formatPlatformDateTime(
                    booth.latestReconciliation.completedAt ??
                      booth.latestReconciliation.createdAt,
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{strings.storage.tracked}</dt>
                <dd>
                  {formatPlatformNumber(
                    booth.latestReconciliation.trackedObjectCount,
                    locale,
                  )}{" "}
                  ·{" "}
                  {formatPlatformBytes(
                    booth.latestReconciliation.trackedBytes,
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{strings.storage.reserved}</dt>
                <dd>
                  {formatPlatformNumber(
                    booth.latestReconciliation.reservedObjectCount,
                    locale,
                  )}{" "}
                  ·{" "}
                  {formatPlatformBytes(
                    booth.latestReconciliation.reservedBytes,
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{strings.storage.drift}</dt>
                <dd>
                  {formatPlatformNumber(
                    booth.latestReconciliation.untrackedObjectCount,
                    locale,
                  )}{" "}
                  ·{" "}
                  {formatPlatformBytes(
                    booth.latestReconciliation.untrackedBytes,
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{strings.common.targetLabel("missing")}</dt>
                <dd>
                  {formatPlatformNumber(
                    booth.latestReconciliation.missingObjectCount,
                    locale,
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.emptyInline}>
              {strings.boothDetail.noReconciliation}
            </p>
          )}
        </section>

        <section className={styles.detailSection}>
          <h2>{strings.boothDetail.deletion}</h2>
          <dl className={styles.factGrid}>
            <div>
              <dt>{strings.boothDetail.orderBlockers}</dt>
              <dd>
                {formatPlatformNumber(
                  booth.deletionBlockers.retainedOrderReferences,
                  locale,
                )}
              </dd>
            </div>
            {booth.deletionRequest ? (
              <>
                <div>
                  <dt>{strings.common.status}</dt>
                  <dd>
                    <PlatformStatusBadge
                      state={booth.deletionRequest.state}
                      label={strings.common.stateLabel(
                        booth.deletionRequest.state,
                      )}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{strings.userDetail.coolingOffEnds}</dt>
                  <dd>
                    {formatPlatformDateTime(
                      booth.deletionRequest.coolingOffEndsAt,
                      locale,
                    )}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          <p className={styles.dangerNote}>{strings.boothDetail.blockerNote}</p>
        </section>

        <section className={styles.detailSection} data-wide="true">
          <h2>{strings.boothDetail.audit}</h2>
          <PlatformAuditList
            audit={booth.audit}
            emptyMessage={strings.boothDetail.noAudit}
            locale={locale}
          />
        </section>
      </div>
    </>
  );
}
