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
  getPlatformAdminStrings,
  shortPlatformId,
} from "@/lib/i18n/platform-admin";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { requirePlatformPermission } from "@/lib/platform-authorization";
import { firstSearchParam, readPlatformBooths } from "@/lib/platform-inventory";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getPlatformAdminStrings(await readLocaleCookie());
  return { title: strings.booths.metadataTitle };
}

export default async function PlatformBoothsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const [access, locale] = await Promise.all([
    requirePlatformPermission("platform.read"),
    readLocaleCookie(),
  ]);
  const inventory = await readPlatformBooths(access, {
    page: firstSearchParam(raw.page),
    search: firstSearchParam(raw.q),
  });
  const strings = getPlatformAdminStrings(locale);

  return (
    <>
      <PlatformPageHeader
        title={strings.booths.title}
        description={strings.booths.description}
        actions={
          <span className={styles.readOnlyChip}>{strings.shell.readOnly}</span>
        }
      />

      <section className={styles.filterPanel}>
        <h2>{strings.booths.searchLabel}</h2>
        <form className={styles.filterGrid} method="get">
          <div className={styles.field}>
            <label htmlFor="booth-search">{strings.booths.searchLabel}</label>
            <input
              defaultValue={inventory.query}
              id="booth-search"
              maxLength={100}
              name="q"
              placeholder={strings.booths.searchPlaceholder}
              type="search"
            />
          </div>
          <div className={styles.filterActions}>
            <button className={styles.button} type="submit">
              {strings.common.search}
            </button>
            {inventory.query ? (
              <Link className={styles.secondaryButton} href="/admin/booths">
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
                  <th>{strings.booths.booth}</th>
                  <th>{strings.booths.state}</th>
                  <th>{strings.booths.owner}</th>
                  <th>{strings.booths.resources}</th>
                  <th>{strings.booths.storage}</th>
                  <th>{strings.common.updated}</th>
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
                          {strings.booths.openBooth}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <div className={styles.stateStack}>
                        <PlatformStatusBadge
                          state={booth.serviceState}
                          label={strings.common.stateLabel(booth.serviceState)}
                        />
                        <PlatformStatusBadge
                          state={booth.publicationState}
                          label={strings.common.stateLabel(
                            booth.publicationState,
                          )}
                        />
                      </div>
                    </td>
                    <td>
                      <div className={styles.identityCell}>
                        <strong>{booth.owner.name}</strong>
                        <small>{booth.owner.email}</small>
                      </div>
                    </td>
                    <td>
                      <div className={styles.resourceStack}>
                        <span>
                          {strings.booths.teamSeats(booth.activeTeamSeats)}
                        </span>
                        <small>
                          {strings.booths.products(booth.productCount)}
                        </small>
                        <small>
                          {strings.booths.facebooth(
                            booth.faceboothProjectCount,
                          )}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className={styles.resourceStack}>
                        <span>
                          {formatPlatformBytes(
                            booth.trackedStorageBytes,
                            locale,
                          )}
                        </span>
                        <small>
                          +{" "}
                          {formatPlatformBytes(
                            booth.reservedStorageBytes,
                            locale,
                          )}{" "}
                          {strings.overview.reserved.toLowerCase()}
                        </small>
                        <small>
                          /{" "}
                          {formatPlatformBytes(
                            booth.effectiveStorageQuotaBytes,
                            locale,
                          )}
                        </small>
                      </div>
                    </td>
                    <td>{formatPlatformDateTime(booth.updatedAt, locale)}</td>
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
                      <span>{strings.booths.owner}</span>
                      <strong>{booth.owner.name}</strong>
                    </div>
                    <div>
                      <span>{strings.booths.state}</span>
                      <strong>
                        {strings.common.stateLabel(booth.publicationState)}
                      </strong>
                    </div>
                    <div>
                      <span>{strings.booths.resources}</span>
                      <strong>
                        {strings.booths.products(booth.productCount)}
                      </strong>
                    </div>
                    <div>
                      <span>{strings.booths.storage}</span>
                      <strong>
                        {formatPlatformBytes(booth.trackedStorageBytes, locale)}
                      </strong>
                    </div>
                  </div>
                  <div className={styles.resourceCardFooter}>
                    <small className={styles.muted}>
                      {shortPlatformId(booth.id, 16)}
                    </small>
                    <Link
                      className={styles.inlineLink}
                      href={`/admin/booths/${encodeURIComponent(booth.id)}`}
                    >
                      {strings.booths.openBooth}
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
        basePath="/admin/booths"
        locale={locale}
        page={inventory.pagination.page}
        params={{ q: inventory.query }}
        total={inventory.pagination.total}
        totalPages={inventory.pagination.totalPages}
      />
    </>
  );
}
