"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import {
  inviteTeamMemberAction,
  removeTeamMemberAction,
  revokeTeamInvitationAction,
  updateTeamMemberAction,
  type TeamInviteState,
  type TeamMutationState,
} from "../actions";
import styles from "./team.module.css";

const emptyInviteState: TeamInviteState = {};
const emptyMutationState: TeamMutationState = {};
const subscribeToOrigin = () => () => undefined;
const readBrowserOrigin = () => window.location.origin;
const readServerOrigin = () => "";

export function InviteMemberForm({
  boothId,
  remainingSlots,
  locale,
}: {
  boothId: string;
  remainingSlots: number;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).team;
  const [state, formAction, pending] = useActionState(
    inviteTeamMemberAction,
    emptyInviteState,
  );
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    readBrowserOrigin,
    readServerOrigin,
  );

  const invitationUrl = state.invitationPath
    ? `${origin}${state.invitationPath}`
    : "";

  async function copyInvitation() {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.inviteFormWrap}>
      <div className={styles.cardHeading}>
        <div>
          <p className={styles.cardEyebrow}>{strings.addAccess}</p>
          <h2>{strings.inviteTitle}</h2>
        </div>
        <span className={styles.slotBadge}>
          {strings.placesLeft(remainingSlots)}
        </span>
      </div>
      <p className={styles.cardIntro}>{strings.inviteIntro}</p>
      <form action={formAction} className={styles.inviteForm}>
        <input type="hidden" name="boothId" value={boothId} />
        <label>
          <span>{strings.email}</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="artist@example.com"
            required
          />
        </label>
        <label>
          <span>{strings.role}</span>
          <select name="role" defaultValue="STAFF">
            <option value="STAFF">{strings.staffRole}</option>
            <option value="ADMIN">{strings.adminRole}</option>
          </select>
        </label>
        <p className={styles.formError} role="alert" aria-live="polite">
          {state.error ?? ""}
        </p>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={pending}
        >
          {pending ? strings.creatingLink : strings.createLink}
        </button>
      </form>
      {state.invitationPath ? (
        <div className={styles.invitationResult} role="status">
          <strong>{strings.invitationReady(state.invitedEmail ?? "")}</strong>
          <p>{strings.copyInstruction}</p>
          <div className={styles.copyRow}>
            <input
              aria-label={strings.invitationLinkAria}
              readOnly
              value={invitationUrl}
            />
            <button type="button" onClick={copyInvitation}>
              {copied ? strings.copied : strings.copyLink}
            </button>
          </div>
          <small>{strings.expiresHelp}</small>
        </div>
      ) : null}
    </div>
  );
}

export function RevokeInvitationForm({
  boothId,
  invitationId,
  locale,
}: {
  boothId: string;
  invitationId: string;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).team;
  const [state, formAction, pending] = useActionState(
    revokeTeamInvitationAction,
    emptyMutationState,
  );

  return (
    <form action={formAction} className={styles.inlineForm}>
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      {state.error ? (
        <span className={styles.inlineError} role="alert">
          {state.error}
        </span>
      ) : null}
      <button className={styles.ghostButton} type="submit" disabled={pending}>
        {pending ? strings.revoking : strings.revoke}
      </button>
    </form>
  );
}

export function MemberAccessForm({
  boothId,
  membershipId,
  role,
  status,
  memberName,
  locale,
}: {
  boothId: string;
  membershipId: string;
  role: "ADMIN" | "STAFF";
  status: "ACTIVE" | "DISABLED";
  memberName: string;
  locale: Locale;
}) {
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.team;
  const [state, formAction, pending] = useActionState(
    updateTeamMemberAction,
    emptyMutationState,
  );

  return (
    <form action={formAction} className={styles.memberEditForm}>
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <label>
        <span className={styles.srOnly}>{strings.roleFor(memberName)}</span>
        <select key={role} name="role" defaultValue={role} disabled={pending}>
          <option value="STAFF">{workspaceStrings.common.staff}</option>
          <option value="ADMIN">{workspaceStrings.common.admin}</option>
        </select>
      </label>
      <label>
        <span className={styles.srOnly}>{strings.statusFor(memberName)}</span>
        <select
          key={status}
          name="status"
          defaultValue={status}
          disabled={pending}
        >
          <option value="ACTIVE">{workspaceStrings.common.active}</option>
          <option value="DISABLED">{workspaceStrings.common.disabled}</option>
        </select>
      </label>
      <button className={styles.ghostButton} type="submit" disabled={pending}>
        {pending ? strings.saving : strings.save}
      </button>
      {state.error ? (
        <span className={styles.inlineError} role="alert">
          {state.error}
        </span>
      ) : state.success ? (
        <span className={styles.inlineSuccess} role="status">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}

export function RemoveMemberForm({
  boothId,
  membershipId,
  memberName,
  locale,
}: {
  boothId: string;
  membershipId: string;
  memberName: string;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).team;
  const [state, formAction, pending] = useActionState(
    removeTeamMemberAction,
    emptyMutationState,
  );

  return (
    <form
      action={formAction}
      className={styles.removeForm}
      onSubmit={(event) => {
        if (!window.confirm(strings.removeConfirm(memberName))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <button className={styles.dangerButton} type="submit" disabled={pending}>
        {pending ? strings.removing : strings.remove}
      </button>
      {state.error ? (
        <span className={styles.inlineError} role="alert">
          {state.error}
        </span>
      ) : state.success ? (
        <span className={styles.inlineSuccess} role="status">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}
