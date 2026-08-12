import type { Locale } from "@/lib/i18n";
import {
  formatPlatformDateTime,
  getPlatformAdminStrings,
  shortPlatformId,
} from "@/lib/i18n/platform-admin";
import { PlatformStatusBadge } from "./platform-admin-shell";
import styles from "./platform-admin.module.css";

type AuditRow = {
  id: string;
  actor: { id: string; name: string | null; email: string | null };
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  beforeMetadata: string | null;
  afterMetadata: string | null;
  correlationId: string;
  createdAt: Date;
};

export function PlatformAuditList({
  audit,
  locale,
  emptyMessage,
  compact = false,
}: {
  audit: AuditRow[];
  locale: Locale;
  emptyMessage: string;
  compact?: boolean;
}) {
  const strings = getPlatformAdminStrings(locale);
  if (!audit.length)
    return <p className={styles.emptyInline}>{emptyMessage}</p>;

  return (
    <ol className={styles.auditList} data-compact={compact || undefined}>
      {audit.map((event) => (
        <li key={event.id}>
          <div className={styles.auditHeadline}>
            <div>
              <strong>{event.action}</strong>
              <time dateTime={event.createdAt.toISOString()}>
                {formatPlatformDateTime(event.createdAt, locale)}
              </time>
            </div>
            <PlatformStatusBadge
              state={event.targetType}
              label={strings.common.targetLabel(event.targetType)}
            />
          </div>
          <dl className={styles.auditFacts}>
            <div>
              <dt>{strings.audit.actorLabel}</dt>
              <dd>
                {event.actor.name ||
                  event.actor.email ||
                  shortPlatformId(event.actor.id)}
              </dd>
            </div>
            <div>
              <dt>{strings.audit.target}</dt>
              <dd>
                {event.targetId ? shortPlatformId(event.targetId, 14) : "—"}
              </dd>
            </div>
            <div>
              <dt>{strings.audit.reason}</dt>
              <dd>{event.reason}</dd>
            </div>
          </dl>
          {!compact && (event.beforeMetadata || event.afterMetadata) ? (
            <div className={styles.auditMetadata}>
              {event.beforeMetadata ? (
                <div>
                  <span>{strings.audit.before}</span>
                  <code>{event.beforeMetadata}</code>
                </div>
              ) : null}
              {event.afterMetadata ? (
                <div>
                  <span>{strings.audit.after}</span>
                  <code>{event.afterMetadata}</code>
                </div>
              ) : null}
            </div>
          ) : null}
          {!compact ? (
            <p className={styles.correlation}>
              {strings.audit.correlation}:{" "}
              {shortPlatformId(event.correlationId, 18)}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
