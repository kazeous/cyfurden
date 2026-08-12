import type { Metadata } from "next";
import Link from "next/link";
import {
  PlatformPageHeader,
  PlatformPagination,
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
import {
  firstSearchParam,
  readPlatformStorage,
} from "@/lib/platform-inventory";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getPlatformAdminStrings(await readLocaleCookie());
  return { title: strings.storage.metadataTitle };
}

export default async function PlatformStoragePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const [access, locale] = await Promise.all([
    requirePlatformPermission("platform.read"),
    readLocaleCookie(),
  ]);
  const inventory = await readPlatformStorage(access, {
    page: firstSearchParam(raw.page),
    search: firstSearchParam(raw.q),
  });
  const strings = getPlatformAdminStrings(locale);

  return (
    <>
      <PlatformPageHeader
        title={strings.storage.title}
        description={strings.storage.description}
        actions={
          <span className={styles.readOnlyChip}>{strings.shell.readOnly}</span>
        }
      />

      <section
        className={styles.inventorySection}
        style={{ marginTop: "var(--space-lg)" }}
      >
        <dl className={styles.metricList}>
          <div>
            <dt>{strings.storage.tracked}</dt>
            <dd>
              {formatPlatformBytes(inventory.totals.trackedBytes, locale)}
            </dd>
          </div>
          <div>
            <dt>{strings.storage.reserved}</dt>
            <dd>
              {formatPlatformBytes(inventory.totals.reservedBytes, locale)}
            </dd>
          </div>
          <div>
            <dt>{strings.storage.drift}</dt>
            <dd>{formatPlatformBytes(inventory.totals.driftBytes, locale)}</dd>
          </div>
          <div>
            <dt>{strings.storage.configuredQuota}</dt>
            <dd>
              {formatPlatformBytes(
                inventory.totals.configuredQuotaBytes,
                locale,
              )}
            </dd>
          </div>
        </dl>
        <div className={styles.publicationLine}>
          <span>
            {strings.storage.tracked}:{" "}
            {formatPlatformNumber(inventory.totals.trackedObjects, locale)}
          </span>
          <span>
            {strings.storage.reserved}:{" "}
            {formatPlatformNumber(inventory.totals.reservedObjects, locale)}
          </span>
          <span>
            {strings.storage.drift}:{" "}
            {formatPlatformNumber(inventory.totals.driftObjects, locale)}
          </span>
        </div>
      </section>

      <section className={styles.filterPanel}>
        <h2>{strings.storage.searchLabel}</h2>
        <form className={styles.filterGrid} method="get">
          <div className={styles.field}>
            <label htmlFor="storage-search">
              {strings.storage.searchLabel}
            </label>
            <input
              defaultValue={inventory.query}
              id="storage-search"
              maxLength={100}
              name="q"
              placeholder={strings.storage.searchPlaceholder}
              type="search"
            />
          </div>
          <div className={styles.filterActions}>
            <button className={styles.button} type="submit">
              {strings.common.search}
            </button>
            {inventory.query ? (
              <Link className={styles.secondaryButton} href="/admin/storage">
                {strings.common.clear}
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <div className={styles.tableWrap}>
        {inventory.booths.length ? (
          <>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>{strings.storage.booth}</th>
                  <th>{strings.common.status}</th>
                  <th>{strings.storage.ledger}</th>
                  <th>{strings.storage.quota}</th>
                  <th>{strings.storage.reconciliation}</th>
                </tr>
              </thead>
              <tbody>
                {inventory.booths.map((booth) => (
                  <tr key={booth.id}>
                    <td>
                      <div className={styles.identityCell}>
                        <strong>{booth.name}</strong>
                        <small>/{booth.slug}</small>
                        <small>{shortPlatformId(booth.id, 14)}</small>
                        <Link
                          className={styles.inlineLink}
                          href={`/admin/booths/${encodeURIComponent(booth.id)}`}
                        >
                          {strings.storage.openBooth}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <PlatformStatusBadge
                        state={booth.serviceState}
                        label={strings.common.stateLabel(booth.serviceState)}
                      />
                    </td>
                    <td>
                      <div className={styles.resourceStack}>
                        <span>
                          {strings.storage.tracked}:{" "}
                          {formatPlatformBytes(booth.trackedBytes, locale)}
                        </span>
                        <small>
                          {strings.storage.reserved}:{" "}
                          {formatPlatformBytes(booth.reservedBytes, locale)}
                        </small>
                        <small>
                          {strings.storage.drift}:{" "}
                          {formatPlatformBytes(booth.driftBytes, locale)}
                        </small>
                      </div>
                    </td>
                    <td className={styles.numeric}>
                      {formatPlatformBytes(booth.quotaBytes, locale)}
                    </td>
                    <td>
                      <div className={styles.stateStack}>
                        {booth.lastReconciliationStatus ? (
                          <PlatformStatusBadge
                            state={booth.lastReconciliationStatus}
                            label={strings.common.stateLabel(
                              booth.lastReconciliationStatus,
                            )}
                          />
                        ) : null}
                        <small>
                          {booth.lastReconciliationAt
                            ? formatPlatformDateTime(
                                booth.lastReconciliationAt,
                                locale,
                              )
                            : strings.storage.neverReconciled}
                        </small>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ol className={styles.mobileList}>
              {inventory.booths.map((booth) => (
                <li className={styles.resourceCard} key={booth.id}>
                  <div className={styles.resourceCardHeader}>
                    <div>
                      <strong>{booth.name}</strong>
                      <small>/{booth.slug}</small>
                    </div>
                    <PlatformStatusBadge
                      state={booth.serviceState}
                      label={strings.common.stateLabel(booth.serviceState)}
                    />
                  </div>
                  <div className={styles.resourceCardFacts}>
                    <div>
                      <span>{strings.storage.tracked}</span>
                      <strong>
                        {formatPlatformBytes(booth.trackedBytes, locale)}
                      </strong>
                    </div>
                    <div>
                      <span>{strings.storage.reserved}</span>
                      <strong>
                        {formatPlatformBytes(booth.reservedBytes, locale)}
                      </strong>
                    </div>
                    <div>
                      <span>{strings.storage.drift}</span>
                      <strong>
                        {formatPlatformBytes(booth.driftBytes, locale)}
                      </strong>
                    </div>
                    <div>
                      <span>{strings.storage.quota}</span>
                      <strong>
                        {formatPlatformBytes(booth.quotaBytes, locale)}
                      </strong>
                    </div>
                  </div>
                  <div className={styles.resourceCardFooter}>
                    <small className={styles.muted}>
                      {booth.lastReconciliationAt
                        ? formatPlatformDateTime(
                            booth.lastReconciliationAt,
                            locale,
                          )
                        : strings.storage.neverReconciled}
                    </small>
                    <Link
                      className={styles.inlineLink}
                      href={`/admin/booths/${encodeURIComponent(booth.id)}`}
                    >
                      {strings.storage.openBooth}
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className={styles.emptyState}>
            <h2>{strings.common.noResults}</h2>
            <p>{strings.common.noResultsHelp}</p>
          </div>
        )}
      </div>

      <PlatformPagination
        basePath="/admin/storage"
        locale={locale}
        page={inventory.pagination.page}
        params={{ q: inventory.query }}
        total={inventory.pagination.total}
        totalPages={inventory.pagination.totalPages}
      />
    </>
  );
}
