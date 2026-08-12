import type { Metadata } from "next";
import Link from "next/link";
import {
  PlatformPageHeader,
  PlatformPagination,
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
import { firstSearchParam, readPlatformUsers } from "@/lib/platform-inventory";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getPlatformAdminStrings(await readLocaleCookie());
  return { title: strings.users.metadataTitle };
}

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const [access, locale] = await Promise.all([
    requirePlatformPermission("platform.read"),
    readLocaleCookie(),
  ]);
  const inventory = await readPlatformUsers(access, {
    page: firstSearchParam(raw.page),
    search: firstSearchParam(raw.q),
  });
  const strings = getPlatformAdminStrings(locale);

  return (
    <>
      <PlatformPageHeader
        title={strings.users.title}
        description={strings.users.description}
        actions={
          <span className={styles.readOnlyChip}>{strings.shell.readOnly}</span>
        }
      />

      <section className={styles.filterPanel}>
        <h2>{strings.users.searchLabel}</h2>
        <form className={styles.filterGrid} method="get">
          <div className={styles.field}>
            <label htmlFor="user-search">{strings.users.searchLabel}</label>
            <input
              defaultValue={inventory.query}
              id="user-search"
              maxLength={100}
              name="q"
              placeholder={strings.users.searchPlaceholder}
              type="search"
            />
          </div>
          <div className={styles.filterActions}>
            <button className={styles.button} type="submit">
              {strings.common.search}
            </button>
            {inventory.query ? (
              <Link className={styles.secondaryButton} href="/admin/users">
                {strings.common.clear}
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <div className={styles.tableWrap}>
        {inventory.users.length ? (
          <>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>{strings.users.identity}</th>
                  <th>{strings.users.access}</th>
                  <th>{strings.users.sessions}</th>
                  <th>{strings.users.booths}</th>
                  <th>{strings.users.limit}</th>
                  <th>{strings.users.created}</th>
                </tr>
              </thead>
              <tbody>
                {inventory.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className={styles.identityCell}>
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                        <small className={styles.mono}>
                          {shortPlatformId(user.id, 14)}
                        </small>
                        <Link
                          className={styles.inlineLink}
                          href={`/admin/users/${encodeURIComponent(user.id)}`}
                        >
                          {strings.users.openUser}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <div className={styles.stateStack}>
                        <PlatformStatusBadge
                          state={user.state}
                          label={strings.common.stateLabel(user.state)}
                        />
                        <small>
                          {user.emailVerified
                            ? strings.common.verified
                            : strings.common.unverified}
                        </small>
                      </div>
                    </td>
                    <td className={styles.numeric}>
                      {strings.users.activeSessions(user.activeSessionCount)}
                    </td>
                    <td>
                      <div className={styles.resourceStack}>
                        <span>{strings.users.owned(user.ownedBoothCount)}</span>
                        <small>
                          {strings.users.joined(user.joinedBoothCount)}
                        </small>
                      </div>
                    </td>
                    <td className={styles.numeric}>
                      {formatPlatformNumber(
                        user.effectiveOwnedBoothLimit,
                        locale,
                      )}
                    </td>
                    <td>{formatPlatformDateTime(user.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ol className={styles.mobileList}>
              {inventory.users.map((user) => (
                <li className={styles.resourceCard} key={user.id}>
                  <div className={styles.resourceCardHeader}>
                    <div>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </div>
                    <PlatformStatusBadge
                      state={user.state}
                      label={strings.common.stateLabel(user.state)}
                    />
                  </div>
                  <div className={styles.resourceCardFacts}>
                    <div>
                      <span>{strings.users.sessions}</span>
                      <strong>
                        {strings.users.activeSessions(user.activeSessionCount)}
                      </strong>
                    </div>
                    <div>
                      <span>{strings.users.booths}</span>
                      <strong>
                        {strings.users.owned(user.ownedBoothCount)}
                      </strong>
                    </div>
                    <div>
                      <span>{strings.users.limit}</span>
                      <strong>
                        {formatPlatformNumber(
                          user.effectiveOwnedBoothLimit,
                          locale,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>{strings.users.created}</span>
                      <strong>
                        {formatPlatformDateTime(user.createdAt, locale)}
                      </strong>
                    </div>
                  </div>
                  <div className={styles.resourceCardFooter}>
                    <small className={styles.muted}>
                      {shortPlatformId(user.id, 16)}
                    </small>
                    <Link
                      className={styles.inlineLink}
                      href={`/admin/users/${encodeURIComponent(user.id)}`}
                    >
                      {strings.users.openUser}
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
        basePath="/admin/users"
        locale={locale}
        page={inventory.pagination.page}
        params={{ q: inventory.query }}
        total={inventory.pagination.total}
        totalPages={inventory.pagination.totalPages}
      />
    </>
  );
}
