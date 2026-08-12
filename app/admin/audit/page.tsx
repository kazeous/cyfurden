import type { Metadata } from "next";
import Link from "next/link";
import { PlatformAuditList } from "@/components/platform-admin/platform-audit-list";
import {
  PlatformPageHeader,
  PlatformPagination,
  platformAdminStyles as styles,
} from "@/components/platform-admin/platform-admin-shell";
import { getPlatformAdminStrings } from "@/lib/i18n/platform-admin";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { requirePlatformPermission } from "@/lib/platform-authorization";
import { firstSearchParam, readPlatformAudit } from "@/lib/platform-inventory";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getPlatformAdminStrings(await readLocaleCookie());
  return { title: strings.audit.metadataTitle };
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const [access, locale] = await Promise.all([
    requirePlatformPermission("audit.read"),
    readLocaleCookie(),
  ]);
  const inventory = await readPlatformAudit(access, {
    page: firstSearchParam(raw.page),
    actor: firstSearchParam(raw.actor),
    targetType: firstSearchParam(raw.targetType),
    targetId: firstSearchParam(raw.targetId),
    action: firstSearchParam(raw.action),
    from: firstSearchParam(raw.from),
    to: firstSearchParam(raw.to),
  });
  const strings = getPlatformAdminStrings(locale);
  const hasFilters = Object.values(inventory.filters).some(Boolean);

  return (
    <>
      <PlatformPageHeader
        title={strings.audit.title}
        description={strings.audit.description}
        actions={
          <span className={styles.readOnlyChip}>{strings.shell.readOnly}</span>
        }
      />

      <section className={styles.filterPanel}>
        <h2>{strings.audit.filters}</h2>
        <form className={styles.filterGrid} data-columns="audit" method="get">
          <div className={styles.field}>
            <label htmlFor="audit-actor">{strings.audit.actor}</label>
            <input
              defaultValue={inventory.filters.actor}
              id="audit-actor"
              maxLength={100}
              name="actor"
              placeholder={strings.audit.actorPlaceholder}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="audit-target-type">
              {strings.audit.targetType}
            </label>
            <select
              defaultValue={inventory.filters.targetType}
              id="audit-target-type"
              name="targetType"
            >
              <option value="">{strings.audit.allTargetTypes}</option>
              {inventory.targetTypes.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {strings.common.targetLabel(targetType)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="audit-target-id">{strings.audit.targetId}</label>
            <input
              defaultValue={inventory.filters.targetId}
              id="audit-target-id"
              maxLength={100}
              name="targetId"
              placeholder={strings.audit.targetPlaceholder}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="audit-action">{strings.audit.action}</label>
            <input
              defaultValue={inventory.filters.action}
              id="audit-action"
              maxLength={100}
              name="action"
              placeholder={strings.audit.actionPlaceholder}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="audit-from">{strings.audit.from}</label>
            <input
              defaultValue={inventory.filters.from}
              id="audit-from"
              name="from"
              type="date"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="audit-to">{strings.audit.to}</label>
            <input
              defaultValue={inventory.filters.to}
              id="audit-to"
              name="to"
              type="date"
            />
          </div>
          <div className={styles.filterActions}>
            <button className={styles.button} type="submit">
              {strings.audit.apply}
            </button>
            {hasFilters ? (
              <Link className={styles.secondaryButton} href="/admin/audit">
                {strings.common.clear}
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section
        className={styles.inventorySection}
        style={{ marginTop: "var(--space-lg)" }}
      >
        <PlatformAuditList
          audit={inventory.audit}
          emptyMessage={strings.audit.noAudit}
          locale={locale}
        />
      </section>

      <PlatformPagination
        basePath="/admin/audit"
        locale={locale}
        page={inventory.pagination.page}
        params={{
          actor: inventory.filters.actor,
          targetType: inventory.filters.targetType,
          targetId: inventory.filters.targetId,
          action: inventory.filters.action,
          from: inventory.filters.from,
          to: inventory.filters.to,
        }}
        total={inventory.pagination.total}
        totalPages={inventory.pagination.totalPages}
      />
    </>
  );
}
