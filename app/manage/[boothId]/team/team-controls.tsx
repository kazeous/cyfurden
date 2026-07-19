"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import {
  inviteTeamMemberAction,
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
}: {
  boothId: string;
  remainingSlots: number;
}) {
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
          <p className={styles.cardEyebrow}>Add access</p>
          <h2>Invite a teammate</h2>
        </div>
        <span className={styles.slotBadge}>
          {remainingSlots} {remainingSlots === 1 ? "place" : "places"} left
        </span>
      </div>
      <p className={styles.cardIntro}>
        Create a private link that expires in seven days. Share it directly;
        Cyfurden does not send invitation email yet.
      </p>
      <form action={formAction} className={styles.inviteForm}>
        <input type="hidden" name="boothId" value={boothId} />
        <label>
          <span>Email address</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="artist@example.com"
            required
          />
        </label>
        <label>
          <span>Role</span>
          <select name="role" defaultValue="STAFF">
            <option value="STAFF">Staff — orders and fulfilment</option>
            <option value="ADMIN">Admin — catalogue and storefront</option>
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
          {pending ? "Creating link..." : "Create invitation link"}
        </button>
      </form>
      {state.invitationPath ? (
        <div className={styles.invitationResult} role="status">
          <strong>Invitation ready for {state.invitedEmail}</strong>
          <p>Copy this one-time link and send it to your teammate.</p>
          <div className={styles.copyRow}>
            <input
              aria-label="Invitation link"
              readOnly
              value={invitationUrl}
            />
            <button type="button" onClick={copyInvitation}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <small>It expires after seven days or when revoked.</small>
        </div>
      ) : null}
    </div>
  );
}

export function RevokeInvitationForm({
  boothId,
  invitationId,
}: {
  boothId: string;
  invitationId: string;
}) {
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
        {pending ? "Revoking..." : "Revoke"}
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
}: {
  boothId: string;
  membershipId: string;
  role: "ADMIN" | "STAFF";
  status: "ACTIVE" | "DISABLED";
  memberName: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateTeamMemberAction,
    emptyMutationState,
  );

  return (
    <form action={formAction} className={styles.memberEditForm}>
      <input type="hidden" name="boothId" value={boothId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <label>
        <span className={styles.srOnly}>Role for {memberName}</span>
        <select name="role" defaultValue={role} disabled={pending}>
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admin</option>
        </select>
      </label>
      <label>
        <span className={styles.srOnly}>Status for {memberName}</span>
        <select name="status" defaultValue={status} disabled={pending}>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
        </select>
      </label>
      <button className={styles.ghostButton} type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
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
