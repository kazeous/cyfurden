"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useState } from "react";
import {
  platformBoothLifecycleAction,
  platformUserLifecycleAction,
  type PlatformLifecycleActionState,
} from "@/app/admin/actions";
import type { Locale } from "@/lib/i18n";
import {
  getPlatformAdminStrings,
  type PlatformAdminCatalogue,
} from "@/lib/i18n/platform-admin";
import type { PlatformRoleName } from "@/lib/platform-policy";
import styles from "./platform-admin.module.css";

const initialPlatformLifecycleActionState = {
  status: "idle",
  message: "",
} satisfies PlatformLifecycleActionState;

function ActionFeedback({
  state,
  strings,
}: {
  state: PlatformLifecycleActionState;
  strings: PlatformAdminCatalogue;
}) {
  const pathname = usePathname();
  if (!state.message) return null;
  const stepUpHref = `/account/security?returnTo=${encodeURIComponent(pathname)}`;
  return (
    <div
      className={styles.actionFeedback}
      data-status={state.status}
      role={state.status === "error" ? "alert" : "status"}
    >
      <strong>{state.message}</strong>
      {state.details?.length ? (
        <ul>
          {state.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      {state.code === "STEP_UP_REQUIRED" ? (
        <Link className={styles.inlineLink} href={stepUpHref}>
          {strings.lifecycle.refreshStepUp}
        </Link>
      ) : null}
    </div>
  );
}

function ReasonField({ strings }: { strings: PlatformAdminCatalogue }) {
  return (
    <label className={styles.actionField}>
      <span>{strings.lifecycle.reason}</span>
      <textarea
        maxLength={500}
        minLength={1}
        name="reason"
        placeholder={strings.lifecycle.reasonPlaceholder}
        required
        rows={3}
      />
    </label>
  );
}

export function PlatformUserLifecycleControls({
  email,
  locale,
  platformRole,
  state: targetState,
  targetUserId,
}: {
  email: string;
  locale: Locale;
  platformRole: PlatformRoleName;
  state: "ACTIVE" | "SUSPENDED" | "DELETION_PENDING";
  targetUserId: string;
}) {
  const strings = getPlatformAdminStrings(locale);
  const [state, action, pending] = useActionState(
    platformUserLifecycleAction,
    initialPlatformLifecycleActionState,
  );
  const [intent, setIntent] = useState(
    targetState === "ACTIVE"
      ? "suspend"
      : targetState === "SUSPENDED"
        ? "restore"
        : "cancel-deletion",
  );
  const canFinalize = platformRole === "PLATFORM_SUPER_ADMIN";
  const isPreview = intent === "preview-deletion";
  const isFinalize = intent === "finalize-deletion";

  return (
    <section className={styles.actionSection}>
      <header>
        <h2>{strings.userDetail.controls}</h2>
        <p>{strings.userDetail.controlsDescription}</p>
      </header>
      <form action={action} className={styles.actionForm}>
        <input name="targetUserId" type="hidden" value={targetUserId} />
        <label className={styles.actionField}>
          <span>{strings.common.status}</span>
          <select
            name="intent"
            onChange={(event) => setIntent(event.currentTarget.value)}
            value={intent}
          >
            {targetState === "ACTIVE" ? (
              <option value="suspend">{strings.userDetail.suspend}</option>
            ) : null}
            {targetState === "SUSPENDED" ? (
              <option value="restore">{strings.userDetail.restore}</option>
            ) : null}
            {targetState !== "DELETION_PENDING" ? (
              <>
                <option value="revoke-sessions">
                  {strings.userDetail.revokeSessions}
                </option>
                <option value="preview-deletion">
                  {strings.lifecycle.preview}
                </option>
                <option value="request-deletion">
                  {strings.userDetail.requestDeletion}
                </option>
              </>
            ) : (
              <>
                <option value="preview-deletion">
                  {strings.lifecycle.preview}
                </option>
                <option value="cancel-deletion">
                  {strings.userDetail.cancelDeletion}
                </option>
                {canFinalize ? (
                  <option value="finalize-deletion">
                    {strings.userDetail.finalizeDeletion}
                  </option>
                ) : null}
              </>
            )}
          </select>
        </label>
        {intent === "suspend" ? (
          <label className={styles.actionField}>
            <span>{strings.userDetail.suspensionExpiryOptional}</span>
            <input name="banExpires" type="datetime-local" />
          </label>
        ) : null}
        {!isPreview ? <ReasonField strings={strings} /> : null}
        {isFinalize ? (
          <label className={styles.actionField}>
            <span>{strings.userDetail.confirmationEmail}</span>
            <input
              autoComplete="off"
              name="confirmation"
              placeholder={email}
              required
              spellCheck={false}
            />
          </label>
        ) : null}
        <button className={styles.button} disabled={pending} type="submit">
          {pending ? strings.lifecycle.pending : strings.lifecycle.submit}
        </button>
      </form>
      <ActionFeedback state={state} strings={strings} />
    </section>
  );
}

type BoothMembership = {
  id: string;
  role: "OWNER" | "ADMIN" | "STAFF";
  status: "ACTIVE" | "DISABLED";
  user: { id: string; name: string; email: string };
};

export function PlatformBoothLifecycleControls({
  boothId,
  boothSlug,
  locale,
  memberships,
  platformRole,
  serviceState,
  serviceVersion,
}: {
  boothId: string;
  boothSlug: string;
  locale: Locale;
  memberships: BoothMembership[];
  platformRole: PlatformRoleName;
  serviceState: "ACTIVE" | "SUSPENDED" | "DELETION_PENDING";
  serviceVersion: number;
}) {
  const strings = getPlatformAdminStrings(locale);
  const [state, action, pending] = useActionState(
    platformBoothLifecycleAction,
    initialPlatformLifecycleActionState,
  );
  const [intent, setIntent] = useState(
    serviceState === "ACTIVE"
      ? "suspend"
      : serviceState === "SUSPENDED"
        ? "restore"
        : "cancel-deletion",
  );
  const nonOwners = memberships.filter(
    (membership) => membership.role !== "OWNER",
  );
  const activeRecipients = nonOwners.filter(
    (membership) => membership.status === "ACTIVE",
  );
  const canFinalize = platformRole === "PLATFORM_SUPER_ADMIN";
  const isPreview = intent === "preview-deletion";
  const isFinalize = intent === "finalize-deletion";

  return (
    <section className={styles.actionSection}>
      <header>
        <h2>{strings.boothDetail.controls}</h2>
        <p>{strings.boothDetail.controlsDescription}</p>
      </header>
      <form action={action} className={styles.actionForm}>
        <input name="boothId" type="hidden" value={boothId} />
        <input name="expectedVersion" type="hidden" value={serviceVersion} />
        <label className={styles.actionField}>
          <span>{strings.common.status}</span>
          <select
            name="intent"
            onChange={(event) => setIntent(event.currentTarget.value)}
            value={intent}
          >
            {serviceState === "ACTIVE" ? (
              <option value="suspend">{strings.boothDetail.suspend}</option>
            ) : null}
            {serviceState === "SUSPENDED" ? (
              <option value="restore">{strings.boothDetail.restore}</option>
            ) : null}
            {serviceState !== "DELETION_PENDING" ? (
              <>
                <option value="preview-deletion">
                  {strings.lifecycle.preview}
                </option>
                <option value="request-deletion">
                  {strings.boothDetail.requestDeletion}
                </option>
              </>
            ) : (
              <>
                <option value="preview-deletion">
                  {strings.lifecycle.preview}
                </option>
                <option value="cancel-deletion">
                  {strings.boothDetail.cancelDeletion}
                </option>
                {canFinalize ? (
                  <option value="finalize-deletion">
                    {strings.boothDetail.finalizeDeletion}
                  </option>
                ) : null}
              </>
            )}
          </select>
        </label>
        {!isPreview ? <ReasonField strings={strings} /> : null}
        {isFinalize ? (
          <label className={styles.actionField}>
            <span>{strings.boothDetail.confirmationSlug}</span>
            <input
              autoComplete="off"
              name="confirmation"
              placeholder={boothSlug}
              required
              spellCheck={false}
            />
          </label>
        ) : null}
        <button className={styles.button} disabled={pending} type="submit">
          {pending ? strings.lifecycle.pending : strings.lifecycle.submit}
        </button>
      </form>

      {serviceState === "ACTIVE" && nonOwners.length ? (
        <form action={action} className={styles.actionForm}>
          <input name="boothId" type="hidden" value={boothId} />
          <input name="intent" type="hidden" value="membership" />
          <h3>{strings.boothDetail.membershipControl}</h3>
          <label className={styles.actionField}>
            <span>{strings.boothDetail.members}</span>
            <select name="membershipId" required>
              {nonOwners.map((membership) => (
                <option key={membership.id} value={membership.id}>
                  {membership.user.name} · {membership.user.email}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.actionFieldsInline}>
            <label className={styles.actionField}>
              <span>{strings.boothDetail.membershipRole}</span>
              <select name="membershipRole">
                <option value="ADMIN">
                  {strings.common.roleLabel("ADMIN")}
                </option>
                <option value="STAFF">
                  {strings.common.roleLabel("STAFF")}
                </option>
              </select>
            </label>
            <label className={styles.actionField}>
              <span>{strings.boothDetail.membershipStatus}</span>
              <select name="membershipStatus">
                <option value="ACTIVE">{strings.common.active}</option>
                <option value="DISABLED">{strings.common.disabled}</option>
              </select>
            </label>
          </div>
          <ReasonField strings={strings} />
          <button className={styles.button} disabled={pending} type="submit">
            {pending
              ? strings.lifecycle.pending
              : strings.boothDetail.updateMembership}
          </button>
        </form>
      ) : null}

      {canFinalize && serviceState === "ACTIVE" && activeRecipients.length ? (
        <form action={action} className={styles.actionForm}>
          <input name="boothId" type="hidden" value={boothId} />
          <input name="expectedVersion" type="hidden" value={serviceVersion} />
          <h3>{strings.boothDetail.ownershipTransfer}</h3>
          <p>{strings.boothDetail.ownershipImpact}</p>
          <label className={styles.actionField}>
            <span>{strings.boothDetail.recipient}</span>
            <select name="recipientUserId" required>
              {activeRecipients.map((membership) => (
                <option key={membership.user.id} value={membership.user.id}>
                  {membership.user.name} · {membership.user.email}
                </option>
              ))}
            </select>
          </label>
          <ReasonField strings={strings} />
          <label className={styles.actionField}>
            <span>{strings.boothDetail.confirmationSlug}</span>
            <input
              autoComplete="off"
              name="confirmation"
              placeholder={boothSlug}
              required
              spellCheck={false}
            />
          </label>
          <div className={styles.actionButtons}>
            <button
              className={styles.secondaryButton}
              disabled={pending}
              formNoValidate
              name="intent"
              type="submit"
              value="preview-ownership"
            >
              {strings.boothDetail.previewTransfer}
            </button>
            <button
              className={styles.button}
              disabled={pending}
              name="intent"
              type="submit"
              value="finalize-ownership"
            >
              {strings.boothDetail.finalizeTransfer}
            </button>
          </div>
        </form>
      ) : null}
      <ActionFeedback state={state} strings={strings} />
    </section>
  );
}
